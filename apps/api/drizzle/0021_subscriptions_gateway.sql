DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE "subscription_status" AS ENUM ('active', 'past_due', 'cancelled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_payment_method') THEN
    CREATE TYPE "subscription_payment_method" AS ENUM ('card', 'wallet');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider') THEN
    CREATE TYPE "payment_provider" AS ENUM ('stripe', 'pagarme', 'mercadopago', 'dummy');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_status') THEN
    CREATE TYPE "payment_method_status" AS ENUM ('active', 'revoked');
  END IF;
END $$;

ALTER TYPE "billing_transaction_type" ADD VALUE IF NOT EXISTS 'wallet_debit';
ALTER TYPE "billing_transaction_type" ADD VALUE IF NOT EXISTS 'subscription_renewal';
ALTER TYPE "billing_transaction_type" ADD VALUE IF NOT EXISTS 'subscription_failed';
ALTER TYPE "billing_transaction_status" ADD VALUE IF NOT EXISTS 'failed';

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "plan_id" uuid NOT NULL REFERENCES "product_plans"("id"),
  "status" "subscription_status" NOT NULL DEFAULT 'active',
  "current_period_start" timestamptz NOT NULL,
  "current_period_end" timestamptz NOT NULL,
  "grace_until" timestamptz,
  "scheduled_plan_id" uuid REFERENCES "product_plans"("id"),
  "payment_method" "subscription_payment_method",
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "provider" "payment_provider" NOT NULL,
  "customer_id" text NOT NULL,
  "payment_method_id" text NOT NULL,
  "status" "payment_method_status" NOT NULL DEFAULT 'active',
  "last4" varchar(4),
  "brand" text,
  "exp_month" integer,
  "exp_year" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_payment_methods_company_provider_token"
  ON "payment_methods" ("company_id", "provider", "payment_method_id");

ALTER TABLE "billing_transactions"
  ADD COLUMN IF NOT EXISTS "amount_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "provider" text,
  ADD COLUMN IF NOT EXISTS "external_id" text,
  ADD COLUMN IF NOT EXISTS "subscription_id" uuid,
  ADD COLUMN IF NOT EXISTS "period_start" timestamptz,
  ADD COLUMN IF NOT EXISTS "period_end" timestamptz,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

UPDATE "billing_transactions"
  SET "amount_cents" = COALESCE(NULLIF("amount_cents", 0), "amount"::integer)
  WHERE "amount_cents" = 0;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_subscription_period_charge"
  ON "billing_transactions" ("subscription_id", "type", "period_start", "period_end")
  WHERE "subscription_id" IS NOT NULL AND "period_start" IS NOT NULL AND "period_end" IS NOT NULL;
