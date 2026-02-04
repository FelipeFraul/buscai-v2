ALTER TABLE serpapi_import_records
  ADD COLUMN IF NOT EXISTS publish_status text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by_user_id uuid REFERENCES users(id);
