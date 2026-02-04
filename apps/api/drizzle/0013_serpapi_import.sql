CREATE TYPE company_source AS ENUM ('serpapi', 'manual', 'claimed');
CREATE TYPE serpapi_import_status AS ENUM ('pending', 'running', 'done', 'failed');
CREATE TYPE serpapi_record_status AS ENUM ('inserted', 'updated', 'conflict', 'ignored', 'error');

CREATE TABLE serpapi_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status serpapi_import_status NOT NULL DEFAULT 'pending',
  city_id uuid REFERENCES cities(id),
  niche_id uuid REFERENCES niches(id),
  query text,
  found_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  conflict_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone
);

CREATE TABLE serpapi_import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES serpapi_import_runs(id),
  raw_payload jsonb NOT NULL,
  dedupe_key text NOT NULL,
  company_id uuid,
  status serpapi_record_status NOT NULL DEFAULT 'inserted',
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE companies
  ADD COLUMN source company_source NOT NULL DEFAULT 'manual',
  ADD COLUMN source_ref text,
  ADD COLUMN source_run_id uuid REFERENCES serpapi_import_runs(id),
  ADD COLUMN normalized_phone text,
  ADD COLUMN normalized_name text,
  ADD COLUMN created_from_import boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_companies_normalized_phone
  ON companies(normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE INDEX idx_companies_normalized_name_city
  ON companies(normalized_name, city_id);

CREATE INDEX idx_serpapi_runs_status ON serpapi_import_runs(status);
CREATE INDEX idx_serpapi_records_run ON serpapi_import_records(run_id);
