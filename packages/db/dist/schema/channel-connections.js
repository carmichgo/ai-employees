import { pgTable, uuid, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { employees } from "./employees.js";
export const channelConnections = pgTable("channel_connections", {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    channelType: varchar("channel_type", { length: 50 }).notNull(),
    // slack | discord | telegram | whatsapp | email | webchat | browser
    name: varchar("name", { length: 255 }).notNull(),
    credentials: jsonb("credentials").notNull().default({}),
    config: jsonb("config").notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // pending | connected | error | disconnected
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=channel-connections.js.map