import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { cities, niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";

export const searchSourceEnum = pgEnum("search_source", ["whatsapp", "web", "demo"]);
export const searchEventTypeEnum = pgEnum("search_event_type", [
  "impression",
  "click_whatsapp",
  "click_call",
]);

export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  queryText: text("query_text").notNull(),
  cityId: uuid("city_id").references(() => cities.id),
  nicheId: uuid("niche_id").references(() => niches.id).notNull(),
  source: searchSourceEnum("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const searchResults = pgTable("search_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  searchId: uuid("search_id").references(() => searches.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  rank: integer("rank"),
  isPaid: boolean("is_paid").notNull().default(false),
  position: integer("position"),
  clickTrackingId: varchar("click_tracking_id", { length: 255 }),
  chargedAmount: numeric("charged_amount").notNull().default("0"),
});

export const searchEvents = pgTable("search_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  searchId: uuid("search_id").references(() => searches.id).notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  type: searchEventTypeEnum("type").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
