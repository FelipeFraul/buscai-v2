ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "ip_hash" varchar(128),
  ADD COLUMN IF NOT EXISTS "ua_hash" varchar(128);
