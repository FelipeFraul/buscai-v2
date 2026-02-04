DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offered_by_search_type') THEN
    CREATE TYPE "offered_by_search_type" AS ENUM ('niche', 'company', 'product');
  END IF;
END $$;

ALTER TABLE "offered_by_events"
  ADD COLUMN IF NOT EXISTS "search_type" "offered_by_search_type" NOT NULL DEFAULT 'niche';
