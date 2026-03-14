import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

export const maxDuration = 30;

/**
 * POST /api/employees/[id]/stop
 * Immediately stop whatever the employee is doing by restarting their container.
 * This kills any in-flight AI request / tool execution without tearing down the droplet.
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

  // Restart the container to kill any running process
  try {
    const res = await fetch(
      `http://${employee.dropletIp}:3001/internal/employees/${id}/restart`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-interservice-secret": employee.interserviceSecret,
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (res.ok) {
      return NextResponse.json({
        success: true,
        message: `Stopped ${employee.name}. All running processes have been killed.`,
      });
    }

    return NextResponse.json(
      { error: "Failed to stop employee processes" },
      { status: 502 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Stop failed: ${err.message}` },
      { status: 502 },
    );
  }
}
