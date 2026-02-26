/**
 * Chat API — proxies messages to/from an employee's OpenClaw container.
 *
 * POST /api/employees/[id]/chat — send a message, get a response
 * GET  /api/employees/[id]/chat — get conversation history
 *
 * Messages are persisted to the chat_messages table so conversations
 * survive page refreshes.
 *
 * NOTE: The employee's system prompt (SOUL.md) is injected by the droplet
 * API from disk — NOT here. This keeps one single source of truth for the
 * employee's identity, task-logging rules, skills, credentials, etc.
 */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120; // Chat responses from AI can take time
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, chatMessages } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// Ensure chat_messages table exists — safe to call on every request (IF NOT EXISTS is a no-op)
let _tableEnsured = false;
async function ensureChatTable() {
  if (_tableEnsured) return;
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        mode VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_employee_id ON chat_messages(employee_id, created_at DESC)`;
    _tableEnsured = true;
  } catch {
    // Non-fatal — table probably already exists
  }
}

// Select only the employee columns we actually need (avoids SELECT * which
// breaks if the Drizzle schema defines columns not yet in the DB).
function selectEmployee() {
  return db
    .select({
      id: employees.id,
      companyId: employees.companyId,
      name: employees.name,
      jobTitle: employees.jobTitle,
      emoji: employees.emoji,
      status: employees.status,
      dropletStatus: employees.dropletStatus,
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
      containerHost: employees.containerHost,
      containerPort: employees.containerPort,
    })
    .from(employees);
}

// GET /api/employees/[id]/chat — get conversation history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    // Verify employee belongs to user's company
    const [employee] = await selectEmployee()
      .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
      .limit(1);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    await ensureChatTable();

    // Load last 100 messages, ordered newest first then reverse
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "100");
    const rows = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        mode: chatMessages.mode,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(and(eq(chatMessages.employeeId, id), eq(chatMessages.userId, session.userId)))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    // Reverse to oldest-first for the UI
    rows.reverse();

    // Deduplicate: both the Vercel route and the API on the droplet may save
    // the same assistant reply (the API saves as a backup for the timeout case).
    // Filter out back-to-back assistant messages with identical content.
    const deduped = rows.filter((row, i) => {
      if (i === 0) return true;
      const prev = rows[i - 1];
      if (row.role === "assistant" && prev.role === "assistant" && row.content === prev.content) {
        return false;
      }
      return true;
    });

    return NextResponse.json({ messages: deduped });
  } catch (err: any) {
    console.error(`[chat GET] Failed for employee ${id}:`, err);
    return NextResponse.json({ error: `Failed to load chat: ${err.message}` }, { status: 500 });
  }
}

// DELETE /api/employees/[id]/chat — clear conversation history
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const [employee] = await selectEmployee()
      .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
      .limit(1);

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    await ensureChatTable();

    // Delete all messages for this employee + user pair
    await db
      .delete(chatMessages)
      .where(and(eq(chatMessages.employeeId, id), eq(chatMessages.userId, session.userId)));

    return NextResponse.json({ success: true, message: "Chat history cleared" });
  } catch (err: any) {
    console.error(`[chat DELETE] Failed for employee ${id}:`, err);
    return NextResponse.json({ error: `Failed to clear chat: ${err.message}` }, { status: 500 });
  }
}

// POST /api/employees/[id]/chat — send a message (streaming SSE)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Get employee with auth check
  const [employee] = await selectEmployee()
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (employee.status === "terminated" || employee.status === "paused") {
    return NextResponse.json(
      { error: `Cannot chat — employee is ${employee.status}` },
      { status: 400 },
    );
  }

  const body = await request.json();
  const { message, conversationHistory, files } = body as {
    message: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    files?: Array<{ name: string; mimeType: string }>;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  await ensureChatTable();

  // Save user message to DB
  await db.insert(chatMessages).values({
    employeeId: id,
    userId: session.userId,
    role: "user",
    content: message,
  });

  // Check if employee has an active droplet
  if (employee.dropletStatus !== "active" || !employee.dropletIp || !employee.interserviceSecret) {
    const reply = generateDemoReply(employee, message);
    await db.insert(chatMessages).values({
      employeeId: id,
      userId: session.userId,
      role: "assistant",
      content: reply,
      mode: "demo",
    });
    return NextResponse.json({ reply, mode: "demo" });
  }

  try {
    const recentHistory = (conversationHistory || []).slice(-10);
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
      ...recentHistory,
      { role: "user", content: message },
    ];

    // If files were attached, fetch their content from the droplet workspace
    if (files && files.length > 0) {
      const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (message) contentParts.push({ type: "text", text: message });

      for (const file of files) {
        const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
        try {
          const fileRes = await fetch(
            `http://${employee.dropletIp}:3001/internal/employees/${id}/workspace/workspace/uploads/${encodeURIComponent(sanitized)}`,
            {
              headers: { "x-interservice-secret": employee.interserviceSecret },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!fileRes.ok) continue;

          const ext = sanitized.split(".").pop()?.toLowerCase() || "";
          const isImage = imageExts.includes(ext) || file.mimeType.startsWith("image/");

          if (isImage) {
            const buf = Buffer.from(await fileRes.arrayBuffer());
            const b64 = buf.toString("base64");
            const mime = file.mimeType.startsWith("image/") ? file.mimeType : `image/${ext === "jpg" ? "jpeg" : ext}`;
            contentParts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
          } else {
            const buf = Buffer.from(await fileRes.arrayBuffer());
            if (buf.length <= 100_000) {
              contentParts.push({ type: "text", text: `\n\n--- Attached file: ${file.name} ---\n${buf.toString("utf-8")}\n--- End of ${file.name} ---` });
            } else {
              contentParts.push({ type: "text", text: `\n\n[Attached file: ${file.name} — saved to /home/node/.openclaw/workspace/uploads/${sanitized} (${(buf.length / 1024).toFixed(0)}KB, too large to include inline)]` });
            }
          }
        } catch {
          contentParts.push({ type: "text", text: `\n\n[Attached file: ${file.name} — saved to /home/node/.openclaw/workspace/uploads/${sanitized}]` });
        }
      }

      if (contentParts.length > 0) {
        const lastIdx = messages.length - 1;
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: contentParts.length === 1 && contentParts[0].type === "text"
            ? contentParts[0].text!
            : contentParts,
        };
      }
    }

    try {
      await db.update(employees).set({ lastRequestSentAt: new Date() }).where(eq(employees.id, id));
    } catch { /* column may not exist yet */ }

    const res = await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${id}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": employee.interserviceSecret,
        },
        body: JSON.stringify({ messages, userId: session.userId }),
      },
    );

    try {
      await db.update(employees).set({ lastResponseAt: new Date() }).where(eq(employees.id, id));
    } catch { /* column may not exist yet */ }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Chat request failed" }));
      return NextResponse.json(
        { error: err.error || "Failed to get response" },
        { status: res.status },
      );
    }

    const contentType = res.headers.get("content-type") || "";

    // If the droplet returned an SSE stream, pipe it to the browser
    if (contentType.includes("text/event-stream") && res.body) {
      // Pipe the SSE stream from the droplet through to the browser.
      // We also accumulate the full text to save to DB when the stream ends.
      const userId = session.userId;
      const empId = id;
      const empStatus = employee.status;

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let fullText = "";

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true });
          controller.enqueue(chunk);

          // Parse SSE lines to accumulate full text
          const lines = text.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) fullText += delta;
            } catch {
              // Not valid JSON — skip
            }
          }
        },
        async flush() {
          // Stream done — save the accumulated reply to DB
          if (fullText) {
            const processed = autoEmbedImages(rewriteWorkspacePaths(fullText, empId), empId);
            try {
              await db.insert(chatMessages).values({
                employeeId: empId,
                userId,
                role: "assistant",
                content: processed,
                mode: "live",
              });
            } catch (saveErr) {
              console.error(`[chat] Failed to save streamed reply:`, saveErr);
            }
          }
          // Restore status if needed
          if (empStatus !== "active") {
            try {
              await db.update(employees)
                .set({ status: "active", errorMessage: null, updatedAt: new Date() })
                .where(eq(employees.id, empId));
            } catch { /* non-fatal */ }
          }
        },
      });

      const readable = res.body.pipeThrough(transformStream);

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Fallback: non-streaming JSON response (older droplet code).
    // Read as text first — if the body is actually SSE (content-type header was wrong),
    // extract the full text from SSE events instead of failing on JSON.parse.
    const rawText = await res.text();
    let data: any;
    let reply: string;

    try {
      data = JSON.parse(rawText);
      reply = data.reply || "";
    } catch {
      // Not valid JSON — likely SSE data that slipped through without the right content-type.
      // Parse SSE events to extract the full text.
      console.warn(`[chat] Fallback: response is not JSON (likely SSE). Extracting text from SSE events.`);
      let extracted = "";
      for (const line of rawText.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) extracted += delta;
        } catch {
          // skip unparseable SSE lines
        }
      }
      data = {};
      reply = extracted || rawText.slice(0, 500); // worst case, use raw text
    }

    reply = rewriteWorkspacePaths(reply, id);
    reply = autoEmbedImages(reply, id);

    try {
      await db.insert(chatMessages).values({
        employeeId: id,
        userId: session.userId,
        role: "assistant",
        content: reply,
        mode: data.mode || "live",
      });
    } catch (saveErr) {
      console.error(`[chat] Failed to save assistant reply:`, saveErr);
    }

    if (employee.status !== "active") {
      await db.update(employees)
        .set({ status: "active", errorMessage: null, updatedAt: new Date() })
        .where(eq(employees.id, id));
    }

    return NextResponse.json({ ...data, reply });
  } catch (err: any) {
    if (employee.status === "error") {
      const reply = `I'm having trouble connecting right now — my workspace is recovering. Please try again in a moment.`;
      await db.insert(chatMessages).values({
        employeeId: id,
        userId: session.userId,
        role: "assistant",
        content: reply,
        mode: "system",
      });
      return NextResponse.json({ reply, mode: "system" });
    }
    return NextResponse.json(
      { error: `Connection error: ${err.message}` },
      { status: 502 },
    );
  }
}

/** Generate a demo reply when no droplet is active */
function generateDemoReply(employee: any, message: string): string {
  const name = employee.name;
  const title = employee.jobTitle;

  const greetings = [
    `Hi there! I'm ${name}, your ${title}. I'm currently getting set up and can't process real tasks just yet. I'll be fully up and running shortly!`,
    `Hello! This is ${name}. I received your message: "${message.slice(0, 50)}${message.length > 50 ? "..." : ""}". I'm still getting started, so I can't work on this just yet. I'll be ready to go soon.`,
    `Hey! ${name} here. Thanks for reaching out. I'm excited to get started — my workstation is still being set up. I'll be fully operational shortly!`,
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Rewrite workspace file paths in agent responses to accessible URLs.
 * Converts paths like /home/node/.openclaw/workspace/screenshot.png
 * to /api/employees/{id}/workspace/screenshot.png
 */
function rewriteWorkspacePaths(text: string, employeeId: string): string {
  // Map container paths to API URLs
  // The workspace endpoint serves from the entire .openclaw config directory
  const pathMappings: [string, string][] = [
    ["/home/node/.openclaw/workspace-main/", `/api/employees/${employeeId}/workspace/workspace-main/`],
    ["/home/node/.openclaw/workspace/", `/api/employees/${employeeId}/workspace/workspace/`],
    ["/home/node/.openclaw/media/", `/api/employees/${employeeId}/workspace/media/`],
    ["/home/node/.openclaw/", `/api/employees/${employeeId}/workspace/`],
    ["~/.openclaw/workspace-main/", `/api/employees/${employeeId}/workspace/workspace-main/`],
    ["~/.openclaw/workspace/", `/api/employees/${employeeId}/workspace/workspace/`],
    ["~/.openclaw/", `/api/employees/${employeeId}/workspace/`],
  ];

  let result = text;
  for (const [from, to] of pathMappings) {
    result = result.replaceAll(from, to);
  }

  return result;
}

/**
 * Auto-embed workspace URLs as markdown images or file links.
 * - Image URLs → ![filename](url) so the frontend renders <img> tags
 * - Non-image file URLs → [filename](url) so the frontend renders download links
 * Skips URLs already inside markdown syntax ![...](url) or [...](url).
 */
function autoEmbedImages(text: string, employeeId: string): string {
  const prefix = `/api/employees/${employeeId}/workspace/`;
  if (!text.includes(prefix)) return text;

  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
  const fileExts = [
    ...imageExts,
    "pdf", "csv", "tsv", "xlsx", "xls", "docx", "doc", "pptx", "ppt",
    "txt", "md", "json", "yaml", "yml", "html", "xml",
    "zip", "tar", "gz", "tgz", "rar",
    "mp3", "mp4", "wav", "ogg",
    "py", "js", "ts", "tsx", "jsx", "sh", "sql", "rb", "go", "java", "css",
  ];

  // Split by existing markdown images and links to avoid double-wrapping
  const parts = text.split(/(!\[[^\]]*\]\([^)]+\)|\[[^\]]*\]\([^)]+\))/);

  return parts
    .map((part, i) => {
      // Odd indices are existing markdown images/links — leave them alone
      if (i % 2 === 1) return part;

      // In text parts, find bare workspace file URLs and wrap them
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        `(${escaped}[^\\s"'\`\\)\\]>]+\\.(?:${fileExts.join("|")}))`,
        "gi",
      );

      return part.replace(re, (url) => {
        const fullFilename = url.split("/").pop() || "file";
        const name = fullFilename.replace(/\.[^.]+$/, "");
        const ext = (fullFilename.split(".").pop() || "").toLowerCase();

        // Images get embedded as inline images
        if (imageExts.includes(ext)) {
          return `![${name}](${url})`;
        }
        // Non-image files get a markdown download link
        return `[${fullFilename}](${url})`;
      });
    })
    .join("");
}
