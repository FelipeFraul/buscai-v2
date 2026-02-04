import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  numeric,
  integer,
} from "drizzle-orm/pg-core";

import { users } from "../auth/auth.schema";
import { cities, niches } from "../catalog/catalog.schema";
import { serpapiImportRuns } from "../serpapi/serpapi.schema";

export const companyStatusEnum = pgEnum("company_status", ["draft", "pending", "active", "suspended"]);
export const companySourceEnum = pgEnum("company_source", ["serpapi", "manual", "claimed"]);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  tradeName: varchar("trade_name", { length: 255 }).notNull(),
  legalName: varchar("legal_name", { length: 255 }),
  cityId: uuid("city_id").references(() => cities.id).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 32 }),
  whatsapp: varchar("whatsapp", { length: 32 }),
  openingHours: varchar("opening_hours", { length: 255 }),
  website: text("website"),
  lat: numeric("lat"),
  lng: numeric("lng"),
  qualityScore: integer("quality_score").notNull().default(50),
  source: companySourceEnum("source").notNull().default("manual"),
  sourceRef: text("source_ref"),
  sourceRunId: uuid("source_run_id").references(() => serpapiImportRuns.id),
  normalizedPhone: text("normalized_phone"),
  normalizedName: text("normalized_name"),
  createdFromImport: boolean("created_from_import").notNull().default(false),
  participatesInAuction: boolean("participates_in_auction").notNull().default(false),
  hasWhatsapp: boolean("has_whatsapp").notNull().default(false),
  status: companyStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyNiches = pgTable(
  "company_niches",
  {
    companyId: uuid("company_id").references(() => companies.id).notNull(),
    nicheId: uuid("niche_id").references(() => niches.id).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.companyId, table.nicheId] }),
  })
);
