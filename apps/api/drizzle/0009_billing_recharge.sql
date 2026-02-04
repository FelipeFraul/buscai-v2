-- Add recharge type and transaction status
ALTER TYPE "billing_transaction_type" ADD VALUE IF NOT EXISTS 'recharge';

CREATE TYPE "billing_transaction_status" AS ENUM ('pending', 'confirmed', 'cancelled');

ALTER TABLE "billing_transactions"
  ADD COLUMN "status" "billing_transaction_status" NOT NULL DEFAULT 'confirmed';

-- Mark existing rows as confirmed explicitly
UPDATE "billing_transactions" SET "status" = 'confirmed' WHERE "status" IS NULL;

-- Index to speed up recent transactions by company
CREATE INDEX IF NOT EXISTS "billing_transactions_company_created_idx"
  ON "billing_transactions" ("company_id", "occurred_at" DESC);
