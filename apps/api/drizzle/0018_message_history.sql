CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');

CREATE TABLE "message_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "direction" "message_direction" NOT NULL,
  "peer_e164" text NOT NULL,
  "provider_message_id" text,
  "text" text NOT NULL,
  "search_id" uuid REFERENCES "searches"("id"),
  "meta" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_message_history_company_created" ON "message_history" ("company_id", "created_at" desc);
CREATE INDEX "idx_message_history_company_peer" ON "message_history" ("company_id", "peer_e164");
CREATE INDEX "idx_message_history_company_direction" ON "message_history" ("company_id", "direction");
