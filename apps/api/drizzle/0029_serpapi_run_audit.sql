ALTER TABLE serpapi_import_runs
  ADD COLUMN initiated_by_user_id uuid REFERENCES users(id),
  ADD COLUMN params_json text,
  ADD COLUMN dry_run boolean NOT NULL DEFAULT false,
  ADD COLUMN deduped_count integer NOT NULL DEFAULT 0;
