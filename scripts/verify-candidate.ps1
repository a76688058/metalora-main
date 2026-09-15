# Read-only HTTP regression pack for an isolated Cloud Run candidate (#19F-1).
# Refuses to probe production disguised as candidate. GET only. No traffic changes.
#
# -TestTrafficJson : evaluate isolation guards only; no gcloud, no HTTP

param(
    [string]$TestTrafficJson
)

$ErrorActionPreference = "Stop"

$PROJECT = "metalora-auth"
$REGION = "us-west1"
$SERVICE = "metalora-direct"

$REQUIRED_HEADERS = @{
    "X-Content-Type-Options" = "nosniff"
    "Referrer-Policy"        = "strict-origin-when-cross-origin"
    "X-Frame-Options"        = "SAMEORIGIN"
    "Permissions-Policy"     = "camera=(), microphone=(), geolocation=()"
}

function Get-CloudRunService {
    $json = gcloud run services describe $SERVICE `
        --project=$PROJECT `
        --region=$REGION `
        --format=json
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to describe Cloud Run service $SERVICE"
    }
    return ($json | ConvertFrom-Json)
}

function Get-ProductionTrafficEntry {
    param($Service)

    $entries = @($Service.status.traffic | Where-Object {
            $null -ne $_.percent -and [int]$_.percent -gt 0
        })

    if ($entries.Count -ne 1) {
        throw "Candidate verify refused: expected exactly one revision with >0 traffic; found $($entries.Count)."
    }

    if ([int]$entries[0].percent -ne 100) {
        throw "Candidate verify refused: production must receive 100% traffic; found $($entries[0].percent)%."
    }

    return $entries[0]
}

function Get-TrafficEntryByTag {
    param(
        $Service,
        [string]$Tag
    )

    return @($Service.status.traffic | Where-Object { $_.tag -eq $Tag })
}

function Test-CandidateHasNoProductionTraffic {
    param($CandidateEntry)

    if ($null -eq $CandidateEntry.percent) {
        return $true
    }
    return ([int]$CandidateEntry.percent -eq 0)
}

function Assert-CandidateIsolation {
    param($Service)

    $production = Get-ProductionTrafficEntry -Service $Service
    $productionRevision = [string]$production.revisionName

    $candidateEntries = @(Get-TrafficEntryByTag -Service $Service -Tag "candidate")
    if ($candidateEntries.Count -eq 0) {
        throw "Candidate verify refused: candidate tag is missing."
    }
    if ($candidateEntries.Count -ne 1) {
        throw "Candidate verify refused: candidate tag is ambiguous ($($candidateEntries.Count) entries)."
    }

    $candidateRevision = [string]$candidateEntries[0].revisionName
    if ([string]::IsNullOrWhiteSpace($candidateRevision)) {
        throw "Candidate verify refused: candidate tag has no revisionName."
    }
    if ([string]::IsNullOrWhiteSpace($productionRevision)) {
        throw "Candidate verify refused: production revisionName is missing."
    }

    if ($candidateRevision -eq $productionRevision) {
        throw "Candidate verify refused: candidate revision equals current production ($candidateRevision). Refusing to test production."
    }

    if (-not (Test-CandidateHasNoProductionTraffic -CandidateEntry $candidateEntries[0])) {
        throw "Candidate verify refused: candidate must have 0% or unset traffic; found $($candidateEntries[0].percent)%."
    }

    return [pscustomobject]@{
        ProductionRevision = $productionRevision
        CandidateRevision  = $candidateRevision
        CandidateUrl       = [string]$candidateEntries[0].url
        ProductionUrl      = [string]$Service.status.url
        CandidateEntry     = $candidateEntries[0]
    }
}

function New-ServiceFromTrafficJson {
    param([string]$Json)

    $parsed = $Json | ConvertFrom-Json
    $traffic = @($parsed)
    return [pscustomobject]@{
        status = [pscustomobject]@{
            traffic = $traffic
            url     = "https://metalora-direct.example.invalid"
        }
    }
}

function Normalize-Url {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ""
    }
    return $Value.Trim().TrimEnd("/").ToLowerInvariant()
}

function Assert-CandidateUrlIsNotProduction {
    param($Checked)

    $candidateUrl = Normalize-Url $Checked.CandidateUrl
    if ([string]::IsNullOrWhiteSpace($candidateUrl)) {
        throw "Candidate verify refused: tagged candidate URL is missing."
    }

    $productionUrl = Normalize-Url $Checked.ProductionUrl
    if ($productionUrl -and ($candidateUrl -eq $productionUrl)) {
        throw "Candidate verify refused: candidate URL equals production URL."
    }

    $candidateHost = ([Uri]$Checked.CandidateUrl).Host.ToLowerInvariant()
    if ($candidateHost -eq "metalora.art" -or $candidateHost -eq "www.metalora.art") {
        throw "Candidate verify refused: candidate host is the production site."
    }
}

function Get-HeaderValue {
    param(
        $Headers,
        [string]$Name
    )

    if ($null -eq $Headers) {
        return $null
    }
    foreach ($key in $Headers.Keys) {
        if ([string]$key -ieq $Name) {
            $value = $Headers[$key]
            if ($value -is [array]) {
                return [string]$value[0]
            }
            return [string]$value
        }
    }
    return $null
}

function Invoke-ReadOnlyGet {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri
    )

    $request = [System.Net.HttpWebRequest]::Create($Uri)
    $request.Method = "GET"
    $request.AllowAutoRedirect = $false
    $request.Timeout = 30000
    $request.UserAgent = "metalora-verify-candidate/19F-1"

    $response = $null
    try {
        try {
            $response = [System.Net.HttpWebResponse]$request.GetResponse()
        } catch [System.Net.WebException] {
            if ($null -eq $_.Exception.Response) {
                throw
            }
            $response = [System.Net.HttpWebResponse]$_.Exception.Response
        }

        $statusCode = [int]$response.StatusCode
        $contentType = [string]$response.ContentType
        $headerMap = @{}
        foreach ($headerName in $response.Headers.AllKeys) {
            $headerMap[$headerName] = $response.Headers[$headerName]
        }

        $stream = $response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        try {
            $body = $reader.ReadToEnd()
        } finally {
            $reader.Close()
        }

        return [pscustomobject]@{
            StatusCode  = $statusCode
            ContentType = $contentType
            Headers     = $headerMap
            Body        = $body
        }
    } finally {
        if ($null -ne $response) {
            $response.Close()
        }
    }
}

function Assert-CoreHeaders {
    param($Response, [string]$Path)

    foreach ($name in $REQUIRED_HEADERS.Keys) {
        $expected = $REQUIRED_HEADERS[$name]
        $actual = Get-HeaderValue -Headers $Response.Headers -Name $name
        if ([string]::IsNullOrWhiteSpace($actual)) {
            throw "Header missing on GET $Path : $name"
        }
        if ($actual -notlike "*$expected*") {
            throw "Header mismatch on GET $Path : $name expected to contain '$expected'"
        }
    }

    $hsts = Get-HeaderValue -Headers $Response.Headers -Name "Strict-Transport-Security"
    if ([string]::IsNullOrWhiteSpace($hsts)) {
        throw "Header missing on GET $Path : Strict-Transport-Security"
    }
    if ($hsts -notlike "*max-age=31536000*") {
        throw "Header mismatch on GET $Path : Strict-Transport-Security"
    }
}

function Assert-HtmlIsNotImmutableCache {
    param($Response)

    $cache = Get-HeaderValue -Headers $Response.Headers -Name "Cache-Control"
    if ([string]::IsNullOrWhiteSpace($cache)) {
        throw "GET / missing Cache-Control"
    }
    if ($cache -imatch "immutable") {
        throw "GET / must not use immutable cache"
    }
    if ($cache -imatch "max-age\s*=\s*(31536000|604800|86400)") {
        throw "GET / must not use long-lived cache"
    }
}

function Assert-Health {
    param([string]$BaseUrl)

    $response = Invoke-ReadOnlyGet -Uri ($BaseUrl.TrimEnd("/") + "/api/health")
    if ($response.StatusCode -ne 200) {
        throw "GET /api/health expected 200, got $($response.StatusCode)"
    }
    $json = $response.Body | ConvertFrom-Json
    if ([string]$json.status -ne "ok") {
        throw "GET /api/health JSON status is not ok"
    }
    Assert-CoreHeaders -Response $response -Path "/api/health"
}

function Assert-HomeHtml {
    param([string]$BaseUrl)

    $response = Invoke-ReadOnlyGet -Uri ($BaseUrl.TrimEnd("/") + "/")
    if ($response.StatusCode -ne 200) {
        throw "GET / expected 200, got $($response.StatusCode)"
    }
    $contentType = [string]$response.ContentType
    $body = [string]$response.Body
    $looksHtml = ($contentType -imatch "text/html") -or ($body -imatch "<html")
    if (-not $looksHtml) {
        throw "GET / did not return HTML"
    }
    Assert-CoreHeaders -Response $response -Path "/"
    Assert-HtmlIsNotImmutableCache -Response $response
}

function Assert-UnknownApiJson404 {
    param([string]$BaseUrl)

    $response = Invoke-ReadOnlyGet -Uri ($BaseUrl.TrimEnd("/") + "/api/__candidate_probe__")
    if ($response.StatusCode -ne 404) {
        throw "GET /api/__candidate_probe__ expected 404, got $($response.StatusCode)"
    }
    $contentType = [string]$response.ContentType
    $body = [string]$response.Body
    if ($body -imatch "<!doctype|<html") {
        throw "Unknown /api route fell through to SPA HTML"
    }
    if ($contentType -notmatch "json") {
        throw "Unknown /api route must be JSON, got Content-Type=$contentType"
    }
    $json = $body | ConvertFrom-Json
    if ($null -eq $json.error) {
        throw "Unknown /api JSON 404 missing error field"
    }
    Assert-CoreHeaders -Response $response -Path "/api/__candidate_probe__"
}

if ($TestTrafficJson) {
    $mockService = New-ServiceFromTrafficJson -Json $TestTrafficJson
    $checked = Assert-CandidateIsolation -Service $mockService
    Write-Host "PRODUCTION_REVISION=$($checked.ProductionRevision)"
    Write-Host "CANDIDATE_REVISION=$($checked.CandidateRevision)"
    Write-Host "status CANDIDATE_ISOLATED"
    exit 0
}

$service = Get-CloudRunService
$checked = Assert-CandidateIsolation -Service $service
Assert-CandidateUrlIsNotProduction -Checked $checked

$candidateUrl = $checked.CandidateUrl.TrimEnd("/")
Write-Host "PRODUCTION_REVISION=$($checked.ProductionRevision)"
Write-Host "CANDIDATE_REVISION=$($checked.CandidateRevision)"
Write-Host "CANDIDATE_URL=$candidateUrl"

Assert-Health -BaseUrl $candidateUrl
Assert-HomeHtml -BaseUrl $candidateUrl
Assert-UnknownApiJson404 -BaseUrl $candidateUrl

Write-Host "status PASS"
