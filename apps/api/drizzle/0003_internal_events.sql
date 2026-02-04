CREATE TYPE "internal_event_type" AS ENUM (
  'slow_query',
  'timeout',
  'auction_error',
  'billing_error',
  'search_error',
  'circuit_open',
  'webhook_failure'
);

CREATE TABLE "internal_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "internal_event_type" NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
