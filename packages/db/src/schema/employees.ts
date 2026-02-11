import { pgTable, uuid, varchar, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),

  // Identity
  name: varchar("name", { length: 255 }).notNull(),
  jobTitle: varchar("job_title", { length: 255 }).notNull(),
  templateId: varchar("template_id", { length: 100 }),
  avatar: varchar("avatar", { length: 500 }),
  emoji: varchar("emoji", { length: 10 }).default("🤖"),

  // Status & lifecycle
  status: varchar("status", { length: 20 }).notNull().default("provisioning"),
  // provisioning | onboarding | active | paused | terminated | error

  // OpenClaw container
  containerId: varchar("container_id", { length: 100 }),
  containerName: varchar("container_name", { length: 255 }),
  containerHost: varchar("container_host", { length: 255 }),
  containerPort: integer("container_port").default(18789),
  gatewayToken: varchar("gateway_token", { length: 500 }),

  // Configuration
  modelConfig: jsonb("model_config").notNull().default({
    primary: "anthropic/claude-sonnet-4-20250514",
  }),
  persona: text("persona"),
  goals: text("goals"),
  toolsConfig: jsonb("tools_config").notNull().default({}),
  sandboxConfig: jsonb("sandbox_config").notNull().default({}),

  // Provisioned accounts
  emailAddress: varchar("email_address", { length: 255 }),
  provisionedAccounts: jsonb("provisioned_accounts").notNull().default({}),
  // { slack: { botToken: "...", teamId: "..." }, telegram: { token: "..." }, ... }

  // Stored credentials (logins, API keys, etc.)
  credentials: jsonb("credentials").notNull().default([]),
  // [{ id, label, username, password, url?, notes? }]

  // Metadata
  configHash: varchar("config_hash", { length: 64 }),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
