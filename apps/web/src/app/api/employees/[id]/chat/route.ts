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
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, chatMessages, tasks, taskComments } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { checkDropletHealth } from "@/lib/digitalocean";

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

    // Deduplicate: safety net for any legacy duplicate rows in the DB.
    // Filter out back-to-back assistant messages with identical content.
    const deduped = rows.filter((row, i) => {
      if (i === 0) return true;
      const prev = rows[i - 1];
      if (row.role === "assistant" && prev.role === "assistant" && row.content === prev.content) {
        return false;
      }
      return true;
    });

    // Post-process assistant messages: convert workspace file paths to
    // accessible URLs and auto-embed images. The droplet saves raw content
    // to the DB, so we apply these transforms on read.
    const processed = deduped.map((row) => {
      if (row.role !== "assistant") return row;
      let content = row.content;
      content = rewriteWorkspacePaths(content, id);
      content = autoEmbedImages(content, id);
      return { ...row, content };
    });

    return NextResponse.json({ messages: processed });
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

// POST /api/employees/[id]/chat — send a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Get employee with auth check — explicit columns to avoid SELECT * breakage
  const [employee] = await selectEmployee()
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Block chat for statuses that genuinely can't respond
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

  // Ensure chat table exists before first write
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
    // If the droplet is "unhealthy" but has an IP, try a live health check —
    // it may have recovered since the last status update (e.g. after a reboot
    // where the polling window was too short).
    if (employee.dropletStatus === "unhealthy" && employee.dropletIp && employee.interserviceSecret) {
      const health = await checkDropletHealth(employee.dropletIp);
      if (health.ok) {
        // Droplet recovered — update status and continue to real chat
        await db
          .update(employees)
          .set({ dropletStatus: "active", errorMessage: null, updatedAt: new Date() } as any)
          .where(eq(employees.id, id));
        employee.dropletStatus = "active";
      }
    }

    // Still not active after the live check — return demo reply
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
  }

  // Route to OpenClaw container via the employee's dedicated droplet.
  // The droplet API injects the full SOUL.md from disk as the system prompt —
  // we do NOT inject a separate system prompt here so there's one source of truth.
  try {
    // Fetch active tasks WITH recent comments so the agent knows what's already
    // in progress and what work has been done — prevents restarting or duplicating work.
    let taskContext = "";
    try {
      const activeTasks = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.employeeId, id),
            inArray(tasks.status, ["in_progress", "pending", "blocked"]),
          ),
        )
        .limit(20);

      // Also fetch recently completed tasks (last 24h) so the agent knows what was already delivered
      const recentlyCompleted = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.employeeId, id),
            eq(tasks.status, "completed"),
            sql`${tasks.completedAt} > now() - interval '24 hours'`,
          ),
        )
        .orderBy(desc(tasks.completedAt))
        .limit(10);

      const allContextTasks = [...activeTasks, ...recentlyCompleted];

      if (allContextTasks.length > 0) {
        // Fetch recent comments for these tasks so the agent has full work history
        const taskIds = allContextTasks.map((t) => t.id);
        const commentsByTask: Record<string, Array<{ authorName: string; content: string }>> = {};
        try {
          const comments = await db
            .select({
              taskId: taskComments.taskId,
              authorName: taskComments.authorName,
              content: taskComments.content,
              createdAt: taskComments.createdAt,
            })
            .from(taskComments)
            .where(sql`${taskComments.taskId} IN (${sql.join(taskIds.map((tid) => sql`${tid}::uuid`), sql`, `)})`)
            .orderBy(desc(taskComments.createdAt));

          for (const c of comments) {
            const arr = commentsByTask[c.taskId] || (commentsByTask[c.taskId] = []);
            if (arr.length < 3) arr.push({ authorName: c.authorName, content: c.content });
          }
          // Reverse to chronological order
          for (const arr of Object.values(commentsByTask)) arr.reverse();
        } catch {
          // Non-fatal — comments table may not exist yet
        }

        const taskLines: string[] = [];
        for (const t of activeTasks) {
          taskLines.push(`- [${t.status}] "${t.title}" (${t.priority}, id:${t.id.slice(0, 8)})`);
          const comments = commentsByTask[t.id];
          if (comments?.length) {
            for (const c of comments) {
              const truncated = c.content.length > 200 ? c.content.slice(0, 200) + "..." : c.content;
              taskLines.push(`    > ${c.authorName}: ${truncated}`);
            }
          }
        }
        if (recentlyCompleted.length > 0) {
          taskLines.push("");
          taskLines.push("Recently completed (do NOT redo these):");
          for (const t of recentlyCompleted) {
            taskLines.push(`- [completed] "${t.title}" (id:${t.id.slice(0, 8)})`);
            const comments = commentsByTask[t.id];
            if (comments?.length) {
              const last = comments[comments.length - 1];
              const truncated = last.content.length > 200 ? last.content.slice(0, 200) + "..." : last.content;
              taskLines.push(`    > ${last.authorName}: ${truncated}`);
            }
          }
        }

        taskContext = `\n\n[Current task board — these tasks already exist, do NOT recreate or restart them. Read the comments to understand what work has already been done. Only create a new task if the manager is asking for something genuinely new that isn't covered below.]\n${taskLines.join("\n")}`;
      }
    } catch {
      // Non-fatal — task query may fail if table doesn't exist yet
    }

    // Limit conversation history to avoid polluting context with old threads.
    const recentHistory = (conversationHistory || []).slice(-10);
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
      ...recentHistory,
      { role: "user", content: message + taskContext },
    ];

    // If files were attached, fetch their content from the droplet workspace
    // and inject into the last user message so the AI can actually see them.
    if (files && files.length > 0) {
      const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

      // Start with the user's text (include task context so the agent
      // knows what's already in progress even when files are attached)
      if (message || taskContext) {
        contentParts.push({ type: "text", text: (message || "") + taskContext });
      }

      for (const file of files) {
        const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
        try {
          // Fetch file from the droplet workspace
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
            // Convert to base64 data URL for vision
            const buf = Buffer.from(await fileRes.arrayBuffer());
            const b64 = buf.toString("base64");
            const mime = file.mimeType.startsWith("image/") ? file.mimeType : `image/${ext === "jpg" ? "jpeg" : ext}`;
            contentParts.push({
              type: "image_url",
              image_url: { url: `data:${mime};base64,${b64}` },
            });
          } else {
            // Read text content for non-image files (<100KB)
            const buf = Buffer.from(await fileRes.arrayBuffer());
            if (buf.length <= 100_000) {
              contentParts.push({
                type: "text",
                text: `\n\n--- Attached file: ${file.name} ---\n${buf.toString("utf-8")}\n--- End of ${file.name} ---`,
              });
            } else {
              contentParts.push({
                type: "text",
                text: `\n\n[Attached file: ${file.name} — saved to /home/node/.openclaw/workspace/uploads/${sanitized} (${(buf.length / 1024).toFixed(0)}KB, too large to include inline)]`,
              });
            }
          }
        } catch {
          // File fetch failed — tell the AI where the file is
          contentParts.push({
            type: "text",
            text: `\n\n[Attached file: ${file.name} — saved to /home/node/.openclaw/workspace/uploads/${sanitized}]`,
          });
        }
      }

      // Replace last user message with multimodal content
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

    // Mark request as sent
    try {
      await db.update(employees).set({ lastRequestSentAt: new Date() }).where(eq(employees.id, id));
    } catch { /* column may not exist yet */ }

    // Timeout slightly under maxDuration so we fail gracefully with a proper error
    // instead of Vercel killing the function and returning a generic non-JSON error
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110_000); // 110s

    let res: Response;
    try {
      res = await fetch(
        `http://${employee.dropletIp}:3001/internal/employees/${id}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-interservice-secret": employee.interserviceSecret,
          },
          body: JSON.stringify({ messages, userId: session.userId }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    // Mark response received
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

    // Parse response — handle both JSON and SSE fallback in case the
    // droplet returns streaming data unexpectedly.
    let data: any;
    const rawText = await res.text();
    try {
      data = JSON.parse(rawText);
    } catch {
      // If JSON parse fails, the droplet may have returned SSE. Extract text.
      let assembled = "";
      for (const line of rawText.split("\n")) {
        if (!line.startsWith("data: ") || line.trim() === "data: [DONE]") continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          const delta = chunk.choices?.[0]?.delta?.content || chunk.reply;
          if (delta) assembled += delta;
        } catch { /* skip */ }
      }
      data = { reply: assembled || rawText.slice(0, 500), mode: "live" };
    }

    // Post-process: convert workspace file paths to accessible URLs, then auto-embed images
    let reply = data.reply || "";
    reply = rewriteWorkspacePaths(reply, id);
    reply = autoEmbedImages(reply, id);

    // NOTE: We do NOT save the assistant reply here — the droplet API
    // already persists it (in saveReply) before returning the response.
    // Saving here too caused duplicate messages because the content can
    // differ after rewriteWorkspacePaths/autoEmbedImages transforms,
    // bypassing the dedup filter in the GET handler.
    // For the timeout case (mode: "pending"), the droplet continues
    // running and saves when the container finishes — the frontend polls
    // GET until the reply appears.

    // If the employee was in error/provisioning/onboarding but responded, restore to active
    if (employee.status !== "active") {
      await db
        .update(employees)
        .set({ status: "active", errorMessage: null, updatedAt: new Date() })
        .where(eq(employees.id, id));
    }

    return NextResponse.json({ ...data, reply });
  } catch (err: any) {
    // Handle timeout — the AI is still working but took too long for this HTTP request.
    // The API handler on the droplet keeps running (no timeout) and will save the
    // real reply to chat_messages when the container finishes. We return a temporary
    // message with mode "pending" so the UI knows to poll for the actual reply.
    const isTimeout = err?.name === "AbortError";
    if (isTimeout) {
      return NextResponse.json({
        reply: `Still working on this — the response will appear here when it's ready.`,
        mode: "pending",
      });
    }

    // Employee is unreachable — mark as error so the UI shows recovery options
    const wasActive = employee.status === "active";
    if (wasActive) {
      await db
        .update(employees)
        .set({
          status: "error",
          errorMessage: `Unreachable — connection failed at ${new Date().toLocaleString()}`,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, id));
    }

    const reply = wasActive
      ? `I'm having trouble reaching ${employee.name} — the workspace appears to be down. Use the recovery options below or visit the employee page to reboot.`
      : `I'm having trouble connecting right now — my workspace is recovering. Please try again in a moment.`;
    await db.insert(chatMessages).values({
      employeeId: id,
      userId: session.userId,
      role: "assistant",
      content: reply,
      mode: "unreachable",
    });
    return NextResponse.json({ reply, mode: "unreachable", employeeId: id });
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
