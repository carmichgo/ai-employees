import { NextRequest, NextResponse } from "next/server";
import { and, isNotNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { createBackendClient } from "@/lib/backend";

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/hot-update
 * Trigger hot-update on all employee droplets (active + unhealthy).
 * Auth: CRON_SECRET via Authorization bearer or ?secret= query param.
 */
export async function POST(request: NextRequest) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization");
    const querySecret = new URL(request.url).searchParams.get("secret");
    const isAuthorized =
      auth === `Bearer ${CRON_SECRET}` || querySecret === CRON_SECRET;
    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const branch = body.branch || "main";

  // Query employees directly with IP + secret — bypass getEmployeeBackend's
  // strict "active" status check since unhealthy droplets may still be reachable
  const targetEmployees = await db
    .select({
      id: employees.id,
      name: employees.name,
      dropletIp: employees.dropletIp,
      interserviceSecret: employees.interserviceSecret,
    })
    .from(employees)
    .where(
      and(
        inArray(employees.dropletStatus, ["active", "unhealthy"]),
        isNotNull(employees.dropletIp),
        isNotNull(employees.interserviceSecret),
      ),
    );

  // Dedupe by dropletIp — multiple employees may share a droplet
  const seen = new Set<string>();
  const results = [];

  for (const emp of targetEmployees) {
    if (!emp.dropletIp || !emp.interserviceSecret) continue;
    if (seen.has(emp.dropletIp)) {
      results.push({ id: emp.id, name: emp.name, status: "skipped", reason: "droplet already updated" });
      continue;
    }
    seen.add(emp.dropletIp);

    try {
      const backend = createBackendClient({
        url: `http://${emp.dropletIp}:3001`,
        secret: emp.interserviceSecret,
      });
      const result = await backend.hotUpdate(branch);
      results.push({ id: emp.id, name: emp.name, status: "ok", result });
    } catch (err: any) {
      results.push({ id: emp.id, name: emp.name, status: "error", error: err.message });
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() });
}
