CREATE TYPE "search_event_type" AS ENUM ('impression', 'click_whatsapp', 'click_call');

CREATE TABLE "search_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "search_id" uuid NOT NULL REFERENCES "searches"("id"),
  "company_id" uuid REFERENCES "companies"("id"),
  "type" "search_event_type" NOT NULL,
  "meta" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_search_events_search_type" ON "search_events" ("search_id", "type");
CREATE INDEX "idx_search_events_company_type" ON "search_events" ("company_id", "type");
CREATE UNIQUE INDEX "uniq_search_impression" ON "search_events" ("search_id", "type")
  WHERE "type" = 'impression';
