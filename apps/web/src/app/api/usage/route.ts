/**
 * Usage API — token usage tracking and cost analysis.
 *
 * GET /api/usage?view=summary        — company-wide usage summary (today, 7d, 30d)
 * GET /api/usage?view=by-employee    — per-employee breakdown
 * GET /api/usage?view=by-source      — usage by source type (chat, heartbeat, etc.)
 * GET /api/usage?view=timeline       — daily usage timeline for charts
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tokenUsageLogs, employees } from "@/lib/schema";
import { verifyToken } from "@/lib/auth";

async function authenticate(request: NextRequest) {
  const token =
    request.cookies.get("token")?.value ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  const session = await authenticate(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId } = session;
  const view = request.nextUrl.searchParams.get("view") || "summary";
  const days = Math.min(parseInt(request.nextUrl.searchParams.get("days") || "30", 10), 90);
  const employeeId = request.nextUrl.searchParams.get("employeeId");

  try {
    switch (view) {
      case "summary": {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [today, week, month] = await Promise.all([
          getUsageSummary(companyId, todayStart, now),
          getUsageSummary(companyId, sevenDaysAgo, now),
          getUsageSummary(companyId, thirtyDaysAgo, now),
        ]);

        return NextResponse.json({ today, week, month });
      }

      case "by-employee": {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await db
          .select({
            employeeId: tokenUsageLogs.employeeId,
            employeeName: employees.name,
            employeeTier: employees.tier,
            model: tokenUsageLogs.model,
            requests: sql<number>`count(*)::int`,
            tokensInput: sql<number>`sum(${tokenUsageLogs.tokensInput})::int`,
            tokensOutput: sql<number>`sum(${tokenUsageLogs.tokensOutput})::int`,
            estimatedCostUsd: sql<string>`sum(${tokenUsageLogs.estimatedCostUsd})::numeric(10,2)`,
          })
          .from(tokenUsageLogs)
          .innerJoin(employees, eq(tokenUsageLogs.employeeId, employees.id))
          .where(
            and(
              eq(tokenUsageLogs.companyId, companyId),
              gte(tokenUsageLogs.createdAt, since),
            ),
          )
          .groupBy(tokenUsageLogs.employeeId, employees.name, employees.tier, tokenUsageLogs.model)
          .orderBy(desc(sql`sum(${tokenUsageLogs.estimatedCostUsd})`));

        return NextResponse.json({ days, employees: rows });
      }

      case "by-source": {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await db
          .select({
            source: tokenUsageLogs.source,
            requests: sql<number>`count(*)::int`,
            tokensInput: sql<number>`sum(${tokenUsageLogs.tokensInput})::int`,
            tokensOutput: sql<number>`sum(${tokenUsageLogs.tokensOutput})::int`,
            estimatedCostUsd: sql<string>`sum(${tokenUsageLogs.estimatedCostUsd})::numeric(10,2)`,
          })
          .from(tokenUsageLogs)
          .where(
            and(
              eq(tokenUsageLogs.companyId, companyId),
              gte(tokenUsageLogs.createdAt, since),
            ),
          )
          .groupBy(tokenUsageLogs.source)
          .orderBy(desc(sql`sum(${tokenUsageLogs.estimatedCostUsd})`));

        return NextResponse.json({ days, sources: rows });
      }

      case "timeline": {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const conditions = [
          eq(tokenUsageLogs.companyId, companyId),
          gte(tokenUsageLogs.createdAt, since),
        ];
        if (employeeId) {
          conditions.push(eq(tokenUsageLogs.employeeId, employeeId));
        }

        const rows = await db
          .select({
            date: sql<string>`date_trunc('day', ${tokenUsageLogs.createdAt})::date::text`,
            requests: sql<number>`count(*)::int`,
            tokensInput: sql<number>`sum(${tokenUsageLogs.tokensInput})::int`,
            tokensOutput: sql<number>`sum(${tokenUsageLogs.tokensOutput})::int`,
            estimatedCostUsd: sql<string>`sum(${tokenUsageLogs.estimatedCostUsd})::numeric(10,2)`,
          })
          .from(tokenUsageLogs)
          .where(and(...conditions))
          .groupBy(sql`date_trunc('day', ${tokenUsageLogs.createdAt})`)
          .orderBy(sql`date_trunc('day', ${tokenUsageLogs.createdAt})`);

        return NextResponse.json({ days, timeline: rows });
      }

      default:
        return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`[usage] Error for view=${view}:`, err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

async function getUsageSummary(companyId: string, from: Date, to: Date) {
  const [row] = await db
    .select({
      requests: sql<number>`count(*)::int`,
      tokensInput: sql<number>`coalesce(sum(${tokenUsageLogs.tokensInput}), 0)::int`,
      tokensOutput: sql<number>`coalesce(sum(${tokenUsageLogs.tokensOutput}), 0)::int`,
      estimatedCostUsd: sql<string>`coalesce(sum(${tokenUsageLogs.estimatedCostUsd}), 0)::numeric(10,2)`,
    })
    .from(tokenUsageLogs)
    .where(
      and(
        eq(tokenUsageLogs.companyId, companyId),
        gte(tokenUsageLogs.createdAt, from),
        lte(tokenUsageLogs.createdAt, to),
      ),
    );

  return row || { requests: 0, tokensInput: 0, tokensOutput: 0, estimatedCostUsd: "0.00" };
}
