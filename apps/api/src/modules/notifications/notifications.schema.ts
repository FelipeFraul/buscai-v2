import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { companies } from "../companies/companies.schema";

export const notificationCategoryEnum = pgEnum("notification_category", [
  "financial",
  "visibility",
  "subscription",
  "contacts",
  "system",
]);

export const notificationSeverityEnum = pgEnum("notification_severity", [
  "low",
  "medium",
  "high",
]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "event",
  "summary",
  "alert",
]);

export const notificationFrequencyEnum = pgEnum("notification_frequency", [
  "real_time",
  "daily",
  "weekly",
  "never",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id).notNull(),
    category: notificationCategoryEnum("category").notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("low"),
    kind: notificationKindEnum("kind").notNull().default("event"),
    title: text("title").notNull(),
    message: text("message"),
    reason: text("reason"),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    dedupeKey: text("dedupe_key"),
    bucketDate: date("bucket_date"),
    metadata: jsonb("metadata"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("notifications_company_created_idx").on(
      table.companyId,
      table.createdAt
    ),
    companyReadIdx: index("notifications_company_read_idx").on(
      table.companyId,
      table.readAt
    ),
    dedupeIdx: uniqueIndex("notifications_company_dedupe_idx").on(
      table.companyId,
      table.dedupeKey,
      table.bucketDate
    ),
  })
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    companyId: uuid("company_id")
      .references(() => companies.id)
      .notNull()
      .primaryKey(),
    panelEnabled: boolean("panel_enabled").notNull().default(true),
    financialEnabled: boolean("financial_enabled").notNull().default(true),
    visibilityEnabled: boolean("visibility_enabled").notNull().default(true),
    subscriptionEnabled: boolean("subscription_enabled").notNull().default(true),
    contactsEnabled: boolean("contacts_enabled").notNull().default(true),
    systemEnabled: boolean("system_enabled").notNull().default(false),
    frequency: notificationFrequencyEnum("frequency").notNull().default("real_time"),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("notification_preferences_company_idx").on(table.companyId),
  })
);
