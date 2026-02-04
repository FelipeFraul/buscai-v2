import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from "drizzle-orm/pg-core";

import { users } from "../auth/auth.schema";
import { companies } from "../companies/companies.schema";
export const claimMethodEnum = pgEnum("claim_request_method", [
  "whatsapp_otp",
  "cnpj_whatsapp",
]);

export const claimStatusEnum = pgEnum("claim_request_status", [
  "pending",
  "verified",
  "rejected",
  "cancelled",
]);

export const claimRequests = pgTable("claim_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  method: claimMethodEnum("method").notNull(),
  status: claimStatusEnum("status").notNull().default("pending"),
  requestedPhone: text("requested_phone"),
  serpPhone: text("serp_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  attemptsCount: integer("attempts_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  notes: text("notes"),
});

export const companyChannelTypeEnum = pgEnum("company_channel_type", [
  "whatsapp",
  "phone",
]);

export const companyChannelSourceEnum = pgEnum("company_channel_source", [
  "serpapi",
  "owner",
]);

export const companyChannelStatusEnum = pgEnum("company_channel_status", [
  "unverified",
  "verified",
]);

export const companyChannels = pgTable("company_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  type: companyChannelTypeEnum("type").notNull(),
  value: text("value").notNull(),
  source: companyChannelSourceEnum("source").notNull(),
  status: companyChannelStatusEnum("status").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClaimMethod = "whatsapp_otp" | "cnpj_whatsapp";
export type ClaimStatus = "pending" | "verified" | "rejected" | "cancelled";
