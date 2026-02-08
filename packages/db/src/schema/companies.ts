import { pgTable, uuid, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  plan: varchar("plan", { length: 50 }).notNull().default("starter"),
  maxEmployees: integer("max_employees").notNull().default(5),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  settings: jsonb("settings").notNull().default({}),
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

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
