import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Env } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { authRoutes } from "./routes/auth.js";
import { employeeRoutes } from "./routes/employees.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { provisionRoutes } from "./routes/provision.js";
import { fileRoutes } from "./routes/files.js";
import { triggerRoutes } from "./routes/triggers.js";
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
  await fastify.register(fileRoutes, { prefix: "/internal" });
  await fastify.register(triggerRoutes);

  // Health check (used by Vercel to verify droplet readiness)
  fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  fastify.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

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
    checks.anthropicKeySet = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 10;
    checks.anthropicKeyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 8) || "NOT SET";
    try { checks.images = execSync("docker images --format '{{.Repository}}:{{.Tag}}'", { timeout: 5000 }).toString().trim() || "none"; } catch (e: any) { checks.images = `error: ${e.message}`; }
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

    const fullScript = `
      (${script}) >> ${logFile} 2>&1 && \
      echo "[$(date -Iseconds)] Code updated" >> ${logFile} && \
      cd ${appDir} && \
      (pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1) >> ${logFile} 2>&1 && \
      echo "[$(date -Iseconds)] Dependencies installed" >> ${logFile} && \
      pnpm turbo build --filter=@ai-employees/api --filter=@ai-employees/worker >> ${logFile} 2>&1 && \
      echo "[$(date -Iseconds)] Build complete" >> ${logFile} && \
      sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|g' packages/*/package.json && \
      echo "[$(date -Iseconds)] Restarting services..." >> ${logFile} && \
      systemctl restart ai-employees-worker && \
      echo "[$(date -Iseconds)] Worker restarted" >> ${logFile} && \
      echo "[$(date -Iseconds)] UPDATE COMPLETE" >> ${logFile} && \
      systemctl restart ai-employees-api || \
      echo "[$(date -Iseconds)] UPDATE FAILED" >> ${logFile}
    `;

    spawn("bash", ["-c", fullScript], { detached: true, stdio: "ignore" }).unref();

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

  // Start Slack proxy in background (non-blocking)
  const slackProxy = getSlackProxy();
  slackProxy.start().catch((err) => {
    console.error("[slack-proxy] Background start failed:", err);
  });

  return fastify;
}
