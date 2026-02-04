ALTER TYPE "billing_transaction_type" ADD VALUE IF NOT EXISTS 'search_debit';

ALTER TABLE "searches"
ADD COLUMN "niche_id" uuid REFERENCES "niches"("id");

ALTER TABLE "searches"
ALTER COLUMN "niche_id" SET NOT NULL;

ALTER TABLE "search_results"
ADD COLUMN "charged_amount" numeric NOT NULL DEFAULT 0;
