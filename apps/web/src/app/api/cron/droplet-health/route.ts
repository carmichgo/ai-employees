import { NextRequest, NextResponse } from "next/server";
import { eq, not, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import {
  isDropletProvisioningEnabled,
  checkDropletHealth,
  getDropletInfo,
  powerCycleEmployeeDroplet,
} from "@/lib/digitalocean";

/**
 * GET /api/cron/droplet-health
 *
 * External droplet health monitor — runs as a Vercel cron (daily on Hobby plan).
 * For more frequent checks, use an external cron service (cron-job.org, UptimeRobot)
 * to call: GET /api/cron/droplet-health?secret=<CRON_SECRET>
 *
 * This is the EXTERNAL watchdog that catches droplet failures the internal
 * health-poll worker can't (because it runs ON the droplet and dies with it).
 *
 * Logic:
 *  1. Query all employees with active droplets (dropletStatus = "active", dropletIp set)
 *  2. Ping each droplet's /health endpoint
 *  3. If unreachable:
 *     - First failure: mark dropletStatus = "unhealthy" (grace period)
 *     - Already unhealthy + lastHealthAt > 10 min ago: power-cycle via DO API
 *  4. If reachable: ensure dropletStatus = "active", update lastHealthAt
 *
 * Auth: Vercel cron header OR ?secret= query param OR Authorization bearer.
 */

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron invocation
  // Accepts: Vercel cron header, Authorization bearer, or ?secret= query param
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    const isAuthorized =
      auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isDropletProvisioningEnabled()) {
    return NextResponse.json({ skipped: true, reason: "DO_API_TOKEN not configured" });
  }

  // Get all employees with active/unhealthy droplets that have an IP
  const monitoredEmployees = await db
    .select({
      id: employees.id,
      name: employees.name,
      dropletId: employees.dropletId,
      dropletIp: employees.dropletIp,
      dropletStatus: employees.dropletStatus,
      lastHealthAt: employees.lastHealthAt,
      status: employees.status,
    })
    .from(employees)
    .where(
      and(
        isNotNull(employees.dropletId),
        isNotNull(employees.dropletIp),
        not(eq(employees.dropletStatus, "destroyed")),
        not(eq(employees.dropletStatus, "provisioning")),
        not(eq(employees.status, "terminated")),
      ),
    );

  const results: Array<{
    employeeId: string;
    name: string;
    action: string;
    details?: string;
  }> = [];

  for (const emp of monitoredEmployees) {
    const ip = emp.dropletIp!;
    const health = await checkDropletHealth(ip);

    if (health.ok) {
      // Droplet is healthy
      if (emp.dropletStatus !== "active") {
        // Was unhealthy, now recovered
        await db
          .update(employees)
          .set({
            dropletStatus: "active",
            lastHealthAt: new Date(),
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, emp.id));
        results.push({ employeeId: emp.id, name: emp.name, action: "recovered" });
      } else {
        // Still healthy — update lastHealthAt
        await db
          .update(employees)
          .set({ lastHealthAt: new Date(), updatedAt: new Date() })
          .where(eq(employees.id, emp.id));
        results.push({ employeeId: emp.id, name: emp.name, action: "healthy" });
      }
      continue;
    }

    // Droplet health check failed — investigate
    const dropletInfo = await getDropletInfo(emp.dropletId!);

    if (!dropletInfo.exists) {
      // Droplet was deleted externally
      await db
        .update(employees)
        .set({
          dropletStatus: "destroyed",
          status: "error",
          errorMessage: "Droplet no longer exists on DigitalOcean",
          updatedAt: new Date(),
        })
        .where(eq(employees.id, emp.id));
      results.push({ employeeId: emp.id, name: emp.name, action: "marked_destroyed" });
      continue;
    }

    if (dropletInfo.status === "off") {
      // Droplet is powered off — power it on
      const cycled = await powerCycleEmployeeDroplet(emp.id);
      await db
        .update(employees)
        .set({
          dropletStatus: "unhealthy",
          errorMessage: `Droplet was powered off, power-cycled at ${new Date().toISOString()}`,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, emp.id));
      results.push({
        employeeId: emp.id,
        name: emp.name,
        action: cycled ? "power_cycled" : "power_cycle_failed",
        details: "Droplet was off",
      });
      continue;
    }

    // Droplet exists and is "active" on DO but health endpoint isn't responding
    if (emp.dropletStatus === "unhealthy") {
      // Already marked unhealthy — check if enough time has passed for a restart
      const unhealthySince = emp.lastHealthAt
        ? new Date().getTime() - new Date(emp.lastHealthAt).getTime()
        : Infinity;

      // If unhealthy for more than 10 minutes, power-cycle
      if (unhealthySince > 10 * 60 * 1000) {
        const cycled = await powerCycleEmployeeDroplet(emp.id);
        await db
          .update(employees)
          .set({
            errorMessage: `Droplet unresponsive for ${Math.round(unhealthySince / 60000)}min, power-cycled at ${new Date().toISOString()}`,
            updatedAt: new Date(),
          })
          .where(eq(employees.id, emp.id));
        results.push({
          employeeId: emp.id,
          name: emp.name,
          action: cycled ? "power_cycled" : "power_cycle_failed",
          details: `Unresponsive ${Math.round(unhealthySince / 60000)}min`,
        });
      } else {
        results.push({
          employeeId: emp.id,
          name: emp.name,
          action: "still_unhealthy",
          details: `Unhealthy for ${Math.round(unhealthySince / 60000)}min, waiting before power-cycle`,
        });
      }
    } else {
      // First failure — mark as unhealthy (grace period before restart)
      await db
        .update(employees)
        .set({
          dropletStatus: "unhealthy",
          errorMessage: `Health check failed at ${new Date().toISOString()}`,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, emp.id));
      results.push({
        employeeId: emp.id,
        name: emp.name,
        action: "marked_unhealthy",
        details: health.phase || "No response",
      });
    }
  }

  console.log(`[cron/droplet-health] Checked ${monitoredEmployees.length} droplets:`, JSON.stringify(results));

  return NextResponse.json({
    checked: monitoredEmployees.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
