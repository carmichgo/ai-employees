/**
 * Chat API — proxies messages to/from an employee's OpenClaw container.
 *
 * POST /api/employees/[id]/chat — send a message, get a response
 * GET  /api/employees/[id]/chat — get conversation history
 *
 * Messages are persisted to the chat_messages table so conversations
 * survive page refreshes.
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

// GET /api/employees/[id]/chat — get conversation history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify employee belongs to user's company
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

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
}

// POST /api/employees/[id]/chat — send a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Get employee with auth check
  const [employee] = await db
    .select()
    .from(employees)
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
  const { message, conversationHistory } = body as {
    message: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

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

  // Route to OpenClaw container via the employee's dedicated droplet
  try {
    const messages = [
      ...(conversationHistory || []),
      { role: "user", content: message },
    ];

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

    const data = await res.json();

    // Post-process: convert workspace file paths to accessible URLs, then auto-embed images
    let reply = data.reply || "";
    reply = rewriteWorkspacePaths(reply, id);
    reply = autoEmbedImages(reply, id);

    // Save assistant reply to DB. The API on the droplet also saves as a
    // backup (in case this Vercel function times out), but we save here as
    // the primary path since it's more reliable than depending on the
    // droplet having the latest code deployed.
    try {
      await db.insert(chatMessages).values({
        employeeId: id,
        userId: session.userId,
        role: "assistant",
        content: reply,
        mode: data.mode || "live",
      });
    } catch (saveErr) {
      // Non-fatal — the reply will still be returned to the user
      console.error(`[chat] Failed to save assistant reply:`, saveErr);
    }

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

    // If the employee was already in error state, give a friendlier message
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
