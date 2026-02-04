import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { niches } from "../catalog/catalog.schema";
import { companies } from "../companies/companies.schema";

export const contactChannelEnum = pgEnum("contact_channel", ["whatsapp", "call"]);

export const contactClassificationEnum = pgEnum("contact_classification", [
  "curious",
  "new_client",
  "recurring",
  "quote",
]);

export const contactEvents = pgTable("contact_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  channel: contactChannelEnum("channel").notNull(),
  phone: varchar("phone", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }),
  nicheId: uuid("niche_id").references(() => niches.id),
  classification: contactClassificationEnum("classification"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
