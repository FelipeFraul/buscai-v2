SELECT
  mode,
  COUNT(*) AS total,
  COUNT(target_position) AS com_target,
  COUNT(*) - COUNT(target_position) AS sem_target
FROM auction_configs
GROUP BY mode
ORDER BY mode;

SELECT id, company_id, city_id, niche_id, mode, target_position, daily_budget, is_active, pause_on_limit
FROM auction_configs
ORDER BY id DESC
LIMIT 50;
