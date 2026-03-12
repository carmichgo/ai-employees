import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  boolean,
  bigint,
  jsonb,
  timestamp,
  numeric,
  index,
  unique,
} from "drizzle-orm/pg-core";

// ── Companies ──────────────────────────────────────────
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  plan: varchar("plan", { length: 50 }).notNull().default("starter"),
  maxEmployees: integer("max_employees").notNull().default(5),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  settings: jsonb("settings").notNull().default({}),
  // Stripe billing
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  // Per-company DigitalOcean droplet
  dropletId: varchar("droplet_id", { length: 50 }),
  dropletIp: varchar("droplet_ip", { length: 45 }),
  dropletRegion: varchar("droplet_region", { length: 20 }).default("nyc3"),
  dropletSize: varchar("droplet_size", { length: 50 }).default("s-2vcpu-4gb"),
  dropletStatus: varchar("droplet_status", { length: 20 }).default("none"),
  interserviceSecret: varchar("interservice_secret", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Users ──────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Employees ──────────────────────────────────────────
export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  jobTitle: varchar("job_title", { length: 255 }).notNull(),
  templateId: varchar("template_id", { length: 100 }),
  avatar: varchar("avatar", { length: 500 }),
  emoji: varchar("emoji", { length: 10 }).default("🤖"),
  tier: varchar("tier", { length: 20 }).notNull().default("junior"),
  /** Stripe subscription item ID — links this employee to a line item on the company subscription */
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id", { length: 255 }),
  /** Monthly price in dollars for this employee (base + add-ons) */
  priceMonthly: integer("price_monthly"),
  status: varchar("status", { length: 20 }).notNull().default("provisioning"),
  // Per-employee DigitalOcean droplet
  dropletId: varchar("droplet_id", { length: 50 }),
  dropletIp: varchar("droplet_ip", { length: 45 }),
  dropletRegion: varchar("droplet_region", { length: 20 }),
  dropletSize: varchar("droplet_size", { length: 50 }),
  dropletStatus: varchar("droplet_status", { length: 20 }).default("none"),
  interserviceSecret: varchar("interservice_secret", { length: 255 }),
  containerId: varchar("container_id", { length: 100 }),
  containerName: varchar("container_name", { length: 255 }),
  containerHost: varchar("container_host", { length: 255 }),
  containerPort: integer("container_port").default(18789),
  gatewayToken: varchar("gateway_token", { length: 500 }),
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
  authorityConfig: jsonb("authority_config").notNull().default({
    defaultRole: "manager",
    members: [],
  }),
  emailAddress: varchar("email_address", { length: 255 }),
  phoneNumber: varchar("phone_number", { length: 20 }),
  provisionedAccounts: jsonb("provisioned_accounts").notNull().default({}),
  credentials: jsonb("credentials").notNull().default([]),
  configHash: varchar("config_hash", { length: 64 }),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  lastRequestSentAt: timestamp("last_request_sent_at", { withTimezone: true }),
  lastResponseAt: timestamp("last_response_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Employee Skills ────────────────────────────────────
export const employeeSkills = pgTable(
  "employee_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    skillSlug: varchar("skill_slug", { length: 255 }).notNull(),
    source: varchar("source", { length: 50 }).notNull().default("clawhub"),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("uq_employee_skill").on(table.employeeId, table.skillSlug)],
);

// ── Channel Connections ────────────────────────────────
export const channelConnections = pgTable("channel_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  channelType: varchar("channel_type", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  credentials: jsonb("credentials").notNull().default({}),
  config: jsonb("config").notNull().default({}),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Chat Messages ──────────────────────────────────────
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  role: varchar("role", { length: 20 }).notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  mode: varchar("mode", { length: 20 }), // "live" | "demo"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Audit Logs ─────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Triggers ──────────────────────────────────────────
export const triggers = pgTable("triggers", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  type: varchar("type", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  config: jsonb("config").notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  webhookToken: varchar("webhook_token", { length: 100 }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Tasks ──────────────────────────────────────────────
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
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  source: varchar("source", { length: 20 }).notNull().default("manager"),
  category: varchar("category", { length: 100 }),
  triggerId: uuid("trigger_id").references(() => triggers.id, { onDelete: "set null" }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Task Comments ──────────────────────────────────────
export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  authorType: varchar("author_type", { length: 20 }).notNull(),
  authorName: varchar("author_name", { length: 200 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Usage Records ──────────────────────────────────────
export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  employeeId: uuid("employee_id").references(() => employees.id),
  metric: varchar("metric", { length: 50 }).notNull(),
  value: bigint("value", { mode: "number" }).notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Token Usage Logs ──────────────────────────────────
export const tokenUsageLogs = pgTable("token_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  source: varchar("source", { length: 30 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_token_usage_employee_created").on(table.employeeId, table.createdAt),
  index("idx_token_usage_company_created").on(table.companyId, table.createdAt),
]);

// ── Spreadsheet Bases (project containers for tables) ──────
export const spreadsheetBases = pgTable("spreadsheet_bases", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 20 }).default("#3b82f6"),
  icon: varchar("icon", { length: 10 }).default("📊"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Spreadsheet Tables (Airtable-style DB) ──────────────
export const spreadsheetTables = pgTable("spreadsheet_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  baseId: uuid("base_id")
    .references(() => spreadsheetBases.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spreadsheetColumns = pgTable("spreadsheet_columns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => spreadsheetTables.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("text"),
  // type: text | number | boolean | date | select | url | email
  options: jsonb("options").notNull().default({}),
  // For select: { choices: ["Option A", "Option B"] }
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spreadsheetRows = pgTable("spreadsheet_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => spreadsheetTables.id, { onDelete: "cascade" }),
  cells: jsonb("cells").notNull().default({}),
  // { [columnId]: value }
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Employee Apps ─────────────────────────────────────
export const employeeApps = pgTable("employee_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  emoji: varchar("emoji", { length: 10 }).default("🔧"),
  type: varchar("type", { length: 50 }).notNull().default("tool"),
  workspacePath: varchar("workspace_path", { length: 500 }),
  url: varchar("url", { length: 1000 }),
  instructions: text("instructions"),
  shared: boolean("shared").notNull().default(true),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Pending Hires (stores hire payload while Stripe Checkout is in progress) ──
export const pendingHires = pgTable("pending_hires", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Subscriptions (one per company — employees are line items) ──
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).notNull().unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("incomplete"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
