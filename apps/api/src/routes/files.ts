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
  rmSync,
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

      // Serve from the entire OpenClaw config dir (covers workspace, workspace-main, media, etc.)
      const baseDir = path.join(CONFIG_BASE, id);
      const fullPath = path.join(baseDir, normalized);

      // Ensure the resolved path is within the config dir
      if (!fullPath.startsWith(baseDir)) {
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
        ".bmp": "image/bmp",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".json": "application/json",
        ".csv": "text/csv",
        ".tsv": "text/tab-separated-values",
        ".html": "text/html",
        ".xml": "application/xml",
        ".yaml": "text/yaml",
        ".yml": "text/yaml",
        ".js": "text/javascript",
        ".ts": "text/typescript",
        ".css": "text/css",
        ".py": "text/x-python",
        ".sh": "text/x-shellscript",
        ".sql": "text/x-sql",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".zip": "application/zip",
        ".gz": "application/gzip",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
        ".wav": "audio/wav",
      };
      const contentType = mimeTypes[ext] || "application/octet-stream";

      const content = readFileSync(fullPath);
      return reply
        .header("Content-Type", contentType)
        .header("Cache-Control", "public, max-age=300")
        .send(content);
    },
  );

  // GET /internal/employees/:id/documents — list all files in workspace (recursive)
  // Returns the full directory tree of employee-created files for the manager to browse
  fastify.get<{ Params: { id: string } }>(
    "/internal/employees/:id/documents",
    async (request, reply) => {
      const { id } = request.params;

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, id),
      });
      if (!employee) return reply.status(404).send({ error: "Employee not found" });

      const configBase = path.join(CONFIG_BASE, id);
      const workspaceDir = path.join(configBase, "workspace");
      const workspaceMainDir = path.join(configBase, "workspace-main");

      const files: Array<{
        name: string;
        path: string;
        size: number;
        modifiedAt: string;
        type: string;
      }> = [];

      // Skip directories that are internal/not useful to the manager
      const skipDirs = new Set(["node_modules", ".git", ".cache", "__pycache__", ".npm", ".local"]);

      const walk = (dir: string, relativeTo: string) => {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.relative(relativeTo, fullPath);

            if (entry.isDirectory()) {
              if (!skipDirs.has(entry.name) && !entry.name.startsWith(".")) {
                walk(fullPath, relativeTo);
              }
            } else if (entry.isFile()) {
              try {
                const stat = statSync(fullPath);
                const ext = path.extname(entry.name).toLowerCase();
                files.push({
                  name: entry.name,
                  path: relPath,
                  size: stat.size,
                  modifiedAt: stat.mtime.toISOString(),
                  type: ext.slice(1) || "file",
                });
              } catch { /* skip unreadable files */ }
            }
          }
        } catch { /* skip unreadable directories */ }
      };

      // Walk workspace/ (uploads, config files)
      if (existsSync(workspaceDir)) {
        walk(workspaceDir, workspaceDir);
      }

      // Walk workspace-main/ (employee-created files at runtime)
      if (existsSync(workspaceMainDir)) {
        walk(workspaceMainDir, configBase);
      }

      // Also include skills files (installed SKILL.md files)
      const skillsDir = path.join(configBase, "skills");
      if (existsSync(skillsDir)) {
        walk(skillsDir, configBase);
      }

      // Sort by most recently modified first
      files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      return { files };
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

  // DELETE /internal/employees/:id/workspace/* — delete a file or directory
  fastify.delete<{ Params: { id: string; "*": string } }>(
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

      const baseDir = path.join(CONFIG_BASE, id);
      const fullPath = path.join(baseDir, normalized);

      if (!fullPath.startsWith(baseDir + "/")) {
        return reply.status(400).send({ error: "Invalid path" });
      }

      if (!existsSync(fullPath)) {
        return reply.status(404).send({ error: "File not found" });
      }

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        rmSync(fullPath, { recursive: true, force: true });
        return { message: "Folder deleted" };
      }

      unlinkSync(fullPath);
      return { message: "File deleted" };
    },
  );

  // POST /internal/employees/:id/public-url — generate a temporary public URL for a workspace file
  fastify.post<{ Params: { id: string }; Body: { filePath: string; expiresIn?: number } }>(
    "/internal/employees/:id/public-url",
    async (request, reply) => {
      const { id } = request.params;
      const { filePath, expiresIn } = request.body || {};

      if (!filePath) {
        return reply.status(400).send({ error: "filePath required" });
      }

      const employee = await db.query.employees.findFirst({
        where: eq(employees.id, id),
      });
      if (!employee) return reply.status(404).send({ error: "Employee not found" });

      const platformUrl = process.env.PLATFORM_URL || "https://ai-employees-ten.vercel.app";
      const interserviceSecret = process.env.INTERSERVICE_SECRET || "";

      try {
        const res = await fetch(`${platformUrl}/api/employees/${id}/public-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-interservice-secret": interserviceSecret,
          },
          body: JSON.stringify({ filePath, expiresIn: expiresIn || 86400 }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Failed" }));
          return reply.status(res.status).send(body);
        }

        return await res.json();
      } catch (err: any) {
        return reply.status(502).send({ error: `Failed to generate URL: ${err.message}` });
      }
    },
  );
}
