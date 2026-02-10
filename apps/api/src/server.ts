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

  // Health check (used by Vercel to verify droplet readiness)
  fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
  fastify.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Debug endpoint — check Docker, worker, env
  fastify.get("/debug", async () => {
    const checks: Record<string, unknown> = {};
    try { checks.docker = execSync("docker info --format '{{.ServerVersion}}'", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.docker = `error: ${e.message}`; }
    try { checks.containers = execSync("docker ps --format '{{.Names}} {{.Status}}'", { timeout: 5000 }).toString().trim() || "none"; } catch (e: any) { checks.containers = `error: ${e.message}`; }
    try { checks.workerService = execSync("systemctl is-active ai-employees-worker", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.workerService = `error: ${e.message}`; }
    try { checks.apiService = execSync("systemctl is-active ai-employees-api", { timeout: 5000 }).toString().trim(); } catch (e: any) { checks.apiService = `error: ${e.message}`; }
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
