import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, taskComments } from "@/lib/schema";
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

  return NextResponse.json({ comment }, { status: 201 });
}
