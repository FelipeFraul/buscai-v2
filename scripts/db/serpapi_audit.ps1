$ErrorActionPreference = "Continue"

function Run-Sql {
  param(
    [string]$Label,
    [string]$Sql
  )

  Write-Host ""
  Write-Host "=== $Label ==="
  docker exec -i buscai-db psql -U buscai -d buscai -c $Sql
}

Run-Sql "Contagem geral" @"
SELECT 'users' AS tabela, COUNT(*) AS total FROM users
UNION ALL
SELECT 'companies' AS tabela, COUNT(*) AS total FROM companies
UNION ALL
SELECT 'niches' AS tabela, COUNT(*) AS total FROM niches
UNION ALL
SELECT 'cities' AS tabela, COUNT(*) AS total FROM cities;
"@

Run-Sql "Distribuicao por nicho (companies)" @"
SELECT n.label AS niche, COUNT(c.id) AS empresas
FROM company_niches cn
JOIN niches n ON n.id = cn.niche_id
JOIN companies c ON c.id = cn.company_id
GROUP BY n.label
ORDER BY empresas DESC
LIMIT 50;
"@

Run-Sql "Ultimos 10 runs" @"
SELECT r.id,
       r.status,
       r.city_id,
       r.niche_id,
       r.inserted_count,
       r.deduped_count,
       r.error_count,
       r.created_at
FROM serpapi_import_runs r
ORDER BY r.created_at DESC
LIMIT 10;
"@

Run-Sql "Top 10 nichos por records (run + niche)" @"
SELECT r.run_id,
       r.niche_id,
       n.label AS niche_label,
       COUNT(*) AS total_records
FROM serpapi_import_records r
LEFT JOIN niches n ON n.id = r.niche_id
GROUP BY r.run_id, r.niche_id, n.label
ORDER BY total_records DESC
LIMIT 10;
"@

Run-Sql "Records sem city/niche por run" @"
SELECT run_id,
       COUNT(*) FILTER (WHERE city_id IS NULL) AS sem_city,
       COUNT(*) FILTER (WHERE niche_id IS NULL) AS sem_niche,
       COUNT(*) AS total_records
FROM serpapi_import_records
GROUP BY run_id
ORDER BY total_records DESC
LIMIT 20;
"@

Write-Host ""
Write-Host "OK"
