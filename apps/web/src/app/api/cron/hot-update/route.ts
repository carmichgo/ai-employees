import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/lib/schema";
import { getEmployeeBackend, createBackendClient } from "@/lib/backend";

export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/hot-update
 * Trigger hot-update on all active employee droplets.
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

  const activeEmployees = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.dropletStatus, "active"),
        isNotNull(employees.dropletIp),
      ),
    );

  const results = [];

  for (const emp of activeEmployees) {
    try {
      const backendConfig = await getEmployeeBackend(emp.id);
      if (!backendConfig) {
        results.push({ id: emp.id, name: emp.name, status: "skipped", reason: "backend not ready" });
        continue;
      }
      const backend = createBackendClient(backendConfig);
      const result = await backend.hotUpdate(branch);
      results.push({ id: emp.id, name: emp.name, status: "ok", result });
    } catch (err: any) {
      results.push({ id: emp.id, name: emp.name, status: "error", error: err.message });
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() });
}
