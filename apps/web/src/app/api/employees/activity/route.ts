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

    // Get all non-terminated employees for this company
    const emps = await db
      .select({
        id: employees.id,
        name: employees.name,
        status: employees.status,
        lastHealthAt: employees.lastHealthAt,
      })
      .from(employees)
      .where(eq(employees.companyId, session.companyId));

    // Get in_progress tasks grouped by employee
    const inProgressTasks = await db
      .select({
        employeeId: tasks.employeeId,
        title: tasks.title,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.companyId, session.companyId),
          eq(tasks.status, "in_progress"),
        ),
      );

    // Build a map: employeeId -> list of in_progress tasks
    const taskMap = new Map<string, Array<{ title: string; updatedAt: string }>>();
    for (const t of inProgressTasks) {
      if (!taskMap.has(t.employeeId)) taskMap.set(t.employeeId, []);
      taskMap.get(t.employeeId)!.push({
        title: t.title,
        updatedAt: t.updatedAt?.toISOString() || "",
      });
    }

    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;

    const activity = emps.map((emp) => {
      const empTasks = taskMap.get(emp.id) || [];
      const lastHealth = emp.lastHealthAt ? new Date(emp.lastHealthAt).getTime() : 0;
      const healthAge = now - lastHealth;
      const isReachable = lastHealth > 0 && healthAge < FIVE_MIN;

      let activityStatus: "working" | "idle" | "offline";
      let currentTask: string | null = null;

      if (emp.status !== "active") {
        activityStatus = "offline";
      } else if (isReachable && empTasks.length > 0) {
        activityStatus = "working";
        // Pick the most recently updated in_progress task
        currentTask = empTasks.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0].title;
      } else if (isReachable) {
        activityStatus = "idle";
      } else {
        activityStatus = "offline";
      }

      return {
        employeeId: emp.id,
        activityStatus,
        currentTask,
        inProgressCount: empTasks.length,
        lastHealthAt: emp.lastHealthAt?.toISOString() || null,
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
