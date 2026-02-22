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

  // Tier — determines model, pricing, and container resources
  tier: varchar("tier", { length: 20 }).notNull().default("junior"),
  // junior | senior | expert

  // Stripe billing — links this employee to a line item on the company subscription
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id", { length: 255 }),
  priceMonthly: integer("price_monthly"),

  // Status & lifecycle
  status: varchar("status", { length: 20 }).notNull().default("provisioning"),
  // provisioning | onboarding | active | paused | terminated | error

  // Per-employee DigitalOcean droplet
  dropletId: varchar("droplet_id", { length: 50 }),
  dropletIp: varchar("droplet_ip", { length: 45 }),
  dropletRegion: varchar("droplet_region", { length: 20 }),
  dropletSize: varchar("droplet_size", { length: 50 }),
  dropletStatus: varchar("droplet_status", { length: 20 }).default("none"),
  interserviceSecret: varchar("interservice_secret", { length: 255 }),

  // OpenClaw container
  containerId: varchar("container_id", { length: 100 }),
  containerName: varchar("container_name", { length: 255 }),
  containerHost: varchar("container_host", { length: 255 }),
  containerPort: integer("container_port").default(18789),
  gatewayToken: varchar("gateway_token", { length: 500 }),

  // Configuration
  modelConfig: jsonb("model_config").notNull().default({
    primary: "anthropic/claude-opus-4-6",
  }),
  persona: text("persona"),
  goals: text("goals"),
  personalityConfig: jsonb("personality_config").notNull().default({
    autonomy: "high",
    proactivity: "proactive",
    communication: "concise",
  }),
  toolsConfig: jsonb("tools_config").notNull().default({}),
  sandboxConfig: jsonb("sandbox_config").notNull().default({}),

  // Authority — who can assign tasks vs. who can only ask questions
  authorityConfig: jsonb("authority_config").notNull().default({
    defaultRole: "manager",
    members: [],
  }),
  // {
  //   defaultRole: "manager" | "colleague" — what role do unrecognized Slack users get
  //   members: [{ slackUserId: "U...", name: "Alice", role: "manager" | "colleague" }]
  // }

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
