CREATE TABLE IF NOT EXISTS "offered_by_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "city_id" uuid REFERENCES "cities"("id"),
  "niche_id" uuid REFERENCES "niches"("id"),
  "text" varchar(160),
  "image_url" varchar(500),
  "website" varchar(500),
  "promotions_url" varchar(500),
  "phone_e164" varchar(32),
  "whatsapp_e164" varchar(32),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "offered_by_configs_city_niche_active_idx"
  ON "offered_by_configs" ("city_id", "niche_id", "is_active");
CREATE INDEX IF NOT EXISTS "offered_by_configs_company_idx"
  ON "offered_by_configs" ("company_id");
