CREATE TYPE "offered_by_event_type" AS ENUM (
  'impression',
  'click_whatsapp',
  'click_call',
  'click_site',
  'click_promotions'
);

CREATE TYPE "offered_by_source" AS ENUM ('web', 'whatsapp', 'demo');

CREATE TABLE "offered_by_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config_id" uuid NOT NULL REFERENCES "offered_by_configs"("id"),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "search_id" uuid REFERENCES "searches"("id"),
  "city_id" uuid REFERENCES "cities"("id"),
  "niche_id" uuid REFERENCES "niches"("id"),
  "source" offered_by_source NOT NULL,
  "type" offered_by_event_type NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX "offered_by_events_config_idx" ON "offered_by_events" ("config_id", "created_at");
CREATE INDEX "offered_by_events_city_idx" ON "offered_by_events" ("city_id");
CREATE INDEX "offered_by_events_niche_idx" ON "offered_by_events" ("niche_id");
