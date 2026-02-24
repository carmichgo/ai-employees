import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, chatMessages } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/restart
 * Restart an employee's container to clear stuck state.
 * Optionally clears chat history too.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await verifyToken(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      status: employees.status,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      interserviceSecret: employees.interserviceSecret,
      companyId: employees.companyId,
    })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!employee.dropletIp || !employee.interserviceSecret || employee.dropletStatus !== "active") {
    return NextResponse.json({ error: "Employee has no active droplet" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const clearChat = (body as any).clearChat === true;

  const results: string[] = [];

  // 1. Restart container on the droplet
  try {
    const res = await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${id}/restart`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": employee.interserviceSecret,
        },
        signal: AbortSignal.timeout(45000),
      },
    );

    if (res.ok) {
      const data = await res.json();
      results.push(data.message || "Container restarted");
    } else {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      results.push(`Container restart failed: ${err.error}`);
    }
  } catch (err: any) {
    results.push(`Container restart error: ${err.message}`);
  }

  // 2. Optionally clear chat history
  if (clearChat) {
    try {
      await db
        .delete(chatMessages)
        .where(and(eq(chatMessages.employeeId, id), eq(chatMessages.userId, session.userId)));
      results.push("Chat history cleared");
    } catch (err: any) {
      results.push(`Failed to clear chat: ${err.message}`);
    }
  }

  return NextResponse.json({ success: true, results });
}
