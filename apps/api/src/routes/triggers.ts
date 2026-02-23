/**
 * Trigger routes:
 *
 * Internal (authenticated via interservice secret):
 *   POST   /internal/employees/:id/triggers     — create trigger
 *   GET    /internal/employees/:id/triggers     — list triggers
 *   PATCH  /internal/triggers/:triggerId        — update trigger
 *   DELETE /internal/triggers/:triggerId        — delete trigger
 *
 * Public (no auth, token-based):
 *   POST   /webhooks/:token                     — receive external webhook
 */
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db, employees, triggers } from "@ai-employees/db";

export async function triggerRoutes(fastify: FastifyInstance) {
  // ───────────────────────────────────────────────────
  // PUBLIC: Webhook receiver (no auth — identified by token)
  // ───────────────────────────────────────────────────
  fastify.post<{ Params: { token: string } }>(
    "/webhooks/:token",
    async (request, reply) => {
      const { token } = request.params;

      const trigger = await db.query.triggers.findFirst({
        where: and(eq(triggers.webhookToken, token), eq(triggers.enabled, true)),
      });

      if (!trigger) {
        return reply.status(404).send({ error: "Webhook not found or disabled" });
      }

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, trigger.employeeId),
      });

      if (!employee || employee.status !== "active" || !employee.containerHost) {
        return reply.status(503).send({ error: "Employee not available" });
      }

      // Build the message to send to the employee
      const config = trigger.config as { message?: string; source?: string };
      const webhookBody = JSON.stringify(request.body || {});
      let message = config.message || "You received a webhook event.";
      message = message.replace("{{body}}", webhookBody);
      message = `[Trigger: ${trigger.name}] ${message}`;

      // Send to the employee's container as a chat message
      try {
        // Track request sent
        try { await db.update(employees).set({ lastRequestSentAt: new Date() } as any).where(eq(employees.id, trigger.employeeId)); } catch {}

        const containerUrl = `http://${employee.containerHost}:${employee.containerPort}/v1/chat/completions`;
        const res = await fetch(containerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${employee.gatewayToken}`,
          },
          body: JSON.stringify({
            model: (employee.modelConfig as { primary: string }).primary,
            messages: [
              {
                role: "user",
                content: message,
              },
            ],
          }),
        });

        // Track response received
        try { await db.update(employees).set({ lastResponseAt: new Date() } as any).where(eq(employees.id, trigger.employeeId)); } catch {}

        // Update last run
        await db
          .update(triggers)
          .set({ lastRunAt: new Date(), updatedAt: new Date() })
          .where(eq(triggers.id, trigger.id));

        if (!res.ok) {
          const err = await res.text();
          fastify.log.error(`Webhook trigger failed for ${trigger.id}: ${err}`);
          return reply.status(502).send({ error: "Employee processing failed" });
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };

        return {
          ok: true,
          triggerId: trigger.id,
          employeeResponse: data.choices?.[0]?.message?.content || null,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        fastify.log.error(`Webhook delivery error: ${message}`);
        return reply.status(502).send({ error: "Employee unreachable" });
      }
    },
  );

  // ───────────────────────────────────────────────────
  // INTERNAL: Trigger CRUD (protected by interservice secret)
  // ───────────────────────────────────────────────────

  // POST /internal/employees/:id/triggers
  fastify.post<{ Params: { id: string } }>(
    "/internal/employees/:id/triggers",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-interservice-secret"] !== process.env.INTERSERVICE_SECRET) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as {
        companyId: string;
        type: "schedule" | "webhook" | "event";
        name: string;
        config: Record<string, unknown>;
        enabled?: boolean;
      };

      if (!body.type || !body.name || !body.companyId) {
        return reply.status(400).send({ error: "Required: type, name, companyId" });
      }

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, id),
      });
      if (!employee) return reply.status(404).send({ error: "Employee not found" });

      // Generate webhook token for webhook-type triggers
      const webhookToken =
        body.type === "webhook" ? crypto.randomBytes(24).toString("hex") : null;

      const [trigger] = await db
        .insert(triggers)
        .values({
          employeeId: id,
          companyId: body.companyId,
          type: body.type,
          name: body.name,
          config: body.config || {},
          enabled: body.enabled !== false,
          webhookToken,
        })
        .returning();

      return reply.status(201).send({ trigger });
    },
  );

  // GET /internal/employees/:id/triggers
  fastify.get<{ Params: { id: string } }>(
    "/internal/employees/:id/triggers",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-interservice-secret"] !== process.env.INTERSERVICE_SECRET) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const list = await db.query.triggers.findMany({
        where: eq(triggers.employeeId, id),
      });
      return { triggers: list };
    },
  );

  // PATCH /internal/triggers/:triggerId
  fastify.patch<{ Params: { triggerId: string } }>(
    "/internal/triggers/:triggerId",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-interservice-secret"] !== process.env.INTERSERVICE_SECRET) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      },
    },
    async (request, reply) => {
      const { triggerId } = request.params;
      const body = request.body as {
        name?: string;
        config?: Record<string, unknown>;
        enabled?: boolean;
      };

      const existing = await db.query.triggers.findFirst({
        where: eq(triggers.id, triggerId),
      });
      if (!existing) return reply.status(404).send({ error: "Trigger not found" });

      const [updated] = await db
        .update(triggers)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.config !== undefined && { config: body.config }),
          ...(body.enabled !== undefined && { enabled: body.enabled }),
          updatedAt: new Date(),
        })
        .where(eq(triggers.id, triggerId))
        .returning();

      return { trigger: updated };
    },
  );

  // DELETE /internal/triggers/:triggerId
  fastify.delete<{ Params: { triggerId: string } }>(
    "/internal/triggers/:triggerId",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-interservice-secret"] !== process.env.INTERSERVICE_SECRET) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      },
    },
    async (request, reply) => {
      const { triggerId } = request.params;

      const existing = await db.query.triggers.findFirst({
        where: eq(triggers.id, triggerId),
      });
      if (!existing) return reply.status(404).send({ error: "Trigger not found" });

      await db.delete(triggers).where(eq(triggers.id, triggerId));
      return { message: "Trigger deleted" };
    },
  );
}
