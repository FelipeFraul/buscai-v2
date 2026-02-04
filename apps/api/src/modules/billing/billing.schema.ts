import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { companies } from "../companies/companies.schema";

export const billingTransactionTypeEnum = pgEnum("billing_transaction_type", [
  "credit",
  "debit",
  "search_debit",
  "recharge",
  "wallet_debit",
  "subscription_renewal",
  "subscription_failed",
]);

export const billingTransactionStatusEnum = pgEnum("billing_transaction_status", [
  "pending",
  "confirmed",
  "failed",
  "cancelled",
]);

export const billingWallets = pgTable("billing_wallet", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull().unique(),
  balance: numeric("balance").notNull().default("0"),
  reserved: numeric("reserved").notNull().default("0"),
});

export const billingTransactions = pgTable("billing_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  type: billingTransactionTypeEnum("type").notNull(),
  reason: text("reason"),
  amount: numeric("amount").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  status: billingTransactionStatusEnum("status").notNull().default("confirmed"),
  provider: text("provider"),
  externalId: text("external_id"),
  subscriptionId: uuid("subscription_id"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
