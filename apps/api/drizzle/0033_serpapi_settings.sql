CREATE TABLE IF NOT EXISTS "serpapi_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "api_key_encrypted" text NOT NULL,
  "api_key_updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
