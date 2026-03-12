import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { employees } from "./employees.js";

export const employeeApps = pgTable("employee_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),

  // App identity
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  emoji: varchar("emoji", { length: 10 }).default("🔧"),

  // How to access the app
  // type: "script" | "skill" | "webapp" | "api" | "tool"
  type: varchar("type", { length: 50 }).notNull().default("tool"),

  // Path within the employee's workspace (e.g. "workspace-main/apps/email-sender")
  workspacePath: varchar("workspace_path", { length: 500 }),

  // URL if it's a hosted webapp (external Vercel deploy, or auto-set for internal deploys)
  url: varchar("url", { length: 1000 }),

  // Hosting mode: "external" (user provides URL) | "internal" (hosted by us, HTML stored in DB)
  hostingMode: varchar("hosting_mode", { length: 20 }).notNull().default("external"),

  // HTML content for internally-hosted apps (single-page HTML with inlined JS/CSS)
  htmlContent: text("html_content"),

  // Version counter for internal deploys
  deployVersion: varchar("deploy_version", { length: 50 }).default("0"),

  // Instructions on how to use this app
  instructions: text("instructions"),

  // Sharing
  shared: boolean("shared").notNull().default(true),

  // Whether the app is publicly accessible (no auth required)
  isPublic: boolean("is_public").notNull().default(true),

  // Status: active | archived
  status: varchar("status", { length: 20 }).notNull().default("active"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmployeeApp = typeof employeeApps.$inferSelect;
export type NewEmployeeApp = typeof employeeApps.$inferInsert;
