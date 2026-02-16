/**
 * Employee-facing gateway routes — called FROM inside employee containers.
 * Authenticated via the employee's own OPENCLAW_GATEWAY_TOKEN (not interservice secret).
 *
 * These routes let employees manage their own runtime (restart gateway, etc.)
 * and communicate with teammates — without needing Docker socket or interservice creds.
 */
import type { FastifyInstance } from "fastify";
import { execSync } from "node:child_process";
import { eq, and, ne } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";

/** Authenticate an employee by their gateway token. Returns the employee or sends an error. */
async function authenticateEmployee(request: { headers: { authorization?: string } }, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: reply.status(401).send({ error: "Missing Authorization header" }) };
  }
  const token = authHeader.slice(7);

  const employee = await db.query.employees.findFirst({
    where: eq(employees.gatewayToken, token),
  });
  if (!employee) {
    return { error: reply.status(403).send({ error: "Invalid token" }) };
  }

  return { employee };
}

export async function employeeGatewayRoutes(fastify: FastifyInstance) {

  // ─── Gateway Management ──────────────────────────────────────────────

  // POST /employee/restart-gateway — restart the employee's own container
  fastify.post("/employee/restart-gateway", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    if (!employee.containerName) {
      return reply.status(400).send({ error: "No container provisioned" });
    }

    fastify.log.info(`[restart-gateway] Employee ${employee.name} (${employee.id}) requested gateway restart`);

    try {
      execSync(`docker restart ${employee.containerName}`, { timeout: 30000 });

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

  // ─── Team Discovery & Communication ──────────────────────────────────

  // GET /employee/team — list teammates (same company, excluding self)
  fastify.get("/employee/team", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const { employee } = auth;

    const teammates = await db.query.employees.findMany({
      where: and(
        eq(employees.companyId, employee.companyId),
        ne(employees.id, employee.id),
        eq(employees.status, "active"),
      ),
      columns: {
        id: true,
        name: true,
        jobTitle: true,
        emoji: true,
        tier: true,
        emailAddress: true,
      },
    });

    return {
      team: teammates.map((t) => ({
        id: t.id,
        name: t.name,
        jobTitle: t.jobTitle,
        emoji: t.emoji || "🤖",
        tier: t.tier,
        email: t.emailAddress,
      })),
    };
  });

  // POST /employee/team/message — send a message to a teammate and get their response
  fastify.post("/employee/team/message", async (request, reply) => {
    const auth = await authenticateEmployee(request, reply);
    if ("error" in auth) return auth.error;
    const sender = auth.employee;

    const body = request.body as {
      to: string; // teammate name or ID
      message: string;
    };

    if (!body.to || !body.message) {
      return reply.status(400).send({ error: "Missing 'to' (teammate name or ID) and 'message' fields" });
    }

    // Find the target teammate — match by name (case-insensitive) or ID, same company
    const allTeammates = await db.query.employees.findMany({
      where: and(
        eq(employees.companyId, sender.companyId),
        ne(employees.id, sender.id),
      ),
    });

    const target = allTeammates.find(
      (t) => t.id === body.to || t.name.toLowerCase() === body.to.toLowerCase(),
    );

    if (!target) {
      return reply.status(404).send({ error: `Teammate "${body.to}" not found` });
    }
    if (target.status !== "active") {
      return reply.status(400).send({ error: `${target.name} is currently ${target.status}` });
    }
    if (!target.containerHost || !target.containerPort) {
      return reply.status(400).send({ error: `${target.name} is not online` });
    }

    // Prefix the message so the recipient knows it's from a teammate, not a human
    const framedMessage = `[Inter-team message from ${sender.name}, ${sender.jobTitle}]\n\n${body.message}`;

    // Send to the target's OpenClaw container via chat completions
    const sendToTarget = async (host: string) => {
      const url = `http://${host}:${target.containerPort}/v1/chat/completions`;
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.gatewayToken}`,
        },
        body: JSON.stringify({
          model: (target.modelConfig as { primary: string }).primary,
          messages: [{ role: "user", content: framedMessage }],
        }),
      });
    };

    try {
      let res = await sendToTarget(target.containerHost);

      // If unreachable, try refreshing IP (container may have restarted)
      if (!res.ok && target.containerName) {
        try {
          const newIp = execSync(
            `docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${target.containerName}`,
            { timeout: 5000 },
          ).toString().trim();

          if (newIp && newIp !== target.containerHost) {
            await db.update(employees).set({ containerHost: newIp, updatedAt: new Date() }).where(eq(employees.id, target.id));
            res = await sendToTarget(newIp);
          }
        } catch {
          // IP refresh failed
        }
      }

      if (!res.ok) {
        const err = await res.text();
        return reply.status(502).send({ error: `${target.name} returned an error: ${err}` });
      }

      const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: unknown };
      const responseText = data.choices?.[0]?.message?.content || "No response";

      fastify.log.info(`[team-msg] ${sender.name} → ${target.name}: ${body.message.slice(0, 80)}...`);

      return {
        from: { name: target.name, jobTitle: target.jobTitle, emoji: target.emoji },
        reply: responseText,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Could not reach ${target.name}: ${message}` });
    }
  });
}
