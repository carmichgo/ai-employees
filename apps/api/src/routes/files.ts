/**
 * Internal file management routes — upload, list, download, and delete files
 * in an employee's workspace directory.
 *
 * Files are stored at /opt/ai-employees/openclaw-configs/{employeeId}/workspace/uploads/
 * which is bind-mounted into the container at /home/node/.openclaw/workspace/uploads/
 */
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, employees } from "@ai-employees/db";
import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  statSync,
  existsSync,
} from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const CONFIG_BASE = "/opt/ai-employees/openclaw-configs";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function getUploadsDir(employeeId: string): string {
  return path.join(CONFIG_BASE, employeeId, "workspace", "uploads");
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

export async function fileRoutes(fastify: FastifyInstance) {
  // Middleware: verify inter-service secret
  fastify.addHook("onRequest", async (request, reply) => {
    const secret = request.headers["x-interservice-secret"];
    if (secret !== process.env.INTERSERVICE_SECRET) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  });

  // POST /internal/employees/:id/files — upload a file (JSON with base64 content)
  fastify.post<{ Params: { id: string } }>(
    "/internal/employees/:id/files",
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as {
        name: string;
        content: string; // base64 encoded
        mimeType?: string;
      };

      if (!body.name || !body.content) {
        return reply.status(400).send({ error: "Required: name, content (base64)" });
      }

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, id),
      });
      if (!employee) return reply.status(404).send({ error: "Employee not found" });

      const filename = sanitizeFilename(body.name);
      const uploadsDir = getUploadsDir(id);
      mkdirSync(uploadsDir, { recursive: true });

      const buffer = Buffer.from(body.content, "base64");
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(413).send({ error: "File too large (max 10MB)" });
      }

      const filePath = path.join(uploadsDir, filename);
      writeFileSync(filePath, buffer);

      // Fix ownership so the container can read the file
      try {
        execSync(`chown 1000:1000 "${filePath}"`);
      } catch {}

      const stat = statSync(filePath);

      return reply.status(201).send({
        file: {
          name: filename,
          size: stat.size,
          mimeType: body.mimeType || "application/octet-stream",
          uploadedAt: stat.mtime.toISOString(),
        },
      });
    },
  );

  // GET /internal/employees/:id/files — list all uploaded files
  fastify.get<{ Params: { id: string } }>(
    "/internal/employees/:id/files",
    async (request, reply) => {
      const { id } = request.params;

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, id),
      });
      if (!employee) return reply.status(404).send({ error: "Employee not found" });

      const uploadsDir = getUploadsDir(id);
      if (!existsSync(uploadsDir)) {
        return { files: [] };
      }

      const entries = readdirSync(uploadsDir);
      const files = entries.map((name) => {
        const stat = statSync(path.join(uploadsDir, name));
        return {
          name,
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
        };
      });

      return { files };
    },
  );

  // GET /internal/employees/:id/files/:filename — download a file
  fastify.get<{ Params: { id: string; filename: string } }>(
    "/internal/employees/:id/files/:filename",
    async (request, reply) => {
      const { id, filename } = request.params;

      const uploadsDir = getUploadsDir(id);
      const filePath = path.join(uploadsDir, sanitizeFilename(filename));

      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: "File not found" });
      }

      const content = readFileSync(filePath);
      return reply.header("Content-Type", "application/octet-stream").send(content);
    },
  );

  // GET /internal/employees/:id/workspace/* — serve any file from the workspace
  // Used for sharing screenshots, generated files, etc. with the dashboard
  fastify.get<{ Params: { id: string; "*": string } }>(
    "/internal/employees/:id/workspace/*",
    async (request, reply) => {
      const { id } = request.params;
      const filePath = request.params["*"];

      if (!filePath) {
        return reply.status(400).send({ error: "File path required" });
      }

      // Prevent path traversal
      const normalized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
      if (normalized.includes("..")) {
        return reply.status(400).send({ error: "Invalid path" });
      }

      const workspaceDir = path.join(CONFIG_BASE, id, "workspace");
      const fullPath = path.join(workspaceDir, normalized);

      // Ensure the resolved path is within the workspace
      if (!fullPath.startsWith(workspaceDir)) {
        return reply.status(400).send({ error: "Invalid path" });
      }

      if (!existsSync(fullPath)) {
        return reply.status(404).send({ error: "File not found" });
      }

      const stat = statSync(fullPath);
      if (!stat.isFile()) {
        return reply.status(400).send({ error: "Not a file" });
      }

      // Determine content type from extension
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".json": "application/json",
        ".csv": "text/csv",
        ".html": "text/html",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      const content = readFileSync(fullPath);
      return reply
        .header("Content-Type", contentType)
        .header("Cache-Control", "public, max-age=300")
        .send(content);
    },
  );

  // DELETE /internal/employees/:id/files/:filename — delete a file
  fastify.delete<{ Params: { id: string; filename: string } }>(
    "/internal/employees/:id/files/:filename",
    async (request, reply) => {
      const { id, filename } = request.params;

      const uploadsDir = getUploadsDir(id);
      const filePath = path.join(uploadsDir, sanitizeFilename(filename));

      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: "File not found" });
      }

      unlinkSync(filePath);
      return { message: "File deleted" };
    },
  );
}
