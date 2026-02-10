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

  return fastify;
}
