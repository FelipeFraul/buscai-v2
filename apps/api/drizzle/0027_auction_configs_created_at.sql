ALTER TABLE auction_configs
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE auction_configs
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE auction_configs
  ALTER COLUMN created_at SET NOT NULL;
