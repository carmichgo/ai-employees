/**
 * Email routes — internal email sending endpoint for OpenClaw containers.
 *
 * Containers call POST /internal/email/send to send emails via Resend API.
 * The RESEND_API_KEY stays on the droplet, not in every container.
 * Supports file attachments (images, PDFs, documents, etc.).
 */
import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_API = "https://api.resend.com";
const CONFIG_BASE = "/opt/ai-employees/openclaw-configs";

// Max total attachment size: 25 MB (Resend limit)
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

export async function emailRoutes(fastify: FastifyInstance) {
  // Middleware: verify inter-service secret
  fastify.addHook("onRequest", async (request, reply) => {
    const secret = request.headers["x-interservice-secret"];
    if (secret !== process.env.INTERSERVICE_SECRET) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  });

  // POST /internal/email/send — send an email via Resend
  fastify.post("/internal/email/send", async (request, reply) => {
    if (!RESEND_API_KEY) {
      return reply.status(500).send({ error: "Email not configured — RESEND_API_KEY not set" });
    }

    const body = request.body as {
      from: string;
      to: string | string[];
      subject: string;
      text?: string;
      html?: string;
      replyTo?: string;
      cc?: string | string[];
      bcc?: string | string[];
      attachments?: Array<{
        /** Base64-encoded file content (used directly if provided) */
        content?: string;
        /** Container workspace path — resolved to host filesystem (alternative to content) */
        path?: string;
        /** Filename for the attachment */
        filename: string;
      }>;
      /** Employee ID — required when using path-based attachments to resolve workspace paths */
      employeeId?: string;
    };

    if (!body.from || !body.to || !body.subject) {
      return reply.status(400).send({ error: "Missing required fields: from, to, subject" });
    }

    if (!body.text && !body.html) {
      return reply.status(400).send({ error: "Must provide text or html body" });
    }

    // Resolve attachments: convert workspace paths to base64 content
    let resendAttachments: Array<{ content: string; filename: string }> | undefined;
    if (body.attachments?.length) {
      resendAttachments = [];
      let totalSize = 0;

      for (const att of body.attachments) {
        if (att.content) {
          // Already base64-encoded
          totalSize += Buffer.byteLength(att.content, "base64");
          resendAttachments.push({ content: att.content, filename: att.filename });
        } else if (att.path && body.employeeId) {
          // Resolve container workspace path to host filesystem
          const hostPath = resolveWorkspacePath(att.path, body.employeeId);
          if (!hostPath || !existsSync(hostPath)) {
            fastify.log.warn(`Attachment file not found: ${att.path} -> ${hostPath}`);
            continue;
          }
          const fileBuffer = readFileSync(hostPath);
          totalSize += fileBuffer.length;
          resendAttachments.push({
            content: fileBuffer.toString("base64"),
            filename: att.filename || path.basename(hostPath),
          });
        }
      }

      if (totalSize > MAX_ATTACHMENT_SIZE) {
        return reply.status(413).send({ error: `Total attachment size exceeds 25MB limit` });
      }

      if (resendAttachments.length === 0) {
        resendAttachments = undefined;
      }
    }

    try {
      const res = await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: body.from,
          to: Array.isArray(body.to) ? body.to : [body.to],
          subject: body.subject,
          text: body.text,
          html: body.html,
          reply_to: body.replyTo,
          cc: body.cc ? (Array.isArray(body.cc) ? body.cc : [body.cc]) : undefined,
          bcc: body.bcc ? (Array.isArray(body.bcc) ? body.bcc : [body.bcc]) : undefined,
          attachments: resendAttachments,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        fastify.log.error(`Resend API error: ${err}`);
        return reply.status(res.status).send({ error: `Email send failed: ${err}` });
      }

      const data = await res.json() as { id: string };
      return { success: true, emailId: data.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: `Email send error: ${message}` });
    }
  });

  // GET /internal/email/status — check email config
  fastify.get("/internal/email/status", async () => {
    return {
      configured: !!RESEND_API_KEY,
      provider: "resend",
    };
  });
}

/**
 * Resolve a container workspace path to a host filesystem path.
 * Maps /home/node/.openclaw/... → /opt/ai-employees/openclaw-configs/{employeeId}/...
 */
function resolveWorkspacePath(containerPath: string, employeeId: string): string | null {
  const prefixes: [string, string][] = [
    ["/home/node/.openclaw/", ""],
    ["~/.openclaw/", ""],
  ];

  for (const [prefix, replacement] of prefixes) {
    if (containerPath.startsWith(prefix)) {
      const relPath = replacement + containerPath.slice(prefix.length);
      const hostPath = path.join(CONFIG_BASE, employeeId, relPath);
      // Prevent path traversal
      if (!hostPath.startsWith(path.join(CONFIG_BASE, employeeId))) return null;
      return hostPath;
    }
  }

  return null;
}
