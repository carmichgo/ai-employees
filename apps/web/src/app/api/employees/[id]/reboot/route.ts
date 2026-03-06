import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";
import { powerCycleEmployeeDroplet, checkDropletHealth, pollEmployeeDropletStatus } from "@/lib/digitalocean";

export const maxDuration = 60;

/**
 * POST /api/employees/[id]/reboot
 * Hard-reboot an employee's droplet via DigitalOcean API.
 * Use this when the droplet's API (port 3001) is unresponsive
 * and the normal /restart endpoint can't reach it.
 *
 * After power-cycling:
 * 1. Polls droplet health (port 3001) for up to ~45s
 * 2. Once the droplet API is back, triggers a container restart
 *    so the OpenClaw gateway also comes back
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
      interserviceSecret: employees.interserviceSecret,
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

  // Mark droplet as rebooting while we wait for recovery
  await db
    .update(employees)
    .set({
      status: "active",
      dropletStatus: "unhealthy",
      errorMessage: "Rebooting...",
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id));

  // Poll for droplet recovery — uses DO API to get the current IP
  // (IP can change after a power-cycle) and checks if the API is reachable
  let dropletBack = false;
  let currentIp = employee.dropletIp;
  await new Promise((r) => setTimeout(r, 15000));
  for (let i = 0; i < 6; i++) {
    const pollResult = await pollEmployeeDropletStatus(id);
    if (pollResult.status === "active" && pollResult.ip) {
      dropletBack = true;
      currentIp = pollResult.ip;
      break;
    }
    // Also update IP even if not fully active yet
    if (pollResult.ip) currentIp = pollResult.ip;
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Re-read the employee to get the updated IP from pollEmployeeDropletStatus
  const [updatedEmployee] = await db
    .select({
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (updatedEmployee?.dropletIp) currentIp = updatedEmployee.dropletIp;

  if (!dropletBack) {
    await db
      .update(employees)
      .set({
        dropletStatus: "unhealthy",
        errorMessage: "Droplet rebooting — waiting for recovery",
        updatedAt: new Date(),
      } as any)
      .where(eq(employees.id, id));
    return NextResponse.json({
      success: true,
      message: `Rebooting ${employee.name}'s droplet. It may take 1-2 minutes to come back online.`,
    });
  }

  // Droplet API is back — now restart the OpenClaw container.
  // After a power-cycle, the container may not auto-start even though
  // the API server does (systemd service vs Docker container).
  let containerRestarted = false;
  const secret = updatedEmployee?.interserviceSecret || employee.interserviceSecret;
  if (secret && currentIp) {
    const headers = {
      "Content-Type": "application/json",
      "x-interservice-secret": secret,
    };
    const baseUrl = `http://${currentIp}:3001`;

    // Try dedicated restart endpoint first
    try {
      const res = await fetch(`${baseUrl}/internal/employees/${id}/restart`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        containerRestarted = true;
      }
    } catch { /* endpoint may not exist or timed out */ }

    // If restart didn't work, try reprovision (recreates the container)
    if (!containerRestarted) {
      try {
        const res = await fetch(`${baseUrl}/internal/employees/${id}/reprovision`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          containerRestarted = true;
        }
      } catch { /* reprovision failed */ }
    }
  }

  if (containerRestarted) {
    await db
      .update(employees)
      .set({
        status: "active",
        dropletStatus: "active",
        errorMessage: null,
        updatedAt: new Date(),
      } as any)
      .where(eq(employees.id, id));
    return NextResponse.json({
      success: true,
      message: `${employee.name}'s server has been rebooted and the workspace is restarting.`,
    });
  }

  // Droplet is back but container restart failed — mark active but with warning
  await db
    .update(employees)
    .set({
      status: "active",
      dropletStatus: "active",
      errorMessage: "Droplet is back but container restart failed — try the Restart button",
      updatedAt: new Date(),
    } as any)
    .where(eq(employees.id, id));

  return NextResponse.json({
    success: true,
    message: `${employee.name}'s server is back but the workspace may need a manual restart.`,
  });
}
