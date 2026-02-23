import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, desc, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, tasks, taskComments, chatMessages } from "@/lib/schema";
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

    // Get all employees for this company
    const emps = await db
      .select({
        id: employees.id,
        name: employees.name,
        status: employees.status,
        lastHealthAt: employees.lastHealthAt,
      })
      .from(employees)
      .where(eq(employees.companyId, session.companyId));

    // Get in_progress tasks with their updatedAt
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

    // Get most recent task comment per employee (as a sign of activity)
    let latestCommentByEmployee = new Map<string, Date>();
    try {
      const recentComments = await db
        .select({
          employeeId: tasks.employeeId,
          latestComment: max(taskComments.createdAt),
        })
        .from(taskComments)
        .innerJoin(tasks, eq(taskComments.taskId, tasks.id))
        .where(eq(tasks.companyId, session.companyId))
        .groupBy(tasks.employeeId);
      for (const r of recentComments) {
        if (r.latestComment) latestCommentByEmployee.set(r.employeeId, new Date(r.latestComment));
      }
    } catch {
      // taskComments table may not exist yet
    }

    // Get most recent chat message per employee
    let latestChatByEmployee = new Map<string, Date>();
    try {
      const recentChats = await db
        .select({
          employeeId: chatMessages.employeeId,
          latestChat: max(chatMessages.createdAt),
        })
        .from(chatMessages)
        .groupBy(chatMessages.employeeId);
      for (const r of recentChats) {
        if (r.latestChat) latestChatByEmployee.set(r.employeeId, new Date(r.latestChat));
      }
    } catch {
      // chatMessages may not exist
    }

    // Build task map: employeeId -> list of in_progress tasks
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
    const THIRTY_MIN = 30 * 60 * 1000;

    const activity = emps.map((emp) => {
      const empTasks = taskMap.get(emp.id) || [];
      const lastHealth = emp.lastHealthAt ? new Date(emp.lastHealthAt).getTime() : 0;
      const healthAge = now - lastHealth;
      const isReachable = lastHealth > 0 && healthAge < FIVE_MIN;

      // Find the most recent activity signal: task update, comment, or chat
      const latestTaskUpdate = empTasks.length > 0
        ? Math.max(...empTasks.map((t) => t.updatedAt.getTime()))
        : 0;
      const latestComment = latestCommentByEmployee.get(emp.id)?.getTime() || 0;
      const latestChat = latestChatByEmployee.get(emp.id)?.getTime() || 0;
      const lastActiveTime = Math.max(latestTaskUpdate, latestComment, latestChat);

      // Determine if tasks are stale (no updates in 30+ minutes)
      const hasRecentTaskActivity = latestTaskUpdate > 0 && (now - latestTaskUpdate) < THIRTY_MIN;

      // Sort tasks by updatedAt descending
      const sortedTasks = [...empTasks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      let activityStatus: "working" | "idle" | "offline" | "may_be_stuck";
      let currentTask: string | null = null;

      if (emp.status !== "active") {
        activityStatus = "offline";
      } else if (isReachable && empTasks.length > 0 && hasRecentTaskActivity) {
        activityStatus = "working";
        currentTask = sortedTasks[0].title;
      } else if (isReachable && empTasks.length > 0 && !hasRecentTaskActivity) {
        activityStatus = "may_be_stuck";
        currentTask = sortedTasks[0].title;
      } else if (isReachable) {
        activityStatus = "idle";
      } else {
        activityStatus = "offline";
      }

      // Build per-task staleness info
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
        lastActiveAt: lastActiveTime > 0 ? new Date(lastActiveTime).toISOString() : null,
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
