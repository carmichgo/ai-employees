import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, employeeApps, employees } from "@ai-employees/db";
import { executeFunction, matchRoute, type FunctionRequest } from "../serverless-runtime.js";

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

  // ─── Serverless Function Execution ───────────────────────────────
  // ALL /app/:id/api/* — execute a serverless function
  fastify.all<{ Params: { id: string; "*": string } }>(
    "/app/:id/api/*",
    async (request, reply) => {
      const { id } = request.params;
      const apiPath = "/api/" + (request.params["*"] || "");

      const [app] = await db
        .select({
          id: employeeApps.id,
          name: employeeApps.name,
          serverFunctions: employeeApps.serverFunctions,
          envVars: employeeApps.envVars,
          isPublic: employeeApps.isPublic,
          status: employeeApps.status,
        })
        .from(employeeApps)
        .where(eq(employeeApps.id, id))
        .limit(1);

      if (!app || app.status !== "active") {
        return reply.status(404).send({ error: "App not found" });
      }

      const serverFns = (app.serverFunctions || {}) as Record<string, string>;
      if (Object.keys(serverFns).length === 0) {
        return reply.status(404).send({ error: "No server functions deployed for this app" });
      }

      // If not public, require auth
      if (!app.isPublic) {
        const token =
          request.headers.authorization?.replace("Bearer ", "") ||
          (request.headers.cookie?.match(/token=([^;]+)/)?.[1] ?? null);
        if (!token) {
          return reply.status(401).send({ error: "Unauthorized" });
        }
        try {
          fastify.jwt.verify(token);
        } catch {
          return reply.status(401).send({ error: "Invalid token" });
        }
      }

      // Match the request to a registered function
      const match = matchRoute(serverFns, request.method, apiPath);
      if (!match) {
        return reply.status(404).send({
          error: `No function matches ${request.method} ${apiPath}`,
          registeredRoutes: Object.keys(serverFns),
        });
      }

      // Build the function request
      const url = new URL(request.url, "http://localhost");
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => { query[k] = v; });

      const fnReq: FunctionRequest = {
        method: request.method,
        path: apiPath,
        query: { ...query, ...match.params },
        headers: Object.fromEntries(
          Object.entries(request.headers)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string]),
        ),
        body: request.body || null,
      };

      const envVars = (app.envVars || {}) as Record<string, string>;

      try {
        const result = await executeFunction(match.code, fnReq, envVars);

        const status = result.status || 200;
        const headers = result.headers || {};

        // Set response headers
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() !== "x-function-logs" || process.env.NODE_ENV !== "production") {
            reply.header(key, value);
          }
        }

        // Log function execution (only include logs header in non-prod)
        if (headers["x-function-logs"]) {
          fastify.log.info(`[serverless] ${app.name} ${request.method} ${apiPath}: ${headers["x-function-logs"].slice(0, 200)}`);
        }

        return reply
          .status(status)
          .header("X-Powered-By", "ai-employees-serverless")
          .header("Access-Control-Allow-Origin", "*")
          .header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
          .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
          .send(result.body);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        fastify.log.error(`[serverless] ${app.name} ${request.method} ${apiPath} error: ${message}`);
        return reply.status(500).send({ error: "Function execution failed", message });
      }
    },
  );

  // CORS preflight for serverless functions
  fastify.options<{ Params: { id: string; "*": string } }>(
    "/app/:id/api/*",
    async (_request, reply) => {
      return reply
        .status(204)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        .header("Access-Control-Max-Age", "86400")
        .send();
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
