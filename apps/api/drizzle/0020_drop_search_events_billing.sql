DROP INDEX IF EXISTS "uniq_search_event_billing";

ALTER TABLE "search_events"
  DROP COLUMN IF EXISTS "billing_transaction_id";
