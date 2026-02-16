/**
 * Employee-facing gateway routes — called FROM inside employee containers.
 * Authenticated via the employee's own OPENCLAW_GATEWAY_TOKEN (not interservice secret).
 *
 * These routes let employees manage their own runtime (restart gateway, etc.)
 * without needing access to the Docker socket or interservice credentials.
 */
import type { FastifyInstance } from "fastify";
import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";

export async function employeeGatewayRoutes(fastify: FastifyInstance) {
  // POST /employee/restart-gateway — restart the employee's own container
  // Auth: Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
  fastify.post("/employee/restart-gateway", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing Authorization header" });
    }
    const token = authHeader.slice(7);

    // Look up employee by gateway token
    const employee = await db.query.employees.findFirst({
      where: eq(employees.gatewayToken, token),
    });
    if (!employee) {
      return reply.status(403).send({ error: "Invalid token" });
    }
    if (!employee.containerName) {
      return reply.status(400).send({ error: "No container provisioned" });
    }

    fastify.log.info(`[restart-gateway] Employee ${employee.name} (${employee.id}) requested gateway restart`);

    try {
      // Restart the container — gateway will re-read config on startup
      execSync(`docker restart ${employee.containerName}`, { timeout: 30000 });

      // Wait briefly for container to come up, then get new IP
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const newIp = execSync(
          `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${employee.containerName}`,
          { timeout: 5000 },
        ).toString().trim();

        if (newIp) {
          await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, employee.id));
        }
      } catch {
        // Non-fatal — IP lookup can fail briefly during restart
      }

      return { success: true, message: "Gateway restarting — you'll be back online in a few seconds." };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`[restart-gateway] Failed for ${employee.id}: ${message}`);
      return reply.status(500).send({ error: `Restart failed: ${message}` });
    }
  });
}
