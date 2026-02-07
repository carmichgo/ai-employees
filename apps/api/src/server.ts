import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import type { Env } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { authRoutes } from "./routes/auth.js";
import { employeeRoutes } from "./routes/employees.js";
import { dashboardRoutes } from "./routes/dashboard.js";

export async function buildServer(config: Env) {
  const fastify = Fastify({
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
      },
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

  // Health check
  fastify.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  return fastify;
}
