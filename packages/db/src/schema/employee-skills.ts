import { pgTable, uuid, varchar, boolean, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { employees } from "./employees.js";

export const employeeSkills = pgTable("employee_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  skillSlug: varchar("skill_slug", { length: 255 }).notNull(),
  source: varchar("source", { length: 50 }).notNull().default("clawhub"),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("uq_employee_skill").on(table.employeeId, table.skillSlug),
]);

export type EmployeeSkill = typeof employeeSkills.$inferSelect;
export type NewEmployeeSkill = typeof employeeSkills.$inferInsert;
