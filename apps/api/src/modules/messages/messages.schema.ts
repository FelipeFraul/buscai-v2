import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { companies } from "../companies/companies.schema";
import { searches } from "../search/search.schema";

export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);

export const messageHistory = pgTable("message_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  direction: messageDirectionEnum("direction").notNull(),
  peerE164: text("peer_e164").notNull(),
  providerMessageId: text("provider_message_id"),
  text: text("text").notNull(),
  searchId: uuid("search_id").references(() => searches.id),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
