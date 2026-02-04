ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "auth_token_state" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'global',
  "global_version" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "auth_token_state" ("id", "global_version", "updated_at")
VALUES ('global', 0, now())
ON CONFLICT ("id") DO NOTHING;
