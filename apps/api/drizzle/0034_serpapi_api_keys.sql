CREATE TABLE IF NOT EXISTS "serpapi_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "api_key_encrypted" text NOT NULL,
  "label" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

ALTER TABLE "serpapi_settings"
  ADD COLUMN IF NOT EXISTS "active_api_key_id" uuid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'serpapi_settings') THEN
    IF EXISTS (
      SELECT 1
      FROM serpapi_settings
      WHERE id = 'global'
        AND api_key_encrypted IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM serpapi_api_keys)
    ) THEN
      INSERT INTO serpapi_api_keys ("api_key_encrypted", "label", "created_at", "updated_at")
      SELECT api_key_encrypted, 'Chave inicial', api_key_updated_at, api_key_updated_at
      FROM serpapi_settings
      WHERE id = 'global';
    END IF;

    IF EXISTS (SELECT 1 FROM serpapi_api_keys) THEN
      UPDATE serpapi_settings
      SET active_api_key_id = (
        SELECT id
        FROM serpapi_api_keys
        ORDER BY created_at ASC
        LIMIT 1
      )
      WHERE id = 'global'
        AND active_api_key_id IS NULL;
    END IF;
  END IF;
END $$;
