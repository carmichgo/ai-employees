import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, employeeApps, employees } from "@ai-employees/db";

export async function appRoutes(fastify: FastifyInstance) {
  // List all apps for company (includes creator info)
  fastify.get(
    "/api/apps",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;

      const apps = await db
        .select({
          id: employeeApps.id,
          name: employeeApps.name,
          description: employeeApps.description,
          emoji: employeeApps.emoji,
          type: employeeApps.type,
          workspacePath: employeeApps.workspacePath,
          url: employeeApps.url,
          instructions: employeeApps.instructions,
          shared: employeeApps.shared,
          status: employeeApps.status,
          createdAt: employeeApps.createdAt,
          updatedAt: employeeApps.updatedAt,
          employeeId: employeeApps.employeeId,
          employeeName: employees.name,
          employeeEmoji: employees.emoji,
          employeeJobTitle: employees.jobTitle,
        })
        .from(employeeApps)
        .leftJoin(employees, eq(employeeApps.employeeId, employees.id))
        .where(eq(employeeApps.companyId, companyId))
        .orderBy(desc(employeeApps.createdAt));

      return { apps };
    },
  );

  // Get single app
  fastify.get<{ Params: { id: string } }>(
    "/api/apps/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;

      const [app] = await db
        .select({
          id: employeeApps.id,
          name: employeeApps.name,
          description: employeeApps.description,
          emoji: employeeApps.emoji,
          type: employeeApps.type,
          workspacePath: employeeApps.workspacePath,
          url: employeeApps.url,
          instructions: employeeApps.instructions,
          shared: employeeApps.shared,
          status: employeeApps.status,
          createdAt: employeeApps.createdAt,
          updatedAt: employeeApps.updatedAt,
          employeeId: employeeApps.employeeId,
          employeeName: employees.name,
          employeeEmoji: employees.emoji,
          employeeJobTitle: employees.jobTitle,
        })
        .from(employeeApps)
        .leftJoin(employees, eq(employeeApps.employeeId, employees.id))
        .where(and(eq(employeeApps.id, id), eq(employeeApps.companyId, companyId)))
        .limit(1);

      if (!app) {
        return reply.status(404).send({ error: "App not found" });
      }

      return { app };
    },
  );

  // Delete app (manager action)
  fastify.delete<{ Params: { id: string } }>(
    "/api/apps/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;

      const [existing] = await db
        .select({ id: employeeApps.id })
        .from(employeeApps)
        .where(and(eq(employeeApps.id, id), eq(employeeApps.companyId, companyId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "App not found" });
      }

      await db.delete(employeeApps).where(eq(employeeApps.id, id));

      return { message: "App deleted" };
    },
  );

  // Update app (manager can toggle shared, update description, etc.)
  fastify.patch<{ Params: { id: string } }>(
    "/api/apps/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { companyId } = request.user;
      const { id } = request.params;
      const body = request.body as {
        name?: string;
        description?: string;
        emoji?: string;
        shared?: boolean;
        status?: string;
      };

      const [existing] = await db
        .select({ id: employeeApps.id })
        .from(employeeApps)
        .where(and(eq(employeeApps.id, id), eq(employeeApps.companyId, companyId)))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "App not found" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.emoji) updates.emoji = body.emoji;
      if (body.shared !== undefined) updates.shared = body.shared;
      if (body.status) updates.status = body.status;

      const [app] = await db
        .update(employeeApps)
        .set(updates)
        .where(eq(employeeApps.id, id))
        .returning();

      return { app };
    },
  );
}
