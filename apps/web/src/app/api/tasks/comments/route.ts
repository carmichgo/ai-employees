import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, taskComments, employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/tasks/comments?taskId=<id> — list comments for a task
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  // Verify task belongs to company
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, session.companyId)))
    .limit(1);

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const comments = await db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.createdAt));

  return NextResponse.json({ comments });
}

// POST /api/tasks/comments?taskId=<id> — add a comment
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const body = await request.json();
  const { content, authorName } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Verify task belongs to company
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, session.companyId)))
    .limit(1);

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const [comment] = await db
    .insert(taskComments)
    .values({
      taskId,
      authorType: "manager",
      authorName: authorName || "Manager",
      content: content.trim(),
    })
    .returning();

  // Notify the employee about the new comment (fire-and-forget)
  notifyEmployee(task, comment, authorName || "Manager").catch(() => {});

  return NextResponse.json({ comment }, { status: 201 });
}

/**
 * Send a notification to the employee's container when a manager comments on their task.
 * Fire-and-forget — failures are logged but don't block the API response.
 */
async function notifyEmployee(
  task: { id: string; title: string; employeeId: string },
  comment: { content: string },
  managerName: string,
) {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, task.employeeId))
    .limit(1);

  if (!employee || employee.status === "terminated" || employee.status === "paused") return;
  if (!employee.dropletIp || !employee.interserviceSecret) return;

  const message = [
    `[Manager Comment on Task]`,
    ``,
    `**${managerName}** commented on your task **"${task.title}"** (ID: ${task.id}):`,
    ``,
    `> ${comment.content}`,
    ``,
    `Read the comment and respond if needed — update your task status or reply with a comment:`,
    `curl -s -X PATCH "$BLITZ_API_URL/employee/tasks/${task.id}" -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" -H "Content-Type: application/json" -d '{"comment": "Your reply here..."}'`,
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${employee.id}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": employee.interserviceSecret,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: message }],
        }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}
