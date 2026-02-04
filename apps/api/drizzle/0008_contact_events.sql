-- Contact events for clicks (WhatsApp / Call)
CREATE TYPE "contact_channel" AS ENUM ('whatsapp', 'call');
CREATE TYPE "contact_classification" AS ENUM ('curious', 'new_client', 'recurring', 'quote');

CREATE TABLE "contact_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "channel" "contact_channel" NOT NULL,
  "phone" varchar(64) NOT NULL,
  "name" varchar(255),
  "niche_id" uuid REFERENCES "niches"("id"),
  "classification" "contact_classification",
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "contact_events_company_created_at_idx" ON "contact_events" ("company_id", "created_at" DESC);
CREATE INDEX "contact_events_niche_idx" ON "contact_events" ("niche_id");
