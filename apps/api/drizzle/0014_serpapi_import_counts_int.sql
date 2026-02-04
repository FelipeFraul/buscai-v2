ALTER TABLE serpapi_import_runs
  ALTER COLUMN found_count TYPE integer USING COALESCE(NULLIF(found_count, ''), '0')::integer,
  ALTER COLUMN inserted_count TYPE integer USING COALESCE(NULLIF(inserted_count, ''), '0')::integer,
  ALTER COLUMN updated_count TYPE integer USING COALESCE(NULLIF(updated_count, ''), '0')::integer,
  ALTER COLUMN conflict_count TYPE integer USING COALESCE(NULLIF(conflict_count, ''), '0')::integer,
  ALTER COLUMN error_count TYPE integer USING COALESCE(NULLIF(error_count, ''), '0')::integer;

ALTER TABLE serpapi_import_runs
  ALTER COLUMN found_count SET NOT NULL,
  ALTER COLUMN inserted_count SET NOT NULL,
  ALTER COLUMN updated_count SET NOT NULL,
  ALTER COLUMN conflict_count SET NOT NULL,
  ALTER COLUMN error_count SET NOT NULL;

ALTER TABLE serpapi_import_runs
  ALTER COLUMN found_count SET DEFAULT 0,
  ALTER COLUMN inserted_count SET DEFAULT 0,
  ALTER COLUMN updated_count SET DEFAULT 0,
  ALTER COLUMN conflict_count SET DEFAULT 0,
  ALTER COLUMN error_count SET DEFAULT 0;
