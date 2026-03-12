import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, employeeApps, employees } from "@ai-employees/db";

/** Common select columns for app listings (excludes html_content which can be large) */
const appSelectColumns = {
  id: employeeApps.id,
  name: employeeApps.name,
  description: employeeApps.description,
  emoji: employeeApps.emoji,
  type: employeeApps.type,
  workspacePath: employeeApps.workspacePath,
  url: employeeApps.url,
  hostingMode: employeeApps.hostingMode,
  deployVersion: employeeApps.deployVersion,
  isPublic: employeeApps.isPublic,
  instructions: employeeApps.instructions,
  shared: employeeApps.shared,
  status: employeeApps.status,
  createdAt: employeeApps.createdAt,
  updatedAt: employeeApps.updatedAt,
  employeeId: employeeApps.employeeId,
  employeeName: employees.name,
  employeeEmoji: employees.emoji,
  employeeJobTitle: employees.jobTitle,
} as const;

export async function appRoutes(fastify: FastifyInstance) {
  // ─── Public App Serving ────────────────────────────────────────
  // GET /app/:id — serve an internally-hosted app (no auth required)
  fastify.get<{ Params: { id: string } }>(
    "/app/:id",
    async (request, reply) => {
      const { id } = request.params;

      const [app] = await db
        .select({
          id: employeeApps.id,
          name: employeeApps.name,
          hostingMode: employeeApps.hostingMode,
          htmlContent: employeeApps.htmlContent,
          isPublic: employeeApps.isPublic,
          status: employeeApps.status,
          url: employeeApps.url,
        })
        .from(employeeApps)
        .where(eq(employeeApps.id, id))
        .limit(1);

      if (!app || app.status !== "active") {
        return reply.status(404).type("text/html").send(
          `<!DOCTYPE html><html><head><title>Not Found</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#111;color:#888"><div style="text-align:center"><h1 style="font-size:48px;margin:0">404</h1><p>App not found</p></div></body></html>`,
        );
      }

      // External apps redirect to their URL
      if (app.hostingMode === "external") {
        if (app.url) {
          return reply.redirect(app.url);
        }
        return reply.status(404).type("text/html").send(
          `<!DOCTYPE html><html><head><title>No URL</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#111;color:#888"><div style="text-align:center"><h1>No URL configured</h1><p>This app has no deployment URL set.</p></div></body></html>`,
        );
      }

      // Internal apps: serve HTML content
      if (!app.htmlContent) {
        return reply.status(404).type("text/html").send(
          `<!DOCTYPE html><html><head><title>Not Deployed</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#111;color:#888"><div style="text-align:center"><h1>Not yet deployed</h1><p>${app.name} has no deployment. The employee needs to deploy first.</p></div></body></html>`,
        );
      }

      // If not public, require auth
      if (!app.isPublic) {
        const token =
          request.headers.authorization?.replace("Bearer ", "") ||
          (request.headers.cookie?.match(/token=([^;]+)/)?.[1] ?? null);
        if (!token) {
          return reply.status(401).type("text/html").send(
            `<!DOCTYPE html><html><head><title>Unauthorized</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#111;color:#888"><div style="text-align:center"><h1>Private App</h1><p>This app requires authentication.</p></div></body></html>`,
          );
        }
        try {
          fastify.jwt.verify(token);
        } catch {
          return reply.status(401).type("text/html").send(
            `<!DOCTYPE html><html><head><title>Unauthorized</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#111;color:#888"><div style="text-align:center"><h1>Private App</h1><p>Invalid or expired token.</p></div></body></html>`,
          );
        }
      }

      // Serve the HTML with security headers
      return reply
        .status(200)
        .type("text/html; charset=utf-8")
        .header("X-Content-Type-Options", "nosniff")
        .header("X-Frame-Options", "SAMEORIGIN")
        .header("Cache-Control", "public, max-age=300")
        .send(app.htmlContent);
    },
  );

  // ─── Manager API ────────────────────────────────────────────────

  // List all apps for company (includes creator info)
  fastify.get(
    "/api/apps",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;

      const apps = await db
        .select(appSelectColumns)
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
        .select(appSelectColumns)
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
        isPublic?: boolean;
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
      if (body.isPublic !== undefined) updates.isPublic = body.isPublic;
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
