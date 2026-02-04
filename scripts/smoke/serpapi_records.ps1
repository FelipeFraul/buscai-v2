$BASE="http://localhost:3001"
$email="felipefraul@buscai.local"
$pass="MacBookAir4679"

$loginBody=@{ email=$email; password=$pass } | ConvertTo-Json
$resp=Invoke-RestMethod -Method Post -Uri "$BASE/auth/login" -ContentType 'application/json' -Body $loginBody
$TOKEN=$resp.accessToken
if (-not $TOKEN) { throw "TOKEN vazio" }

$me=Invoke-RestMethod -Method Get -Uri "$BASE/auth/me" -Headers @{ Authorization="Bearer $TOKEN" } | ConvertTo-Json -Depth 5
Write-Output $me

$cities=Invoke-RestMethod "$BASE/cities"
$niches=Invoke-RestMethod "$BASE/niches"

$payload=@{
  cityId=[string]$cities[0].id
  nicheId=[string]$niches[0].id
  query="clinica"
  limit=20
  dryRun=$true
} | ConvertTo-Json -Depth 10

$import=Invoke-RestMethod -Method Post -Uri "$BASE/admin/serpapi/import" -Headers @{ Authorization="Bearer $TOKEN" } -ContentType 'application/json' -Body $payload
$RUN_ID=$import.runId
Write-Output "RUN_ID=$RUN_ID"

Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$RUN_ID/records?limit=20`&offset=0" -Headers @{ Authorization="Bearer $TOKEN" } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$RUN_ID/records?status=conflict`&limit=20`&offset=0" -Headers @{ Authorization="Bearer $TOKEN" } | ConvertTo-Json -Depth 10

$FAKE="11111111-1111-4111-8111-111111111111"
try {
  Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$FAKE/records?limit=20`&offset=0" -Headers @{ Authorization="Bearer $TOKEN" }
} catch {
  $r = $_.Exception.Response
  Write-Output "404 status=$($r.StatusCode.value__) x-request-id=$($r.Headers['x-request-id'])"
  $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
  Write-Output $sr.ReadToEnd()
}

try {
  Invoke-RestMethod -Method Get -Uri "$BASE/admin/serpapi/runs/$RUN_ID/records?status=xxx`&limit=999`&offset=-1" -Headers @{ Authorization="Bearer $TOKEN" }
} catch {
  $r = $_.Exception.Response
  Write-Output "400 status=$($r.StatusCode.value__)"
  $sr = New-Object System.IO.StreamReader($r.GetResponseStream())
  Write-Output $sr.ReadToEnd()
}
