import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { cities, niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";

export const productSubscriptionStatusEnum = pgEnum("product_subscription_status", [
  "active",
  "cancelled",
]);

export const productPlans = pgTable("product_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  maxActiveOffers: integer("max_active_offers").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyProductSubscriptions = pgTable("company_product_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  planId: uuid("plan_id").references(() => productPlans.id).notNull(),
  status: productSubscriptionStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productOffers = pgTable(
  "product_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id).notNull(),
    cityId: uuid("city_id").references(() => cities.id).notNull(),
    nicheId: uuid("niche_id").references(() => niches.id).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priceCents: integer("price_cents").notNull(),
    originalPriceCents: integer("original_price_cents"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cityNicheIdx: index("product_offers_city_niche_idx").on(
      table.cityId,
      table.nicheId,
      table.isActive
    ),
  })
);
