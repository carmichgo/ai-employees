import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { powerCycleEmployeeDroplet } from "@/lib/digitalocean";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/reboot
 * Hard-reboot an employee's droplet via DigitalOcean API.
 *
 * Returns immediately after issuing the power-cycle command and sets
 * status to "provisioning" so the frontend auto-polls for recovery.
 * The existing pollEmployeeDropletStatus (called by the status endpoint)
 * will detect when the droplet comes back and update the IP + status.
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

  // Clear the stored IP (it may change after reboot) and set status to
  // "provisioning" so the frontend polls for recovery. pollEmployeeDropletStatus
  // will query the DO API for the new IP and update it when the droplet is back.
  await db
    .update(employees)
    .set({
      status: "provisioning",
      dropletIp: null,
      dropletStatus: "new",
      errorMessage: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id));

  return NextResponse.json({
    success: true,
    message: `Rebooting ${employee.name}'s server — this takes 1-2 minutes.`,
  });
}
