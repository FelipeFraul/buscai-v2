$ErrorActionPreference = "Stop"

$BASE = "http://localhost:3001"
$email = "felipefraul@buscai.local"
$pass = "MacBookAir4679"

Write-Host "== Login =="
$loginBody = @{ email = $email; password = $pass } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri "$BASE/auth/login" -ContentType "application/json" -Body $loginBody
$TOKEN = $resp.accessToken
if (-not $TOKEN) { throw "TOKEN vazio" }

Write-Host "== /auth/me =="
Invoke-RestMethod -Method Get -Uri "$BASE/auth/me" -Headers @{ Authorization = "Bearer $TOKEN" } | ConvertTo-Json -Depth 10

Write-Host "== Catálogos =="
$cities = Invoke-RestMethod "$BASE/cities"
$niches = Invoke-RestMethod "$BASE/niches"
$cityId = [string]$cities[0].id
$nicheId = [string]$niches[0].id

Write-Host "== Import (dryRun) =="
$payload = @{
  cityId  = $cityId
  nicheId = $nicheId
  query   = "clinica"
  limit   = 20
  dryRun  = $true
} | ConvertTo-Json -Depth 10
$import = Invoke-RestMethod -Method Post -Uri "$BASE/admin/serpapi/import" -Headers @{ Authorization = "Bearer $TOKEN" } -ContentType "application/json" -Body $payload
$RUN_ID = $import.runId
Write-Host "RUN_ID=$RUN_ID"

Write-Host "== Records (sem filtro) =="
Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$RUN_ID/records?limit=20&offset=0" -Headers @{ Authorization = "Bearer $TOKEN" } | ConvertTo-Json -Depth 10

Write-Host "== Records (status=conflict) =="
Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$RUN_ID/records?status=conflict&limit=20&offset=0" -Headers @{ Authorization = "Bearer $TOKEN" } | ConvertTo-Json -Depth 10

Write-Host "== 404 run fake =="
$FAKE = "11111111-1111-4111-8111-111111111111"
try {
  Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$FAKE/records?limit=20&offset=0" -Headers @{ Authorization = "Bearer $TOKEN" }
} catch {
  $resp404 = $_.Exception.Response
  $body404 = $_.ErrorDetails.Message
  if (-not $body404 -and $resp404) {
    $reader = New-Object System.IO.StreamReader($resp404.GetResponseStream())
    $body404 = $reader.ReadToEnd()
  }
  $reqId404 = $resp404.Headers["x-request-id"]
  Write-Host "status=$($resp404.StatusCode.value__)"
  Write-Host "x-request-id=$reqId404"
  Write-Host "body=$body404"
}

Write-Host "== 400 query inválida =="
try {
  Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$RUN_ID/records?status=xxx&limit=999&offset=-1" -Headers @{ Authorization = "Bearer $TOKEN" }
} catch {
  $resp400 = $_.Exception.Response
  $body400 = $_.ErrorDetails.Message
  if (-not $body400 -and $resp400) {
    $reader = New-Object System.IO.StreamReader($resp400.GetResponseStream())
    $body400 = $reader.ReadToEnd()
  }
  $reqId400 = $resp400.Headers["x-request-id"]
  Write-Host "status=$($resp400.StatusCode.value__)"
  Write-Host "x-request-id=$reqId400"
  Write-Host "body=$body400"
}
