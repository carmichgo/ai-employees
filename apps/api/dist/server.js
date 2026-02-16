import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { execSync, execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync as writeSync, appendFileSync } from "node:fs";
import { authPlugin } from "./plugins/auth.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { authRoutes } from "./routes/auth.js";
import { employeeRoutes } from "./routes/employees.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { provisionRoutes } from "./routes/provision.js";
import { fileRoutes } from "./routes/files.js";
import { triggerRoutes } from "./routes/triggers.js";
import { getSlackProxy } from "./slack/proxy.js";
export async function buildServer(config) {
    const isDev = process.env.NODE_ENV !== "production";
    const fastify = Fastify({
        logger: {
            level: "info",
            ...(isDev && {
                transport: {
                    target: "pino-pretty",
                },
            }),
        },
    });
    // Plugins
    await fastify.register(cors, {
        origin: [config.PLATFORM_URL, "http://localhost:3000"],
        credentials: true,
    });
    await fastify.register(jwt, {
        secret: config.JWT_SECRET,
        sign: { expiresIn: config.JWT_EXPIRES_IN },
    });
    await fastify.register(authPlugin);
    await fastify.register(errorHandlerPlugin);
    // Routes
    await fastify.register(authRoutes);
    await fastify.register(employeeRoutes);
    await fastify.register(dashboardRoutes);
    await fastify.register(provisionRoutes);
    await fastify.register(fileRoutes, { prefix: "/internal" });
    await fastify.register(triggerRoutes);
    // Health check (used by Vercel to verify droplet readiness)
    fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
    fastify.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
    // Debug endpoint — check Docker, worker, env
    fastify.get("/debug", async () => {
        const checks = {};
        try {
            checks.docker = execSync("docker info --format '{{.ServerVersion}}'", { timeout: 5000 }).toString().trim();
        }
        catch (e) {
            checks.docker = `error: ${e.message}`;
        }
        try {
            checks.containers = execSync("docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}'", { timeout: 5000 }).toString().trim() || "none";
        }
        catch (e) {
            checks.containers = `error: ${e.message}`;
        }
        try {
            checks.networks = execSync("docker network ls --format '{{.Name}}'", { timeout: 5000 }).toString().trim();
        }
        catch (e) {
            checks.networks = `error: ${e.message}`;
        }
        try {
            checks.containerInspect = execSync("docker inspect --format '{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q) 2>/dev/null || echo 'no containers'", { timeout: 5000 }).toString().trim();
        }
        catch (e) {
            checks.containerInspect = `error: ${e.message}`;
        }
        try {
            checks.containerLogs = execSync("docker logs --tail 20 $(docker ps -q --latest) 2>&1 || echo 'no containers'", { timeout: 5000 }).toString().trim();
        }
        catch (e) {
            checks.containerLogs = `error: ${e.message}`;
        }
        try {
            checks.workerService = execSync("docker compose ps worker --format '{{.Status}}' 2>/dev/null || systemctl is-active ai-employees-worker 2>/dev/null || echo 'unknown'", { timeout: 5000, cwd: "/opt/ai-employees/app" }).toString().trim();
        }
        catch (e) {
            checks.workerService = `error: ${e.message}`;
        }
        try {
            checks.workerLogs = execSync("docker compose logs worker --tail 20 --no-color 2>/dev/null || journalctl -u ai-employees-worker --no-pager -n 20 2>&1 || echo 'no logs'", { timeout: 5000, cwd: "/opt/ai-employees/app" }).toString().trim();
        }
        catch (e) {
            checks.workerLogs = `error: ${e.message}`;
        }
        checks.anthropicKeySet = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10;
        checks.anthropicKeyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 8) || "NOT SET";
        try {
            checks.images = execSync("docker images --format '{{.Repository}}:{{.Tag}}'", { timeout: 5000 }).toString().trim() || "none";
        }
        catch (e) {
            checks.images = `error: ${e.message}`;
        }
        return checks;
    });
    // Build logs — read from cloud-init log file
    fastify.get("/logs", async () => {
        try {
            const logs = readFileSync("/var/log/ai-employees-init.log", "utf-8");
            const lines = logs.split("\n");
            return { logs: lines.slice(-100).join("\n") };
        }
        catch {
            return { logs: "No log file found" };
        }
    });
    // Rolling deployment — rebuilds api + worker containers via Docker Compose.
    // Employee (Blitzer) containers, Redis, and Traefik are NOT touched.
    // Runs in background since it takes minutes; check /deploy-status for results.
    fastify.get("/update", async (request) => {
        return triggerDeploy(request.query);
    });
    fastify.post("/deploy", async (request) => {
        return triggerDeploy({ branch: request.body?.branch });
    });
    // Check deployment progress
    fastify.get("/update-status", async () => getDeployStatus());
    fastify.get("/deploy-status", async () => getDeployStatus());
    // Re-provision all employees — regenerate configs and restart containers.
    // Useful after a deploy that changes the config generator.
    fastify.get("/reprovision", async () => {
        const { getProvisionQueue } = await import("./queues.js");
        const { db, employees } = await import("@ai-employees/db");
        const { ne, eq: eqOp } = await import("drizzle-orm");
        const allEmployees = await db.query.employees.findMany({
            where: ne(employees.status, "terminated"),
        });
        const queue = getProvisionQueue();
        const results = [];
        for (const emp of allEmployees) {
            await db.update(employees).set({
                status: "provisioning",
                containerId: null,
                containerHost: null,
                containerPort: null,
                errorMessage: null,
                updatedAt: new Date(),
            }).where(eqOp(employees.id, emp.id));
            await queue.add("provision-employee", {
                employeeId: emp.id,
                companyId: emp.companyId,
                channels: [],
            }, { jobId: `reprovision-${emp.id}-${Date.now()}` });
            results.push({ id: emp.id, name: emp.name, status: "queued" });
        }
        return { reprovisioned: results.length, employees: results };
    });
    // Slack proxy status endpoint
    fastify.get("/slack-proxy/status", async () => {
        const proxy = getSlackProxy();
        return { running: proxy.isRunning() };
    });
    // Refresh Slack proxy mappings (called after provisioning a new employee)
    fastify.post("/slack-proxy/refresh", async () => {
        const proxy = getSlackProxy();
        await proxy.refreshMappings();
        return { ok: true };
    });
    // Restart Slack proxy (re-reads credentials from DB — call after Slack reconnect)
    fastify.post("/slack-proxy/restart", async () => {
        const proxy = getSlackProxy();
        await proxy.restart();
        return { ok: true, running: proxy.isRunning() };
    });
    // Create a Slack channel for an employee (called by the worker after provisioning)
    fastify.post("/slack-proxy/create-channel", async (request) => {
        const { employeeId } = request.body;
        const proxy = getSlackProxy();
        if (!proxy.isRunning()) {
            return { ok: false, error: "Slack proxy not running" };
        }
        const channelId = await proxy.createEmployeeChannel(employeeId);
        if (channelId) {
            await proxy.refreshMappings();
            return { ok: true, channelId };
        }
        return { ok: false, error: "Failed to create channel" };
    });
    // Archive a Slack channel for an employee (called by the worker on termination)
    fastify.post("/slack-proxy/archive-channel", async (request) => {
        const { employeeId } = request.body;
        const proxy = getSlackProxy();
        if (!proxy.isRunning()) {
            return { ok: false, error: "Slack proxy not running" };
        }
        await proxy.archiveEmployeeChannel(employeeId);
        await proxy.refreshMappings();
        return { ok: true };
    });
    // Reconcile Slack channels — create channels for employees that don't have one.
    // GET-accessible so it can be triggered via the debug proxy.
    fastify.get("/slack-proxy/reconcile", async () => {
        const proxy = getSlackProxy();
        if (!proxy.isRunning()) {
            return { ok: false, error: "Slack proxy not running" };
        }
        const results = await proxy.reconcileChannels();
        return { ok: true, results };
    });
    // Start Slack proxy in background (non-blocking)
    const slackProxy = getSlackProxy();
    slackProxy.start().catch((err) => {
        console.error("[slack-proxy] Background start failed:", err);
    });
    return fastify;
}
const DEPLOY_LOG = "/deploy-logs/deploy.log";
const HOST_APP_DIR = "/opt/ai-employees/app";
/**
 * Trigger a rolling deployment.
 *
 * Two modes:
 *  1. **Systemd** (native droplet) — the API runs directly on the host, so we
 *     pull, rebuild, and restart services in-process. No deployer container needed.
 *  2. **Docker Compose** — spawns a deployer container that rebuilds and
 *     rolling-restarts api + worker via Docker Compose.
 *
 * Employee (Blitzer) containers, Redis, and Traefik are NOT touched.
 */
function triggerDeploy(opts) {
    let branch = opts?.branch || "main";
    try {
        branch = readFileSync("/host-app/.branch", "utf-8").trim() || branch;
    }
    catch { }
    try {
        branch = readFileSync(`${HOST_APP_DIR}/.branch`, "utf-8").trim() || branch;
    }
    catch { }
    // Sanitise branch name to prevent command injection
    if (!/^[\w.\-/]+$/.test(branch)) {
        return { status: "error", message: "Invalid branch name" };
    }
    // Check if a deploy is already running
    try {
        const status = getDeployStatus();
        if (!status.done && status.lines.length > 1) {
            return { status: "already_running", message: "A deployment is already in progress. Check /deploy-status.", branch };
        }
    }
    catch { /* no previous deploy */ }
    // Detect systemd-based deployment (API running natively on the host)
    const isSystemd = existsSync("/etc/systemd/system/ai-employees-api.service");
    if (isSystemd) {
        return triggerSystemdDeploy(branch);
    }
    writeSync(DEPLOY_LOG, `[${new Date().toISOString()}] Deploy triggered (branch: ${branch})\n`);
    // Check if deploy.sh exists on the host (for Docker Compose deployments)
    const hasScript = existsSync("/host-app/infrastructure/deploy.sh");
    const deployScript = hasScript
        ? `bash ${HOST_APP_DIR}/infrastructure/deploy.sh ${branch}`
        : `
      cd ${HOST_APP_DIR} &&
      echo "[$(date -Iseconds)] Pulling code..." >> /logs/deploy.log &&
      git fetch origin ${branch} >> /logs/deploy.log 2>&1 &&
      git reset --hard origin/${branch} >> /logs/deploy.log 2>&1 &&
      echo "[$(date -Iseconds)] Building images..." >> /logs/deploy.log &&
      docker compose build --no-cache api worker >> /logs/deploy.log 2>&1 &&
      echo "[$(date -Iseconds)] Restarting worker..." >> /logs/deploy.log &&
      docker compose up -d --no-deps worker >> /logs/deploy.log 2>&1 &&
      sleep 5 &&
      echo "[$(date -Iseconds)] Restarting api..." >> /logs/deploy.log &&
      docker compose up -d --no-deps api >> /logs/deploy.log 2>&1 &&
      echo "[$(date -Iseconds)] Cleaning up..." >> /logs/deploy.log &&
      docker image prune -f >> /logs/deploy.log 2>&1 &&
      echo "[$(date -Iseconds)] ========== DEPLOY COMPLETE ==========" >> /logs/deploy.log ||
      echo "[$(date -Iseconds)] DEPLOY FAILED" >> /logs/deploy.log
    `.trim();
    const dockerArgs = [
        "run", "-d", "--rm",
        "--name", "ai-emp-deployer",
        "-v", "/var/run/docker.sock:/var/run/docker.sock",
        "-v", `${HOST_APP_DIR}:${HOST_APP_DIR}`,
        "-v", "ai-employees_deploy_logs:/logs",
        "-w", HOST_APP_DIR,
        "-e", `DEPLOY_LOG=/logs/deploy.log`,
        "-e", `APP_DIR=${HOST_APP_DIR}`,
        "alpine:latest",
        "sh", "-c",
        `apk add --no-cache git docker-cli docker-cli-compose bash >> /logs/deploy.log 2>&1 && ${deployScript}`,
    ];
    try {
        try {
            execFileSync("docker", ["rm", "-f", "ai-emp-deployer"], { timeout: 5000, stdio: "ignore" });
        }
        catch { }
        execFileSync("docker", dockerArgs, { timeout: 15000 });
        return {
            status: "started",
            message: "Rolling deployment started. Employee containers will NOT be affected. Check /deploy-status for progress.",
            branch,
            mode: hasScript ? "script" : "inline",
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { status: "error", message: `Failed to start deployer: ${message}`, branch };
    }
}
/**
 * In-process deploy for systemd-based droplets.
 * Runs git pull, pnpm build, and restarts services via systemctl.
 * The API restarts itself last (systemd will bring it back up).
 */
function triggerSystemdDeploy(branch) {
    const logFile = "/var/log/ai-employees-deploy.log";
    const log = (msg) => {
        const line = `[${new Date().toISOString()}] ${msg}\n`;
        try {
            appendFileSync(logFile, line);
        }
        catch { }
        console.log(`[deploy] ${msg}`);
    };
    log(`========== SYSTEMD DEPLOY STARTED (branch: ${branch}) ==========`);
    // Run the deploy in a detached child process so the API can respond immediately
    const script = `
    set -e
    LOG="${logFile}"
    log() { echo "[$(date -Iseconds)] $1" >> "$LOG"; }

    cd ${HOST_APP_DIR}

    log "Pulling code..."
    git fetch origin ${branch} >> "$LOG" 2>&1
    git reset --hard origin/${branch} >> "$LOG" 2>&1
    COMMIT=$(git rev-parse --short HEAD)
    log "Checked out ${branch} at $COMMIT"

    log "Installing dependencies..."
    pnpm install --frozen-lockfile >> "$LOG" 2>&1 || pnpm install >> "$LOG" 2>&1

    log "Building..."
    pnpm turbo build >> "$LOG" 2>&1

    log "Restarting worker..."
    systemctl restart ai-employees-worker >> "$LOG" 2>&1

    sleep 2

    log "Restarting API (service will come back up automatically)..."
    log "========== DEPLOY COMPLETE ($COMMIT) =========="
    systemctl restart ai-employees-api
  `;
    const child = spawn("bash", ["-c", script], {
        detached: true,
        stdio: "ignore",
    });
    child.unref();
    return {
        status: "started",
        message: "Systemd deploy started. The API will restart after build completes. Check logs at /var/log/ai-employees-deploy.log.",
        branch,
        mode: "systemd",
    };
}
/** Read deployment log and return progress */
function getDeployStatus() {
    try {
        const log = readFileSync(DEPLOY_LOG, "utf-8");
        const lines = log.split("\n").filter(Boolean);
        const lastLine = lines[lines.length - 1] || "";
        const done = lastLine.includes("DEPLOY COMPLETE") || lastLine.includes("DEPLOY FAILED");
        return { done, success: lastLine.includes("DEPLOY COMPLETE"), lines };
    }
    catch {
        return { done: false, success: false, lines: ["No deployment in progress"] };
    }
}
//# sourceMappingURL=server.js.map