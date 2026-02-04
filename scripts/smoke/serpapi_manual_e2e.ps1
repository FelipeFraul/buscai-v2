$ErrorActionPreference = "Stop"

param(
  [string]$FilePath = $env:BUSCAI_IMPORT_FILE
)

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
    $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
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

function Detect-Delimiter {
  param([string]$Line)
  $comma = ($Line.ToCharArray() | Where-Object { $_ -eq "," }).Count
  $semicolon = ($Line.ToCharArray() | Where-Object { $_ -eq ";" }).Count
  if ($semicolon -gt $comma) { return ";" }
  return ","
}

function Convert-ColumnLetters {
  param([string]$Letters)
  $value = 0
  foreach ($char in $Letters.ToUpper().ToCharArray()) {
    $value = ($value * 26) + ([int]$char - 64)
  }
  return $value
}

function Read-XlsxRows {
  param([string]$Path)

  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $sharedStrings = @()
    $sharedEntry = $zip.GetEntry("xl/sharedStrings.xml")
    if ($sharedEntry) {
      $sharedStream = $sharedEntry.Open()
      $reader = New-Object System.IO.StreamReader($sharedStream)
      $sharedXml = $reader.ReadToEnd()
      $reader.Close()
      [xml]$sharedDoc = $sharedXml
      foreach ($si in $sharedDoc.sst.si) {
        if ($si.t) {
          $sharedStrings += $si.t."#text"
        } elseif ($si.r) {
          $sharedStrings += ($si.r | ForEach-Object { $_.t."#text" }) -join ""
        } else {
          $sharedStrings += ""
        }
      }
    }

    $sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
    if (-not $sheetEntry) {
      throw "Nao foi possivel localizar sheet1.xml."
    }
    $sheetStream = $sheetEntry.Open()
    $sheetReader = New-Object System.IO.StreamReader($sheetStream)
    $sheetXml = $sheetReader.ReadToEnd()
    $sheetReader.Close()
    [xml]$sheetDoc = $sheetXml

    $rowMap = @{}
    $maxRow = 0
    foreach ($row in $sheetDoc.worksheet.sheetData.row) {
      $rowIndex = [int]$row.r
      if ($rowIndex -gt $maxRow) { $maxRow = $rowIndex }
      if (-not $rowMap.ContainsKey($rowIndex)) {
        $rowMap[$rowIndex] = @{}
      }
      foreach ($cell in $row.c) {
        $cellRef = $cell.r
        $colLetters = ($cellRef -replace "\d", "")
        $colIndex = Convert-ColumnLetters $colLetters
        $value = ""
        if ($cell.t -eq "s") {
          $value = $sharedStrings[[int]$cell.v]
        } elseif ($cell.v) {
          $value = $cell.v
        }
        $rowMap[$rowIndex][$colIndex] = $value
      }
    }

    if ($maxRow -lt 1) {
      return @{ Headers = @(); Rows = @() }
    }

    $headers = @()
    $headerRow = $rowMap[1]
    $maxCol = ($headerRow.Keys | Measure-Object -Maximum).Maximum
    if (-not $maxCol) { $maxCol = 0 }
    for ($i = 1; $i -le $maxCol; $i++) {
      $headerValue = ""
      if ($headerRow.ContainsKey($i)) {
        $headerValue = [string]$headerRow[$i]
      }
      if (-not $headerValue) {
        $headerValue = "col_$i"
      }
      $headers += $headerValue
    }

    $rows = @()
    for ($rowIndex = 2; $rowIndex -le $maxRow; $rowIndex++) {
      $rowValues = @{}
      for ($i = 1; $i -le $headers.Count; $i++) {
        $value = ""
        if ($rowMap.ContainsKey($rowIndex) -and $rowMap[$rowIndex].ContainsKey($i)) {
          $value = [string]$rowMap[$rowIndex][$i]
        }
        $rowValues[$headers[$i - 1]] = $value
      }
      $rows += $rowValues
    }

    return @{ Headers = $headers; Rows = $rows }
  } finally {
    $zip.Dispose()
  }
}

function Read-CsvRows {
  param([string]$Path)
  $lines = Get-Content -Path $Path
  if (-not $lines -or $lines.Count -eq 0) {
    return @{ Headers = @(); Rows = @() }
  }
  $delimiter = Detect-Delimiter $lines[0]
  $data = $lines | ConvertFrom-Csv -Delimiter $delimiter
  $headers = @()
  if ($data.Count -gt 0) {
    $headers = $data[0].PSObject.Properties.Name
  }
  $rows = @()
  foreach ($item in $data) {
    $row = @{}
    foreach ($header in $headers) {
      $row[$header] = $item.$header
    }
    $rows += $row
  }
  return @{ Headers = $headers; Rows = $rows }
}

function Guess-Mapping {
  param([string[]]$Headers)
  $lower = $Headers | ForEach-Object { $_.ToLowerInvariant() }

  $find = {
    param([string[]]$keys)
    for ($i = 0; $i -lt $lower.Count; $i++) {
      foreach ($key in $keys) {
        if ($lower[$i] -like "*$key*") {
          return $Headers[$i]
        }
      }
    }
    return $null
  }

  return @{
    name = & $find @("nome", "empresa", "title", "razao")
    phone = & $find @("telefone", "fone", "celular", "whatsapp", "phone")
    address = & $find @("endereco", "logradouro", "rua", "address")
  }
}

function Run-Sql {
  param(
    [string]$Label,
    [string]$Sql
  )
  Write-Host ""
  Write-Host "=== $Label ==="
  docker exec -i buscai-db psql -U buscai -d buscai -c $Sql
}

$baseUrl = Resolve-EnvOrDefault $env:BUSCAI_API_BASE "http://localhost:3001"
$email = $env:BUSCAI_EMAIL
$password = $env:BUSCAI_PASSWORD
$fixedCityId = $env:BUSCAI_CITY_ID
$fixedNicheId = $env:BUSCAI_NICHE_ID

if (-not $email -or -not $password) {
  Write-Host "Defina BUSCAI_EMAIL e BUSCAI_PASSWORD."
  exit 1
}
if (-not $fixedCityId -or -not $fixedNicheId) {
  Write-Host "Defina BUSCAI_CITY_ID e BUSCAI_NICHE_ID."
  exit 1
}
if (-not $FilePath) {
  Write-Host "Informe o caminho do arquivo CSV/XLSX em BUSCAI_IMPORT_FILE ou via parametro -FilePath."
  exit 1
}
if (-not (Test-Path $FilePath)) {
  Write-Host "Arquivo nao encontrado: $FilePath"
  exit 1
}

$extension = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
$data = $null
if ($extension -eq ".csv") {
  $data = Read-CsvRows $FilePath
} elseif ($extension -eq ".xlsx") {
  $data = Read-XlsxRows $FilePath
} else {
  Write-Host "Formato nao suportado: $extension"
  exit 1
}

if (-not $data.Headers -or $data.Headers.Count -eq 0) {
  Write-Host "Arquivo sem cabecalho ou dados."
  exit 1
}
if (-not $data.Rows -or $data.Rows.Count -eq 0) {
  Write-Host "Arquivo sem linhas."
  exit 1
}

$mapping = Guess-Mapping $data.Headers
if (-not $mapping.name -or -not $mapping.phone -or -not $mapping.address) {
  Write-Host "Nao foi possivel inferir mapeamento basico (name/phone/address)."
  Write-Host "Headers: $($data.Headers -join ', ')"
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

$rows = $data.Rows | Where-Object {
  $_.Values | Where-Object { $_ -and $_.ToString().Trim().Length -gt 0 } | ForEach-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
} | ForEach-Object {
  $row = @{}
  foreach ($header in $data.Headers) {
    $row[$header] = $_.$header
  }
  $row
}

Write-Host "Import manual..."
$import = Invoke-ApiRequest -Method "POST" -Url "$baseUrl/admin/serpapi/import-manual" -Token $token -Body @{
  fixedCityId = $fixedCityId
  fixedNicheId = $fixedNicheId
  mapping = @{
    name = $mapping.name
    phone = $mapping.phone
    address = $mapping.address
  }
  rows = $rows
  dryRun = $false
}
Require-Ok $import "import manual"

$runId = $import.Json.runId
if (-not $runId) {
  Write-Host "Resposta sem runId."
  Write-Host $import.Content
  exit 1
}

Write-Host "Publish run $runId..."
$publish = Invoke-ApiRequest -Method "POST" -Url "$baseUrl/admin/serpapi/runs/$runId/publish" -Token $token -Body @{
  force = $false
}
Require-Ok $publish "publish"

Run-Sql "Run metrics" @"
SELECT id, inserted_count, deduped_count, error_count
FROM serpapi_import_runs
WHERE id = '$runId';
"@

Run-Sql "Companies serpapi count" @"
SELECT COUNT(*) AS companies_serpapi
FROM companies
WHERE source = 'serpapi';
"@

Run-Sql "Company niches count" @"
SELECT niche_id, COUNT(*) AS total
FROM company_niches
GROUP BY niche_id
ORDER BY total DESC
LIMIT 10;
"@

Run-Sql "Top 10 companies serpapi criadas" @"
SELECT id, trade_name, city_id, created_at
FROM companies
WHERE source = 'serpapi'
ORDER BY created_at DESC
LIMIT 10;
"@

$inserted = docker exec -i buscai-db psql -U buscai -d buscai -t -A -c "SELECT inserted_count FROM serpapi_import_runs WHERE id = '$runId';"
$insertedValue = 0
if ($inserted) {
  $insertedValue = [int]$inserted.Trim()
}

if ($insertedValue -le 0) {
  Write-Host "Inseridos = 0. Falha."
  exit 1
}

Write-Host "OK"
