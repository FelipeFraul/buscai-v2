CREATE TYPE "notification_category" AS ENUM ('financial', 'visibility', 'subscription', 'contacts', 'system');
CREATE TYPE "notification_severity" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "notification_kind" AS ENUM ('event', 'summary', 'alert');
CREATE TYPE "notification_frequency" AS ENUM ('real_time', 'daily', 'weekly', 'never');

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "category" "notification_category" NOT NULL,
  "severity" "notification_severity" NOT NULL DEFAULT 'low',
  "kind" "notification_kind" NOT NULL DEFAULT 'event',
  "title" text NOT NULL,
  "message" text,
  "reason" text,
  "cta_label" text,
  "cta_url" text,
  "dedupe_key" text,
  "bucket_date" date,
  "metadata" jsonb,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "notification_preferences" (
  "company_id" uuid PRIMARY KEY REFERENCES "companies"("id"),
  "panel_enabled" boolean NOT NULL DEFAULT true,
  "financial_enabled" boolean NOT NULL DEFAULT true,
  "visibility_enabled" boolean NOT NULL DEFAULT true,
  "subscription_enabled" boolean NOT NULL DEFAULT true,
  "contacts_enabled" boolean NOT NULL DEFAULT true,
  "system_enabled" boolean NOT NULL DEFAULT false,
  "frequency" "notification_frequency" NOT NULL DEFAULT 'real_time',
  "whatsapp_enabled" boolean NOT NULL DEFAULT false,
  "email_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "notifications_company_created_idx" ON "notifications" ("company_id", "created_at" desc);
CREATE INDEX "notifications_company_read_idx" ON "notifications" ("company_id", "read_at");
CREATE UNIQUE INDEX "notifications_company_dedupe_idx" ON "notifications" ("company_id", "dedupe_key", "bucket_date");
CREATE INDEX "notification_preferences_company_idx" ON "notification_preferences" ("company_id");
