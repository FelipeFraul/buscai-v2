import { boolean, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "../auth/auth.schema";
import { cities, niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";
import { searches } from "../search/search.schema";

export const offeredByConfigs = pgTable(
  "offered_by_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id).notNull(),
    cityId: uuid("city_id").references(() => cities.id),
    nicheId: uuid("niche_id").references(() => niches.id),
    text: varchar("text", { length: 160 }),
    imageUrl: text("image_url"),
    website: varchar("website", { length: 500 }),
    promotionsUrl: varchar("promotions_url", { length: 500 }),
    phoneE164: varchar("phone_e164", { length: 32 }),
    whatsappE164: varchar("whatsapp_e164", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cityNicheActiveIdx: index("offered_by_configs_city_niche_active_idx").on(
      table.cityId,
      table.nicheId,
      table.isActive
    ),
    companyIdx: index("offered_by_configs_company_idx").on(table.companyId),
  })
);

export const offeredByEventTypeEnum = pgEnum("offered_by_event_type", [
  "impression",
  "click_whatsapp",
  "click_call",
  "click_site",
  "click_promotions",
]);

export const offeredBySourceEnum = pgEnum("offered_by_source", ["web", "whatsapp", "demo"]);
export const offeredBySearchTypeEnum = pgEnum("offered_by_search_type", [
  "niche",
  "company",
  "product",
]);

export const offeredByEvents = pgTable(
  "offered_by_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configId: uuid("config_id").references(() => offeredByConfigs.id).notNull(),
    companyId: uuid("company_id").references(() => companies.id).notNull(),
    searchId: uuid("search_id").references(() => searches.id),
    cityId: uuid("city_id").references(() => cities.id),
    nicheId: uuid("niche_id").references(() => niches.id),
    source: offeredBySourceEnum("source").notNull(),
    searchType: offeredBySearchTypeEnum("search_type").notNull().default("niche"),
    type: offeredByEventTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    configIdx: index("offered_by_events_config_idx").on(table.configId, table.createdAt),
    cityIdx: index("offered_by_events_city_idx").on(table.cityId),
    nicheIdx: index("offered_by_events_niche_idx").on(table.nicheId),
  })
);
