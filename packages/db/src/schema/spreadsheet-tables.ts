import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const spreadsheetTables = pgTable("spreadsheet_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpreadsheetTable = typeof spreadsheetTables.$inferSelect;
export type NewSpreadsheetTable = typeof spreadsheetTables.$inferInsert;

export const spreadsheetColumns = pgTable("spreadsheet_columns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => spreadsheetTables.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull().default("text"),
  options: jsonb("options").notNull().default({}),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpreadsheetColumn = typeof spreadsheetColumns.$inferSelect;
export type NewSpreadsheetColumn = typeof spreadsheetColumns.$inferInsert;

export const spreadsheetRows = pgTable("spreadsheet_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id")
    .notNull()
    .references(() => spreadsheetTables.id, { onDelete: "cascade" }),
  cells: jsonb("cells").notNull().default({}),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpreadsheetRow = typeof spreadsheetRows.$inferSelect;
export type NewSpreadsheetRow = typeof spreadsheetRows.$inferInsert;
