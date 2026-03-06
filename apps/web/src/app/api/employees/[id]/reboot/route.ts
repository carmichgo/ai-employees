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
 *
 * After power-cycling, polls the droplet health for up to ~45 seconds
 * so the status is restored to "active" immediately instead of waiting
 * for the cron health checker.
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

  // Mark as active (clear error status) and droplet as unhealthy while we wait for recovery
  await db
    .update(employees)
    .set({
      status: "active",
      dropletStatus: "unhealthy",
      errorMessage: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id));

  // Poll for health recovery so the user doesn't stay stuck in "unhealthy"
  let recovered = false;
  if (employee.dropletIp) {
    // Wait 15s for the droplet to start booting, then poll every 5s
    await new Promise((r) => setTimeout(r, 15000));
    for (let i = 0; i < 6; i++) {
      const health = await checkDropletHealth(employee.dropletIp);
      if (health.ok) {
        recovered = true;
        await db
          .update(employees)
          .set({
            dropletStatus: "active",
            errorMessage: null,
            updatedAt: new Date(),
          } as any)
          .where(eq(employees.id, id));
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  if (recovered) {
    return NextResponse.json({
      success: true,
      message: `${employee.name}'s server has been rebooted and is back online.`,
    });
  }

  return NextResponse.json({
    success: true,
    message: `Rebooting ${employee.name}'s droplet. It will take 1-2 minutes to come back online.`,
  });
}
