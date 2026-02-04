CREATE INDEX "idx_searches_city_niche_created_at" ON "searches" ("city_id", "niche_id", "created_at");
CREATE INDEX "idx_searches_created_at" ON "searches" ("created_at");
CREATE INDEX "idx_search_results_company" ON "search_results" ("company_id");
CREATE INDEX "idx_search_results_search" ON "search_results" ("search_id");
