import { boolean, integer, numeric, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { cities, niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";

export const auctionModeEnum = pgEnum("auction_mode", ["manual", "smart", "auto"]);
export const auctionTargetShareEnum = pgEnum("auction_target_share", [
  "one_in_3",
  "one_in_5",
  "one_in_10",
]);

export const auctionConfigs = pgTable("auction_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  cityId: uuid("city_id").references(() => cities.id).notNull(),
  nicheId: uuid("niche_id").references(() => niches.id).notNull(),
  mode: auctionModeEnum("mode").notNull(),
  bidPosition1: numeric("bid_position1"),
  bidPosition2: numeric("bid_position2"),
  bidPosition3: numeric("bid_position3"),
  targetPosition: integer("target_position"),
  targetShare: auctionTargetShareEnum("target_share"),
  dailyBudget: numeric("daily_budget"),
  pauseOnLimit: boolean("pause_on_limit").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
