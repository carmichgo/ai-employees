import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
import { companies } from "./companies.js";

export const triggers = pgTable("triggers", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),

  // Type: "schedule" | "webhook" | "event"
  type: varchar("type", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),

  // Config varies by type:
  // schedule: { cron: "0 9 * * *", message: "Check emails and respond" }
  // webhook:  { source: "github", secret: "...", message: "New event: {{body}}" }
  // event:    { event: "slack_mention", message: "Someone mentioned you" }
  config: jsonb("config").notNull().default({}),

  enabled: boolean("enabled").notNull().default(true),

  // For webhook triggers — unique token used in the webhook URL
  webhookToken: varchar("webhook_token", { length: 100 }),

  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Trigger = typeof triggers.$inferSelect;
export type NewTrigger = typeof triggers.$inferInsert;
