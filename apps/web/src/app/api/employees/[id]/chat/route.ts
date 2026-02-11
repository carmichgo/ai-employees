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
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, companies, chatMessages } from "@/lib/schema";
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

  return NextResponse.json({ messages: rows });
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

  if (employee.status !== "active") {
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

  // Get company for droplet info
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, session.companyId))
    .limit(1);

  if (!company || company.dropletStatus !== "active" || !company.dropletIp) {
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

  // Route to OpenClaw container via the company's droplet
  try {
    const messages = [
      ...(conversationHistory || []),
      { role: "user", content: message },
    ];

    const res = await fetch(
      `http://${company.dropletIp}:3001/internal/employees/${id}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": company.interserviceSecret || "",
        },
        body: JSON.stringify({ messages }),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Chat request failed" }));
      return NextResponse.json(
        { error: err.error || "Failed to get response" },
        { status: res.status },
      );
    }

    const data = await res.json();

    // Post-process: convert workspace file paths to accessible URLs
    let reply = data.reply || "";
    reply = rewriteWorkspacePaths(reply, id);

    // Save assistant reply to DB
    if (reply) {
      await db.insert(chatMessages).values({
        employeeId: id,
        userId: session.userId,
        role: "assistant",
        content: reply,
        mode: data.mode || "live",
      });
    }

    return NextResponse.json({ ...data, reply });
  } catch (err: any) {
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
    `Hi there! I'm ${name}, your ${title}. I'm currently running in demo mode, so I can't process real tasks yet. Once the infrastructure is provisioned, I'll be fully operational!`,
    `Hello! This is ${name}. I received your message: "${message.slice(0, 50)}${message.length > 50 ? "..." : ""}". In production mode, I'll be able to work on this for you. For now, I'm in demo mode.`,
    `Hey! ${name} here. Thanks for reaching out. I'm excited to get started once my workstation is fully set up. Right now I'm running in demo mode — provision the infrastructure in Settings to activate me!`,
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Rewrite workspace file paths in agent responses to accessible URLs.
 * Converts paths like /home/node/.openclaw/workspace/screenshot.png
 * to /api/employees/{id}/workspace/screenshot.png
 */
function rewriteWorkspacePaths(text: string, employeeId: string): string {
  const workspacePrefixes = [
    "/home/node/.openclaw/workspace/",
    "/home/node/workspace/",
    "~/.openclaw/workspace/",
  ];

  let result = text;
  for (const prefix of workspacePrefixes) {
    // Replace file paths in the text with API URLs
    result = result.replaceAll(prefix, `/api/employees/${employeeId}/workspace/`);
  }

  return result;
}
