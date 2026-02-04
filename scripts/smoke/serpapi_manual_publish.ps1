$ErrorActionPreference = "Stop"

function Resolve-EnvOrDefault {
  param(
    [string]$Value,
    [string]$DefaultValue
  )
  if ($Value -and $Value.Trim().Length -gt 0) {
    return $Value
  }
  return $DefaultValue
}

function Invoke-ApiRequest {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [string]$Token = $null
  )

  $headers = @{}
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $params = @{
    Method      = $Method
    Uri         = $Url
    Headers     = $headers
    ContentType = "application/json"
    ErrorAction = "Stop"
  }

  if ($Body -ne $null) {
    $params["Body"] = ($Body | ConvertTo-Json -Depth 8)
  }

  $status = 0
  $content = ""
  try {
    $response = Invoke-WebRequest @params
    $status = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    $response = $_.Exception.Response
    if ($response -ne $null) {
      $status = [int]$response.StatusCode
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $content = $reader.ReadToEnd()
    } else {
      throw
    }
  }

  $json = $null
  if ($content) {
    try {
      $json = $content | ConvertFrom-Json
    } catch {
      $json = $null
    }
  }

  return [pscustomobject]@{
    Status  = $status
    Content = $content
    Json    = $json
  }
}

function Require-Ok {
  param(
    [object]$Response,
    [string]$Label
  )
  if ($Response.Status -lt 200 -or $Response.Status -ge 300) {
    Write-Host "Erro em $Label"
    Write-Host "Status: $($Response.Status)"
    if ($Response.Content) {
      Write-Host "Body: $($Response.Content)"
    }
    exit 1
  }
}

$baseUrl = Resolve-EnvOrDefault $env:BUSCAI_API_BASE "http://localhost:3001"
$email = $env:BUSCAI_EMAIL
$password = $env:BUSCAI_PASSWORD
$cityId = $env:BUSCAI_CITY_ID
$nicheId = $env:BUSCAI_NICHE_ID

if (-not $email -or -not $password) {
  Write-Host "Defina BUSCAI_EMAIL e BUSCAI_PASSWORD para autenticar."
  exit 1
}

Write-Host "Login..."
$login = Invoke-ApiRequest -Method "POST" -Url "$baseUrl/auth/login" -Body @{
  email = $email
  password = $password
}
Require-Ok $login "login"

$token = $login.Json.accessToken
if (-not $token) {
  Write-Host "Resposta de login sem accessToken."
  Write-Host $login.Content
  exit 1
}

if (-not $cityId) {
  Write-Host "Buscando cityId..."
  $cities = Invoke-ApiRequest -Method "GET" -Url "$baseUrl/cities"
  Require-Ok $cities "listar cidades"
  $cityId = $cities.Json[0].id
  if (-not $cityId) {
    Write-Host "Nenhuma cidade encontrada. Defina BUSCAI_CITY_ID."
    exit 1
  }
}

if (-not $nicheId) {
  Write-Host "Buscando nicheId..."
  $niches = Invoke-ApiRequest -Method "GET" -Url "$baseUrl/niches"
  Require-Ok $niches "listar nichos"
  $nicheId = $niches.Json[0].id
  if (-not $nicheId) {
    Write-Host "Nenhum nicho encontrado. Defina BUSCAI_NICHE_ID."
    exit 1
  }
}

Write-Host "Import manual..."
$import = Invoke-ApiRequest -Method "POST" -Url "$baseUrl/admin/serpapi/import-manual" -Token $token -Body @{
  cityId = $cityId
  nicheId = $nicheId
  records = @(
    @{
      name = "Empresa Smoke 1"
      phone = "15999990001"
      address = "Rua A, 10"
      category = "Smoke"
      city = "Itapetininga - SP"
      source = "manual_upload"
    },
    @{
      name = "Empresa Smoke 2"
      phone = "15999990002"
      address = "Rua B, 20"
      category = "Smoke"
      city = "Itapetininga - SP"
      source = "manual_upload"
    }
  )
  options = @{
    dryRun = $false
  }
}
Require-Ok $import "import manual"

$runId = $import.Json.runId
if (-not $runId) {
  Write-Host "Resposta de import sem runId."
  Write-Host $import.Content
  exit 1
}

Write-Host "Publish run $runId..."
$publish = Invoke-ApiRequest -Method "POST" -Url "$baseUrl/admin/serpapi/runs/$runId/publish" -Token $token -Body @{
  force = $false
}
Require-Ok $publish "publish"

Write-Host "SQL checks..."
$sqlRun = "SELECT id, city_id, niche_id, found_count, inserted_count, deduped_count FROM serpapi_import_runs WHERE id = '$runId';"
$sqlNullNiche = "SELECT COUNT(*) AS records_sem_niche FROM serpapi_import_records WHERE run_id = '$runId' AND niche_id IS NULL;"
$sqlCompanies = "SELECT COUNT(*) AS companies_serpapi FROM companies WHERE source = 'serpapi' AND source_run_id = '$runId';"

docker exec -i buscai-db psql -U buscai -d buscai -c $sqlRun
docker exec -i buscai-db psql -U buscai -d buscai -c $sqlNullNiche
docker exec -i buscai-db psql -U buscai -d buscai -c $sqlCompanies

Write-Host "OK"
