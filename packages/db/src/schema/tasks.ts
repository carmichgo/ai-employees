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

  // Category/label for grouping (e.g. "marketing", "engineering", "research")
  category: varchar("category", { length: 100 }),

  // Due date for the task
  dueDate: timestamp("due_date", { withTimezone: true }),

  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ── Task Comments (activity feed) ────────────────────

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),

  // Who posted: "manager" (human), "employee" (AI), "system" (status change)
  authorType: varchar("author_type", { length: 20 }).notNull(),

  // Display name of the author
  authorName: varchar("author_name", { length: 200 }).notNull(),

  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
