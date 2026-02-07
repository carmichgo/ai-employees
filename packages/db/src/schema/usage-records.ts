import { pgTable, uuid, varchar, bigint, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { employees } from "./employees.js";

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
