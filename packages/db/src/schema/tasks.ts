import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
import { companies } from "./companies.js";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),

  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),

  // Status: pending | in_progress | completed | blocked
  status: varchar("status", { length: 20 }).notNull().default("pending"),

  // Priority: low | medium | high | urgent
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),

  // Optional: who created it (manager vs employee self-reported)
  source: varchar("source", { length: 20 }).notNull().default("manager"),
  // manager | employee | system

  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
