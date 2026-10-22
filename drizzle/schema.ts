import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

import { bigserial, bigint, text as pgText, jsonb, timestamp as pgTimestamp, pgTable, index } from "drizzle-orm/pg-core";

/**
 * Append-only events table for event log branching.
 */
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    offset: bigint("offset", { mode: "number" }).notNull().unique(),
    eventType: pgText("event_type").notNull(),
    resourceId: pgText("resource_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: pgTimestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("events_offset_idx").on(table.offset),
    index("events_resource_id_idx").on(table.resourceId),
  ]
);

export type EventRecordRow = typeof events.$inferSelect;
export type InsertEventRow = typeof events.$inferInsert;