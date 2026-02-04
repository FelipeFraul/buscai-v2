ALTER TABLE serpapi_import_records
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES cities(id),
  ADD COLUMN IF NOT EXISTS niche_id uuid REFERENCES niches(id);
