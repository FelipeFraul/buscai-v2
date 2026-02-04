CREATE TYPE "product_subscription_status" AS ENUM ('active', 'cancelled');

CREATE TABLE "product_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text NOT NULL,
  "monthly_price_cents" integer NOT NULL,
  "max_active_offers" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "company_product_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "plan_id" uuid NOT NULL REFERENCES "product_plans"("id"),
  "status" "product_subscription_status" NOT NULL DEFAULT 'active',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "cancelled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "product_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "city_id" uuid NOT NULL REFERENCES "cities"("id"),
  "niche_id" uuid NOT NULL REFERENCES "niches"("id"),
  "title" text NOT NULL,
  "description" text NOT NULL,
  "price_cents" integer NOT NULL,
  "original_price_cents" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "product_offers_city_niche_idx" ON "product_offers" ("city_id", "niche_id", "is_active");
