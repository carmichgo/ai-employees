import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { powerCycleEmployeeDroplet, checkDropletHealth } from "@/lib/digitalocean";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/reboot
 * Hard-reboot an employee's droplet via DigitalOcean API.
 * Use this when the droplet's API (port 3001) is unresponsive
 * and the normal /restart endpoint can't reach it.
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
      dropletId: employees.dropletId,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      companyId: employees.companyId,
    })
    .from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, session.companyId)))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  if (!employee.dropletId) {
    return NextResponse.json({ error: "Employee has no droplet to reboot" }, { status: 400 });
  }

  // Power-cycle via DigitalOcean API
  const success = await powerCycleEmployeeDroplet(id);

  if (!success) {
    return NextResponse.json({ error: "Failed to power-cycle droplet" }, { status: 502 });
  }

  // Only mark droplet as unhealthy — do NOT clear container fields or change
  // employee status. After a power-cycle the Docker containers and systemd
  // services restart automatically, so the existing container (with all its
  // workspace data) comes back. The health checker will flip dropletStatus
  // back to "active" once port 3001 responds.
  await db
    .update(employees)
    .set({
      dropletStatus: "unhealthy",
      errorMessage: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id));

  return NextResponse.json({
    success: true,
    message: `Rebooting ${employee.name}'s droplet. It will take 1-2 minutes to come back online.`,
  });
}
