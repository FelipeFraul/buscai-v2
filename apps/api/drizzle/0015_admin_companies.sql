DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'company_status' AND e.enumlabel = 'draft'
  ) THEN
    ALTER TYPE company_status ADD VALUE 'draft';
  END IF;
END $$;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id);
