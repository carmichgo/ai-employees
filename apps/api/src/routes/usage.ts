/**
 * Usage API routes — token usage tracking and cost analysis.
 *
 * All routes require authentication and scope to the user's company.
 *
 * GET /api/usage/summary     — company-wide usage summary (today, 7d, 30d)
 * GET /api/usage/by-employee  — per-employee breakdown for a time range
 * GET /api/usage/by-source    — usage broken down by source (chat, heartbeat, etc.)
 * GET /api/usage/timeline     — daily usage over a time range (for charts)
 */
import type { FastifyInstance } from "fastify";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db, tokenUsageLogs, employees } from "@ai-employees/db";

export async function usageRoutes(fastify: FastifyInstance) {

  // GET /api/usage/summary — high-level usage stats
  fastify.get(
    "/api/usage/summary",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [today, week, month] = await Promise.all([
        getUsageSummary(companyId, todayStart, now),
        getUsageSummary(companyId, sevenDaysAgo, now),
        getUsageSummary(companyId, thirtyDaysAgo, now),
      ]);

      return { today, week, month };
    },
  );

  // GET /api/usage/by-employee — per-employee breakdown
  fastify.get(
    "/api/usage/by-employee",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;
      const query = request.query as { days?: string };
      const days = Math.min(parseInt(query.days || "30", 10), 90);
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

      return { days, employees: rows };
    },
  );

  // GET /api/usage/by-source — usage by source type
  fastify.get(
    "/api/usage/by-source",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;
      const query = request.query as { days?: string };
      const days = Math.min(parseInt(query.days || "30", 10), 90);
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

      return { days, sources: rows };
    },
  );

  // GET /api/usage/timeline — daily usage for chart rendering
  fastify.get(
    "/api/usage/timeline",
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { companyId } = request.user;
      const query = request.query as { days?: string; employeeId?: string };
      const days = Math.min(parseInt(query.days || "30", 10), 90);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(tokenUsageLogs.companyId, companyId),
        gte(tokenUsageLogs.createdAt, since),
      ];
      if (query.employeeId) {
        conditions.push(eq(tokenUsageLogs.employeeId, query.employeeId));
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

      return { days, timeline: rows };
    },
  );
}

/** Get aggregated usage for a company over a time range */
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
