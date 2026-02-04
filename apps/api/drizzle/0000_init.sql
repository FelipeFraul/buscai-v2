CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "user_role" AS ENUM ('admin', 'company_owner');
CREATE TYPE "company_status" AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE "auction_mode" AS ENUM ('manual', 'smart');
CREATE TYPE "auction_target_share" AS ENUM ('one_in_3', 'one_in_5', 'one_in_10');
CREATE TYPE "billing_transaction_type" AS ENUM ('credit', 'debit');
CREATE TYPE "search_source" AS ENUM ('whatsapp', 'web', 'demo');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" "user_role" NOT NULL DEFAULT 'company_owner',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

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
  "company_id" uuid NOT NULL REFERENCES "companies"("id") UNIQUE,
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
  "source" "search_source" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "search_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "search_id" uuid NOT NULL REFERENCES "searches"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "rank" integer,
  "is_paid" boolean NOT NULL DEFAULT false,
  "position" integer,
  "click_tracking_id" varchar(255)
);