import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export const internalEventTypeEnum = pgEnum("internal_event_type", [
  "slow_query",
  "timeout",
  "auction_error",
  "billing_error",
  "search_error",
  "circuit_open",
  "webhook_failure",
  "search_performed",
  "search_click",
]);

export const internalEvents = pgTable(
  "internal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: internalEventTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeIdx: index("internal_events_type_idx").on(table.type),
    createdAtIdx: index("internal_events_created_at_idx").on(table.createdAt),
  })
);
