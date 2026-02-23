import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/employees/activity — returns activity status per employee
export async function GET(request: NextRequest) {
  try {
    const session = await authenticate(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Try to get employees with the new tracking columns; fall back gracefully
    let emps: Array<{
      id: string;
      name: string;
      status: string;
      lastHealthAt: Date | null;
      lastRequestSentAt: Date | null;
      lastResponseAt: Date | null;
    }>;

    try {
      emps = await db
        .select({
          id: employees.id,
          name: employees.name,
          status: employees.status,
          lastHealthAt: employees.lastHealthAt,
          lastRequestSentAt: employees.lastRequestSentAt,
          lastResponseAt: employees.lastResponseAt,
        })
        .from(employees)
        .where(eq(employees.companyId, session.companyId));
    } catch {
      // Columns may not exist yet — fall back to basic query
      const rows = await db
        .select({
          id: employees.id,
          name: employees.name,
          status: employees.status,
          lastHealthAt: employees.lastHealthAt,
        })
        .from(employees)
        .where(eq(employees.companyId, session.companyId));
      emps = rows.map((r) => ({ ...r, lastRequestSentAt: null, lastResponseAt: null }));
    }

    // Get in_progress tasks per employee
    const inProgressTasks = await db
      .select({
        employeeId: tasks.employeeId,
        taskId: tasks.id,
        title: tasks.title,
        updatedAt: tasks.updatedAt,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.companyId, session.companyId),
          eq(tasks.status, "in_progress"),
        ),
      );

    // Build task map
    const taskMap = new Map<string, Array<{ taskId: string; title: string; updatedAt: Date; createdAt: Date }>>();
    for (const t of inProgressTasks) {
      if (!taskMap.has(t.employeeId)) taskMap.set(t.employeeId, []);
      taskMap.get(t.employeeId)!.push({
        taskId: t.taskId,
        title: t.title,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date(t.createdAt),
        createdAt: new Date(t.createdAt),
      });
    }

    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;

    const activity = emps.map((emp) => {
      const empTasks = taskMap.get(emp.id) || [];
      const lastHealth = emp.lastHealthAt ? new Date(emp.lastHealthAt).getTime() : 0;
      const isReachable = lastHealth > 0 && (now - lastHealth) < FIVE_MIN;

      // Core signal: is a request currently in-flight?
      const reqSent = emp.lastRequestSentAt ? new Date(emp.lastRequestSentAt).getTime() : 0;
      const resRecv = emp.lastResponseAt ? new Date(emp.lastResponseAt).getTime() : 0;
      const isProcessing = reqSent > 0 && reqSent > resRecv;
      const lastResponseAge = resRecv > 0 ? now - resRecv : Infinity;

      // Sort tasks by updatedAt descending
      const sortedTasks = [...empTasks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      const currentTask = sortedTasks.length > 0 ? sortedTasks[0].title : null;

      let activityStatus: "working" | "idle" | "offline";

      if (emp.status !== "active") {
        activityStatus = "offline";
      } else if (!isReachable) {
        activityStatus = "offline";
      } else if (isProcessing) {
        // Request sent but no response yet = actively working right now
        activityStatus = "working";
      } else if (lastResponseAge < FIVE_MIN) {
        // Got a response recently = was just working
        activityStatus = "working";
      } else {
        activityStatus = "idle";
      }

      // Build per-task info
      const taskDetails = sortedTasks.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        inProgressSince: t.createdAt.toISOString(),
        lastUpdated: t.updatedAt.toISOString(),
        minutesSinceUpdate: Math.floor((now - t.updatedAt.getTime()) / 60_000),
      }));

      return {
        employeeId: emp.id,
        activityStatus,
        currentTask,
        inProgressCount: empTasks.length,
        lastHealthAt: emp.lastHealthAt?.toISOString() || null,
        lastRequestSentAt: emp.lastRequestSentAt?.toISOString() || null,
        lastResponseAt: emp.lastResponseAt?.toISOString() || null,
        lastActiveAt: resRecv > 0 ? new Date(resRecv).toISOString() : null,
        tasks: taskDetails,
      };
    });

    return NextResponse.json({ activity });
  } catch (err: any) {
    console.error("GET /api/employees/activity error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
