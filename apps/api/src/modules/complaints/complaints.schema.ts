import { pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { searches, searchResults } from "../search/search.schema";
import { companies } from "../companies/companies.schema";

export const complaintReasonEnum = pgEnum("customer_complaint_reason", [
  "NO_STOCK",
  "PRICE_DIFFERENT",
  "BAD_SERVICE",
  "OTHER",
]);

export const complaintChannelEnum = pgEnum("customer_complaint_channel", [
  "web",
  "whatsapp",
  "other",
]);

export const complaintStatusEnum = pgEnum("customer_complaint_status", [
  "OPEN",
  "REVIEWED",
  "DISCARDED",
]);

export const customerComplaints = pgTable("customer_complaints", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .references(() => companies.id)
    .notNull(),
  searchId: uuid("search_id").references(() => searches.id),
  resultId: uuid("result_id").references(() => searchResults.id),
  reason: complaintReasonEnum("reason").notNull(),
  comment: text("comment"),
  channel: complaintChannelEnum("channel").notNull(),
  customerHash: varchar("customer_hash", { length: 255 }),
  status: complaintStatusEnum("status").notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ComplaintRecord = typeof customerComplaints.$inferSelect;
