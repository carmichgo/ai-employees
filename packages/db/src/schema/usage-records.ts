import { pgTable, uuid, varchar, bigint, integer, timestamp, numeric, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { employees } from "./employees.js";

/**
 * Aggregated usage records — kept for backward compatibility with billing.
 */
export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  employeeId: uuid("employee_id").references(() => employees.id),
  metric: varchar("metric", { length: 50 }).notNull(),
  // messages | tokens_input | tokens_output | active_minutes | browser_minutes
  value: bigint("value", { mode: "number" }).notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;

/**
 * Per-request token usage log — every LLM API call is recorded here.
 * This enables cost tracking, per-employee usage analysis, and spending alerts.
 *
 * Source values:
 *   "chat"       — dashboard chat (user → employee)
 *   "heartbeat"  — 15-min heartbeat prompt
 *   "task-check" — task board nudge
 *   "schedule"   — cron-based schedule trigger
 *   "webhook"    — webhook trigger
 *   "slack"      — Slack message proxy
 *   "team"       — inter-employee message
 */
export const tokenUsageLogs = pgTable("token_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  employeeId: uuid("employee_id").notNull().references(() => employees.id),
  source: varchar("source", { length: 30 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  // Estimated cost in USD (calculated from model pricing at time of request)
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_token_usage_employee_created").on(table.employeeId, table.createdAt),
  index("idx_token_usage_company_created").on(table.companyId, table.createdAt),
]);

export type TokenUsageLog = typeof tokenUsageLogs.$inferSelect;
export type NewTokenUsageLog = typeof tokenUsageLogs.$inferInsert;
