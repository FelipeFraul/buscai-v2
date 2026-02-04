ALTER TABLE "serpapi_import_records"
  ADD COLUMN IF NOT EXISTS "normalized_payload" jsonb;
