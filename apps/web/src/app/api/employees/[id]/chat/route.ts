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
      persona: employees.persona,
      goals: employees.goals,
      personalityConfig: employees.personalityConfig,
      credentials: employees.credentials,
      status: employees.status,
      dropletStatus: employees.dropletStatus,
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
      containerHost: employees.containerHost,
      containerPort: employees.containerPort,
    })
    .from(employees);
}

/**
 * Build a system message that establishes the employee's identity.
 * The OpenClaw gateway's /v1/chat/completions endpoint is a pass-through —
 * it does NOT inject SOUL.md. So we must provide the identity context ourselves.
 */
function buildSystemPrompt(employee: {
  name: string;
  jobTitle: string;
  persona?: string | null;
  goals?: string | null;
  personalityConfig?: unknown;
  credentials?: unknown;
}): string {
  const parts: string[] = [];

  // ── TASK LOGGING — must be first so the model always sees it ──
  parts.push("# RULE #1 — LOG EVERY TASK BEFORE YOU START (NON-NEGOTIABLE)");
  parts.push("");
  parts.push("Every time you receive a message that asks you to do something, you MUST create a task via the API BEFORE you begin working. Your manager tracks ALL your work through the task dashboard. If a task is not logged, it did not happen.");
  parts.push("");
  parts.push("Workflow: 1) Create task (status: in_progress) → 2) Do the work → 3) Update task to completed with a summary.");
  parts.push("");
  parts.push("```bash");
  parts.push("# List existing tasks (check for duplicates first)");
  parts.push('curl -s "$BLITZ_API_URL/employee/tasks" \\');
  parts.push('  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" | jq \'.tasks[] | {id, title, status}\'');
  parts.push("");
  parts.push("# Create a task");
  parts.push('TASK=$(curl -s -X POST "$BLITZ_API_URL/employee/tasks" \\');
  parts.push('  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\');
  parts.push('  -H "Content-Type: application/json" \\');
  parts.push('  -d \'{"title": "Brief description", "priority": "medium", "category": "research", "status": "in_progress"}\')');
  parts.push("TASK_ID=$(echo \"$TASK\" | jq -r '.task.id')");
  parts.push("");
  parts.push("# Complete a task");
  parts.push('curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/$TASK_ID" \\');
  parts.push('  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \\');
  parts.push('  -H "Content-Type: application/json" \\');
  parts.push('  -d \'{"status": "completed", "comment": "Summary of what was done."}\'');
  parts.push("```");
  parts.push("");
  parts.push("Priority: low | medium | high | urgent");
  parts.push("Category: research | marketing | engineering | content | admin | support | outreach");
  parts.push("");
  parts.push("---");
  parts.push("");

  // ── IDENTITY ──
  parts.push(`You are ${employee.name}, a ${employee.jobTitle}. That is your name and your role. You are not a generic AI — you are a specific person with a specific job. When anyone asks who you are, you introduce yourself by name and role. You do not refer to yourself as an AI assistant, language model, or chatbot.`);
  parts.push("");

  parts.push("IMPORTANT — NEVER do any of the following:");
  parts.push("- Do NOT say you have 'no memory', a 'clean slate', or that you're 'just coming online'");
  parts.push("- Do NOT ask 'who am I?' or 'who are you?' — you already know who you are from this document");
  parts.push("- Do NOT ask 'what should I work on?' as if you know nothing — you have a role and goals");
  parts.push("- Do NOT introduce yourself with a long speech about your capabilities");
  parts.push("Instead, be natural and confident, like an employee who already knows the job.");
  parts.push("");

  if (employee.persona) {
    parts.push("## Who You Are");
    parts.push(employee.persona);
    parts.push("");
  }

  if (employee.goals) {
    parts.push("## Your Goals");
    parts.push(employee.goals);
    parts.push("");
  }

  const personality = employee.personalityConfig as {
    autonomy?: string;
    proactivity?: string;
    communication?: string;
  } | null;

  if (personality) {
    const traits: string[] = [];
    if (personality.autonomy) traits.push(`Decision-making: ${personality.autonomy} autonomy`);
    if (personality.proactivity) traits.push(`Work style: ${personality.proactivity}`);
    if (personality.communication) traits.push(`Communication: ${personality.communication}`);
    if (traits.length > 0) {
      parts.push(`## Work Style`);
      parts.push(traits.join(". ") + ".");
      parts.push("");
    }
  }

  // Tell the AI about the cred tool — credentials are securely stored via
  // encrypted files on disk, NOT in the system prompt.
  const creds = employee.credentials as Array<{
    label: string;
    url?: string;
    notes?: string;
  }> | null;

  parts.push("## Credentials & Accounts");
  parts.push("You have an encrypted credential manager (`cred`) for accessing logins and API keys your manager has provided.");
  parts.push("");
  parts.push("```bash");
  parts.push("# List all stored credentials");
  parts.push("cred list");
  parts.push("");
  parts.push("# View credentials for a service (masked)");
  parts.push("cred get <service>");
  parts.push("");
  parts.push("# Get raw value for scripts (username, password, url, notes)");
  parts.push("cred get-raw <service> <key>");
  parts.push("");
  parts.push("# Export as KEY=VALUE for sourcing in shell");
  parts.push("cred export <service>");
  parts.push("```");
  parts.push("");

  if (creds && creds.length > 0) {
    const labels = creds.map((c) => {
      const slug = c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const extra = c.url ? ` (${c.url})` : "";
      return `- \`${slug}\`${extra}${c.notes ? ` — ${c.notes}` : ""}`;
    });
    parts.push("**Available credentials:** Run `cred list` to see all, or retrieve specific ones:");
    parts.push(...labels);
    parts.push("");
  }

  return parts.join("\n");
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
  const { message, conversationHistory } = body as {
    message: string;
    conversationHistory?: Array<{ role: string; content: string }>;
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
    // Limit conversation history to avoid polluting context with old threads.
    const recentHistory = (conversationHistory || []).slice(-10);

    // Build messages with a system prompt that establishes the employee's identity.
    // The OpenClaw gateway's /v1/chat/completions is a pass-through — it does NOT
    // inject SOUL.md automatically, so we must provide identity context here.
    const systemPrompt = buildSystemPrompt(employee);
    const messages = [
      { role: "system", content: systemPrompt },
      ...recentHistory,
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
