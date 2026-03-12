import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { db, employees } from "@ai-employees/db";
import type { Env } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { authRoutes } from "./routes/auth.js";
import { employeeRoutes } from "./routes/employees.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { provisionRoutes } from "./routes/provision.js";
import { fileRoutes } from "./routes/files.js";
import { triggerRoutes } from "./routes/triggers.js";
import { taskRoutes } from "./routes/tasks.js";
import { employeeGatewayRoutes } from "./routes/employee-gateway.js";
import { gatewayProxyRoutes } from "./routes/gateway-proxy.js";
import { emailRoutes } from "./routes/email.js";
import { usageRoutes } from "./routes/usage.js";
import { appRoutes } from "./routes/apps.js";
import { getSlackProxy } from "./slack/proxy.js";

export async function buildServer(config: Env) {
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
  await fastify.register(fileRoutes);
  await fastify.register(triggerRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(employeeGatewayRoutes);
  await fastify.register(gatewayProxyRoutes);
  await fastify.register(emailRoutes);
  await fastify.register(usageRoutes);
  await fastify.register(appRoutes);

  // Health check (used by Vercel to verify droplet readiness)
  // Includes container status so the platform knows if the gateway is actually running
  const getHealthResponse = async () => {
    const result: Record<string, unknown> = { status: "ok", timestamp: new Date().toISOString() };
    try {
      const containers = execSync(
        "docker ps --format '{{.Names}} {{.Status}}' --filter 'label=ai-employees.employee-id' 2>/dev/null || echo ''",
        { timeout: 3000 },
      ).toString().trim();
      if (containers) {
        result.containers = containers.split("\n").map((line) => {
          const [name, ...statusParts] = line.split(" ");
          return { name, status: statusParts.join(" ") };
        });
        result.gatewayRunning = containers.toLowerCase().includes("up");
      } else {
        result.containers = [];
        result.gatewayRunning = false;
      }
    } catch {
      result.gatewayRunning = false;
    }
    return result;
  };
  fastify.get("/health", getHealthResponse);
  fastify.get("/api/health", getHealthResponse);

  // Debug endpoint — check Docker, worker, env
  fastify.get("/debug", async () => {
    const checks: Record<string, unknown> = {};
    try { checks.docker = execSync("docker info --format '{{.ServerVersion}}'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.docker = `error: ${e.message}`; }
    try { checks.containers = execSync("docker ps -a --format '{{.Names}} {{.Status}} {{.Ports}}'", { timeout: 5000 }).toString().trim() || "none"; } catch (e: any) { checks.containers = `error: ${e.message}`; }
    try { checks.networks = execSync("docker network ls --format '{{.Name}}'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.networks = `error: ${e.message}`; }
    try { checks.containerInspect = execSync("docker inspect --format '{{.Name}} {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q) 2>/dev/null || echo 'no containers'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.containerInspect = `error: ${e.message}`; }
    try { checks.containerLogs = execSync("docker logs --tail 20 $(docker ps -q --latest) 2>&1 || echo 'no containers'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.containerLogs = `error: ${e.message}`; }
    try { checks.workerService = execSync("systemctl is-active ai-employees-worker", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.workerService = `error: ${e.message}`; }
    try { checks.workerLogs = execSync("journalctl -u ai-employees-worker --no-pager -n 20 2>&1 || echo 'no journal'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.workerLogs = `error: ${e.message}`; }
    try { checks.apiLogs = execSync("journalctl -u ai-employees-api --no-pager -n 30 2>&1 || echo 'no journal'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.apiLogs = `error: ${e.message}`; }
    checks.anthropicKeySet = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10;
    checks.anthropicKeyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 8) || "NOT SET";
    try { checks.images = execSync("docker images --format '{{.Repository}}:{{.Tag}}'", { timeout: 5000 }).toString().trim() || "none"; } catch (e: any) { checks.images = `error: ${e.message}`; }
    // Check config files inside the container
    try { checks.configFiles = execSync("docker exec $(docker ps -q --latest) ls -la /home/node/.openclaw/ 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.configFiles = `error: ${e.message}`; }
    try { checks.soulMdHead = execSync("docker exec $(docker ps -q --latest) head -20 /home/node/.openclaw/SOUL.md 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.soulMdHead = `error: ${e.message}`; }
    try { checks.openclawJson = execSync("docker exec $(docker ps -q --latest) cat /home/node/.openclaw/openclaw.json 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.openclawJson = `error: ${e.message}`; }
    try { checks.workspaceSoulMd = execSync("docker exec $(docker ps -q --latest) head -10 /home/node/.openclaw/workspace/SOUL.md 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.workspaceSoulMd = `error: ${e.message}`; }
    try { checks.containerEnv = execSync("docker exec $(docker ps -q --latest) env 2>&1 | grep -E 'EMPLOYEE_|OPENCLAW_|ANTHROPIC_API_KEY=' | sed 's/=.\\{8\\}.*/=...REDACTED/'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.containerEnv = `error: ${e.message}`; }
    // Image generation diagnostics
    try { checks.geminiKeySet = execSync("docker exec $(docker ps -q --latest) bash -c '[ -n \"$GEMINI_API_KEY\" ] && echo yes || echo no'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.geminiKeySet = `error: ${e.message}`; }
    try { checks.generateImagePath = execSync("docker exec $(docker ps -q --latest) which generate-image 2>&1 || echo 'not found'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.generateImagePath = `error: ${e.message}`; }
    try { checks.mediaSkill = execSync("docker exec $(docker ps -q --latest) head -5 /home/node/.openclaw/skills/media-generation/SKILL.md 2>&1 || echo 'not found'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.mediaSkill = `error: ${e.message}`; }
    try { checks.soulMdTaskSection = execSync("docker exec $(docker ps -q --latest) grep -c 'MANDATORY.*Task Logging' /home/node/.openclaw/SOUL.md /home/node/.openclaw/workspace/SOUL.md /home/node/.openclaw/workspace-main/SOUL.md 2>&1 || echo 'not found'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.soulMdTaskSection = `error: ${e.message}`; }
    try { checks.soulMdSize = execSync("docker exec $(docker ps -q --latest) wc -c /home/node/.openclaw/SOUL.md /home/node/.openclaw/workspace/SOUL.md /home/node/.openclaw/workspace-main/SOUL.md 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.soulMdSize = `error: ${e.message}`; }
    try { checks.blitzApiUrl = execSync("docker exec $(docker ps -q --latest) bash -c 'echo BLITZ_API_URL=$BLITZ_API_URL' 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.blitzApiUrl = `error: ${e.message}`; }
    try { checks.workspaceMainSoul = execSync("docker exec $(docker ps -q --latest) cat /home/node/.openclaw/workspace-main/SOUL.md 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.workspaceMainSoul = `error: ${e.message}`; }
    try { checks.skillsList = execSync("docker exec $(docker ps -q --latest) ls /home/node/.openclaw/skills/ 2>&1", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.skillsList = `error: ${e.message}`; }
    // Test container connectivity from the API's perspective (both GET and POST)
    try {
      const containerIp = execSync("docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(docker ps -q --latest)", { timeout: 5000 }).toString().trim();
      const containerPort = "18789";
      // Test 1: GET /v1/models (basic HTTP)
      const getUrl = `http://${containerIp}:${containerPort}/v1/models`;
      const getStart = Date.now();
      const getRes = await fetch(getUrl, { signal: AbortSignal.timeout(5000) });
      const getBody = await getRes.text();
      // Test 2: POST /v1/chat/completions (same as chat proxy uses, with dummy data)
      const postUrl = `http://${containerIp}:${containerPort}/v1/chat/completions`;
      const postStart = Date.now();
      let postResult: any;
      try {
        const postRes = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "test", messages: [{ role: "user", content: "ping" }] }),
          signal: AbortSignal.timeout(5000),
        });
        const postBody = await postRes.text();
        postResult = { status: postRes.status, latencyMs: Date.now() - postStart, body: postBody.slice(0, 300) };
      } catch (pe: any) {
        postResult = `FAILED: ${pe.code || pe.name || ""} ${pe.message} cause=${pe.cause?.message || ""}`;
      }
      checks.containerConnectivity = {
        getUrl,
        getStatus: getRes.status,
        getLatencyMs: Date.now() - getStart,
        getBody: getBody.slice(0, 100),
        postUrl,
        postResult,
      };
    } catch (e: any) {
      checks.containerConnectivity = `FAILED: ${e.code || e.name || ""} ${e.message} cause=${(e as any).cause?.message || ""}`;
    }
    // Check what the DB has for containerHost/Port
    try {
      const emps = await db.query.employees.findMany({ columns: { id: true, name: true, containerHost: true, containerPort: true, containerName: true, containerId: true, status: true, lastHealthAt: true } });
      checks.employeeContainerInfo = emps.map((e: any) => ({ id: e.id, name: e.name, host: e.containerHost, port: e.containerPort, container: e.containerName, containerId: e.containerId ? e.containerId.slice(0, 12) : null, status: e.status, lastHealthAt: e.lastHealthAt }));
    } catch (e: any) { checks.employeeContainerInfo = `error: ${e.message}`; }
    return checks;
  });

  // Build logs — read from cloud-init log file
  fastify.get("/logs", async () => {
    try {
      const logs = readFileSync("/var/log/ai-employees-init.log", "utf-8");
      const lines = logs.split("\n");
      return { logs: lines.slice(-100).join("\n") };
    } catch {
      return { logs: "No log file found" };
    }
  });

  // Hot code update — pulls latest code, rebuilds, and restarts services
  // Runs in background since it takes minutes; check /update-status for results
  fastify.get("/update", async () => {
    const logFile = "/tmp/ai-employees-update.log";
    // Spawn background update script
    const { existsSync, writeFileSync: writeSync } = await import("node:fs");
    const { spawn } = await import("node:child_process");
    const appDir = "/opt/ai-employees/app";

    const isGit = existsSync(`${appDir}/.git`);
    let branch = "main";
    try { branch = readFileSync(`${appDir}/.branch`, "utf-8").trim(); } catch {}

    writeSync(logFile, `[${new Date().toISOString()}] Update started (${isGit ? "git" : "tarball"}, branch: ${branch})\n`);

    // Build update script
    const script = isGit
      ? `cd ${appDir} && git pull origin ${branch} >> ${logFile} 2>&1`
      : `curl -sL "https://github.com/carmichgo/ai-employees/archive/refs/heads/${branch}.tar.gz" -o /tmp/repo-update.tar.gz && tar xzf /tmp/repo-update.tar.gz --strip-components=1 -C ${appDir} && rm -f /tmp/repo-update.tar.gz && echo "${branch}" > ${appDir}/.branch`;

    // Capture INTERSERVICE_SECRET at script-generation time so it survives process restarts
    const secret = process.env.INTERSERVICE_SECRET || "";
    const fullScript = `
      (${script}) >> ${logFile} 2>&1 && \
      echo "[$(date -Iseconds)] Code updated" >> ${logFile} && \
      cd ${appDir} && \
      (NODE_ENV=development CI=1 pnpm install --frozen-lockfile 2>&1 || NODE_ENV=development CI=1 pnpm install 2>&1) >> ${logFile} 2>&1 && \
      echo "[$(date -Iseconds)] Dependencies installed" >> ${logFile} && \
      pnpm turbo build --filter=@ai-employees/api --filter=@ai-employees/worker >> ${logFile} 2>&1 && \
      echo "[$(date -Iseconds)] Build complete" >> ${logFile} && \
      sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|g' packages/*/package.json && \
      echo "[$(date -Iseconds)] Restarting services..." >> ${logFile} && \
      systemctl restart ai-employees-worker && \
      echo "[$(date -Iseconds)] Worker restarted" >> ${logFile} && \
      systemctl restart ai-employees-api && \
      echo "[$(date -Iseconds)] API restarted" >> ${logFile} && \
      sleep 5 && \
      echo "[$(date -Iseconds)] Regenerating configs with new code..." >> ${logFile} && \
      REGEN_HTTP=$(curl -s -o /tmp/regen-output.txt -w "%{http_code}" -X POST http://localhost:3001/internal/regenerate-configs \
        -H "x-interservice-secret: ${secret}" \
        -H "Content-Type: application/json" -d '{}' 2>> ${logFile}) && \
      echo "[$(date -Iseconds)] Regen response: HTTP $REGEN_HTTP" >> ${logFile} && \
      cat /tmp/regen-output.txt >> ${logFile} 2>&1 && \
      echo "" >> ${logFile} && \
      echo "[$(date -Iseconds)] UPDATE COMPLETE" >> ${logFile} || \
      echo "[$(date -Iseconds)] UPDATE FAILED" >> ${logFile}
    `;

    // Use systemd-run --scope to put the script in its own cgroup scope.
    // Without this, systemctl restart ai-employees-api kills the script
    // because systemd's default KillMode=control-group kills all processes in the service cgroup.
    const child = spawn("systemd-run", ["--scope", "--quiet", "--", "bash", "-c", fullScript], { detached: true, stdio: "ignore" });
    child.on("error", (err) => {
      fastify.log.error(`[hot-update] spawn error: ${err.message}`);
    });
    child.unref();

    return { status: "started", message: "Update running in background. Check /update-status for progress.", branch, mode: isGit ? "git" : "tarball" };
  });

  // Check update progress
  fastify.get("/update-status", async () => {
    try {
      const log = readFileSync("/tmp/ai-employees-update.log", "utf-8");
      const lines = log.split("\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      const done = lastLine.includes("UPDATE COMPLETE") || lastLine.includes("UPDATE FAILED");
      return { done, success: lastLine.includes("UPDATE COMPLETE"), lines };
    } catch {
      return { done: false, success: false, lines: ["No update in progress"] };
    }
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
  fastify.post<{ Body: { employeeId: string } }>("/slack-proxy/create-channel", async (request) => {
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
  fastify.post<{ Body: { employeeId: string } }>("/slack-proxy/archive-channel", async (request) => {
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
