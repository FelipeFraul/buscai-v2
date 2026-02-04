-- Normalize auction daily budgets to cents (legacy values stored in BRL).
UPDATE auction_configs
SET daily_budget = daily_budget * 100
WHERE daily_budget IS NOT NULL;
