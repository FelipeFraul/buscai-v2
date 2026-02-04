-- Customer complaints (phase 1 - capture only)
CREATE TYPE "customer_complaint_reason" AS ENUM ('NO_STOCK', 'PRICE_DIFFERENT', 'BAD_SERVICE', 'OTHER');
CREATE TYPE "customer_complaint_channel" AS ENUM ('web', 'whatsapp', 'other');
CREATE TYPE "customer_complaint_status" AS ENUM ('OPEN', 'REVIEWED', 'DISCARDED');

CREATE TABLE "customer_complaints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "search_id" uuid REFERENCES "searches"("id"),
  "result_id" uuid REFERENCES "search_results"("id"),
  "reason" "customer_complaint_reason" NOT NULL,
  "comment" text,
  "channel" "customer_complaint_channel" NOT NULL,
  "customer_hash" varchar(255),
  "status" "customer_complaint_status" NOT NULL DEFAULT 'OPEN',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "customer_complaints_company_created_at_idx" ON "customer_complaints" ("company_id", "created_at" DESC);
CREATE INDEX "customer_complaints_company_hash_idx" ON "customer_complaints" ("company_id", "customer_hash");
