-- Reset completo do banco BUSCAÍ (apenas para uso em desenvolvimento)
DROP DATABASE IF EXISTS buscai;
CREATE DATABASE buscai OWNER buscai;
\c buscai;

-- Extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tipos
CREATE TYPE "user_role" AS ENUM ('admin', 'company_owner');
CREATE TYPE "company_status" AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE "auction_mode" AS ENUM ('manual', 'smart');
CREATE TYPE "auction_target_share" AS ENUM ('one_in_3', 'one_in_5', 'one_in_10');
CREATE TYPE "billing_transaction_type" AS ENUM ('credit', 'debit', 'search_debit');
CREATE TYPE "search_source" AS ENUM ('whatsapp', 'web', 'demo');
CREATE TYPE "product_subscription_status" AS ENUM ('active', 'cancelled');
CREATE TYPE "internal_event_type" AS ENUM (
  'slow_query',
  'timeout',
  'auction_error',
  'billing_error',
  'search_error',
  'circuit_open',
  'webhook_failure'
);

-- Tabelas
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" "user_role" NOT NULL DEFAULT 'company_owner',
  "token_version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "company_id" uuid,
  "token_hash" text NOT NULL,
  "ip_hash" varchar(128),
  "ua_hash" varchar(128),
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  "replaced_by_token_id" uuid
);
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");
CREATE INDEX "refresh_tokens_company_id_idx" ON "refresh_tokens" ("company_id");

CREATE TABLE "auth_token_state" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'global',
  "global_version" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "auth_token_state" ("id", "global_version", "updated_at")
VALUES ('global', 0, now())
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "cities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "state" varchar(2) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "niches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(128) NOT NULL UNIQUE,
  "label" varchar(255) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "users"("id"),
  "trade_name" varchar(255) NOT NULL,
  "legal_name" varchar(255),
  "city_id" uuid NOT NULL REFERENCES "cities"("id"),
  "address" text,
  "phone" varchar(32),
  "whatsapp" varchar(32),
  "opening_hours" varchar(255),
  "status" "company_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "company_niches" (
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "niche_id" uuid NOT NULL REFERENCES "niches"("id"),
  PRIMARY KEY ("company_id", "niche_id")
);

CREATE TABLE "auction_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "city_id" uuid NOT NULL REFERENCES "cities"("id"),
  "niche_id" uuid NOT NULL REFERENCES "niches"("id"),
  "mode" "auction_mode" NOT NULL,
  "bid_position1" numeric,
  "bid_position2" numeric,
  "bid_position3" numeric,
  "target_share" "auction_target_share",
  "daily_budget" numeric,
  "is_active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "billing_wallet" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL UNIQUE REFERENCES "companies"("id"),
  "balance" numeric NOT NULL DEFAULT 0,
  "reserved" numeric NOT NULL DEFAULT 0
);

CREATE TABLE "billing_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "type" "billing_transaction_type" NOT NULL,
  "reason" text,
  "amount" numeric NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "searches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "query_text" text NOT NULL,
  "city_id" uuid REFERENCES "cities"("id"),
  "niche_id" uuid NOT NULL REFERENCES "niches"("id"),
  "source" "search_source" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_searches_city_niche_created_at" ON "searches" ("city_id", "niche_id", "created_at");
CREATE INDEX "idx_searches_created_at" ON "searches" ("created_at");

CREATE TABLE "search_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "search_id" uuid NOT NULL REFERENCES "searches"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "rank" integer,
  "is_paid" boolean NOT NULL DEFAULT false,
  "position" integer,
  "click_tracking_id" varchar(255),
  "charged_amount" numeric NOT NULL DEFAULT 0
);
CREATE INDEX "idx_search_results_company" ON "search_results" ("company_id");
CREATE INDEX "idx_search_results_search" ON "search_results" ("search_id");

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

CREATE TABLE "internal_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "internal_event_type" NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "internal_events_type_idx" ON "internal_events" ("type");
CREATE INDEX "internal_events_created_at_idx" ON "internal_events" ("created_at");
