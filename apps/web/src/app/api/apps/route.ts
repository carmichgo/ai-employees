import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeApps, employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

// GET /api/apps — list all apps for the company
export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const apps = await db
      .select({
        id: employeeApps.id,
        companyId: employeeApps.companyId,
        employeeId: employeeApps.employeeId,
        name: employeeApps.name,
        description: employeeApps.description,
        emoji: employeeApps.emoji,
        type: employeeApps.type,
        workspacePath: employeeApps.workspacePath,
        url: employeeApps.url,
        instructions: employeeApps.instructions,
        shared: employeeApps.shared,
        status: employeeApps.status,
        createdAt: employeeApps.createdAt,
        updatedAt: employeeApps.updatedAt,
        employeeName: employees.name,
        employeeEmoji: employees.emoji,
        employeeJobTitle: employees.jobTitle,
      })
      .from(employeeApps)
      .leftJoin(employees, eq(employeeApps.employeeId, employees.id))
      .where(eq(employeeApps.companyId, session.companyId))
      .orderBy(desc(employeeApps.createdAt));

    return NextResponse.json({ apps });
  } catch (err: any) {
    // Table may not exist yet — return empty array gracefully
    console.error("[apps] query error:", err.message);
    return NextResponse.json({ apps: [] });
  }
}
