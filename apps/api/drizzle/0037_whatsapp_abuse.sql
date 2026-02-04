CREATE TABLE IF NOT EXISTS "whatsapp_query_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone" varchar(32) NOT NULL,
  "niche_id" uuid NOT NULL REFERENCES "niches"("id"),
  "query_text" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "whatsapp_query_events_phone_idx"
  ON "whatsapp_query_events" ("phone");
CREATE INDEX IF NOT EXISTS "whatsapp_query_events_phone_created_idx"
  ON "whatsapp_query_events" ("phone", "created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_query_events_niche_idx"
  ON "whatsapp_query_events" ("niche_id");

CREATE TABLE IF NOT EXISTS "whatsapp_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "phone" varchar(32) NOT NULL,
  "reason" varchar(64) NOT NULL,
  "message" text,
  "blocked_until" timestamptz NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "whatsapp_blocks_phone_idx"
  ON "whatsapp_blocks" ("phone");
CREATE INDEX IF NOT EXISTS "whatsapp_blocks_active_idx"
  ON "whatsapp_blocks" ("is_active");
CREATE INDEX IF NOT EXISTS "whatsapp_blocks_blocked_until_idx"
  ON "whatsapp_blocks" ("blocked_until");
