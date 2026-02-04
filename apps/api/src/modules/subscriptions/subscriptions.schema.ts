import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { companies } from "../companies/companies.schema";
import { productPlans } from "../products/products.schema";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
]);

export const subscriptionPaymentMethodEnum = pgEnum("subscription_payment_method", [
  "card",
  "wallet",
]);

export const paymentProviderEnum = pgEnum("payment_provider", [
  "stripe",
  "pagarme",
  "mercadopago",
  "dummy",
]);

export const paymentMethodStatusEnum = pgEnum("payment_method_status", [
  "active",
  "revoked",
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  planId: uuid("plan_id").references(() => productPlans.id).notNull(),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
    .notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  graceUntil: timestamp("grace_until", { withTimezone: true }),
  scheduledPlanId: uuid("scheduled_plan_id").references(() => productPlans.id),
  paymentMethod: subscriptionPaymentMethodEnum("payment_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").references(() => companies.id).notNull(),
  provider: paymentProviderEnum("provider").notNull(),
  customerId: text("customer_id").notNull(),
  paymentMethodId: text("payment_method_id").notNull(),
  status: paymentMethodStatusEnum("status").notNull().default("active"),
  last4: varchar("last4", { length: 4 }),
  brand: text("brand"),
  expMonth: integer("exp_month"),
  expYear: integer("exp_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
