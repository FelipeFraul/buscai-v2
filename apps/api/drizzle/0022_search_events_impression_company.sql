DROP INDEX IF EXISTS "uniq_search_impression";

CREATE UNIQUE INDEX "uniq_search_impression_null_company"
  ON "search_events" ("search_id", "type")
  WHERE "type" = 'impression' AND "company_id" IS NULL;

CREATE UNIQUE INDEX "uniq_search_impression_company"
  ON "search_events" ("search_id", "company_id", "type")
  WHERE "type" = 'impression' AND "company_id" IS NOT NULL;
