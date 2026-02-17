import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, employees, taskComments } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/tasks — list all tasks for the company (optionally filtered by employeeId)
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employeeId = request.nextUrl.searchParams.get("employeeId");
  const status = request.nextUrl.searchParams.get("status");

  let query = db
    .select({
      id: tasks.id,
      employeeId: tasks.employeeId,
      companyId: tasks.companyId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      source: tasks.source,
      category: tasks.category,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      employeeName: employees.name,
      employeeEmoji: employees.emoji,
      employeeJobTitle: employees.jobTitle,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.employeeId, employees.id))
    .where(eq(tasks.companyId, session.companyId))
    .orderBy(desc(tasks.createdAt))
    .$dynamic();

  if (employeeId) {
    query = query.where(and(eq(tasks.companyId, session.companyId), eq(tasks.employeeId, employeeId)));
  }

  const result = await query;

  // Filter by status client-side if needed (drizzle dynamic where chaining can be tricky)
  const filtered = status ? result.filter((t) => t.status === status) : result;

  return NextResponse.json({ tasks: filtered });
}

// POST /api/tasks — create a new task
export async function POST(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { employeeId, title, description, priority, category, dueDate, source } = body;

  if (!employeeId || !title) {
    return NextResponse.json({ error: "employeeId and title are required" }, { status: 400 });
  }

  // Verify employee belongs to this company
  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const [task] = await db
    .insert(tasks)
    .values({
      employeeId,
      companyId: session.companyId,
      title,
      description: description || null,
      priority: priority || "medium",
      source: source || "manager",
      category: category || null,
      dueDate: dueDate ? new Date(dueDate) : null,
    })
    .returning();

  return NextResponse.json({ task }, { status: 201 });
}

// PATCH /api/tasks — update a task
export async function PATCH(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "completed") updates.completedAt = new Date();
    else updates.completedAt = null;
  }
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.category !== undefined) updates.category = body.category || null;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const [task] = await db
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, session.companyId)))
    .returning();

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  return NextResponse.json({ task });
}

// DELETE /api/tasks — delete a task
export async function DELETE(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const [task] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, session.companyId)))
    .returning();

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  return NextResponse.json({ message: "Task deleted" });
}
