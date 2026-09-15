# Promote the candidate-tagged revision to 100% production traffic on metalora-direct.
# Fail-closed: refuse unless candidate is a distinct 0% revision (#19D/E-1).
# Does not retag stable. deploy-candidate.ps1 assigns stable to pre-deploy production.
#
# -ValidateOnly  : read-only describe + safety check; no traffic change
# -TestTrafficJson : evaluate safety against injected status.traffic JSON; no gcloud

param(
    [switch]$ValidateOnly,
    [string]$TestTrafficJson
)

$ErrorActionPreference = "Stop"

$PROJECT = "metalora-auth"
$REGION = "us-west1"
$SERVICE = "metalora-direct"

function Invoke-Gcloud {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )
    & gcloud @Args
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud failed: gcloud $($Args -join ' ') (exit $LASTEXITCODE)"
    }
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
        throw "Expected exactly one revision with >0 traffic; found $($entries.Count)."
    }

    if ([int]$entries[0].percent -ne 100) {
        throw "Production revision must receive 100% traffic; found $($entries[0].percent)%."
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

function Assert-PromoteSafety {
    param($Service)

    $production = Get-ProductionTrafficEntry -Service $Service
    $productionRevision = [string]$production.revisionName

    $candidateEntries = @(Get-TrafficEntryByTag -Service $Service -Tag "candidate")
    if ($candidateEntries.Count -ne 1) {
        throw "Candidate tag not found or ambiguous ($($candidateEntries.Count) entries). Deploy an isolated candidate first."
    }

    $stableEntries = @(Get-TrafficEntryByTag -Service $Service -Tag "stable")
    if ($stableEntries.Count -ne 1) {
        throw "Stable tag not found or ambiguous ($($stableEntries.Count) entries)."
    }

    $candidateRevision = [string]$candidateEntries[0].revisionName
    $stableRevision = [string]$stableEntries[0].revisionName

    if ([string]::IsNullOrWhiteSpace($candidateRevision)) {
        throw "Candidate tag has no revisionName."
    }
    if ([string]::IsNullOrWhiteSpace($stableRevision)) {
        throw "Stable tag has no revisionName."
    }

    if ($candidateRevision -eq $productionRevision) {
        throw "Promote refused: candidate revision equals current production ($candidateRevision). Deploy a new isolated candidate first."
    }

    if (-not (Test-CandidateHasNoProductionTraffic -CandidateEntry $candidateEntries[0])) {
        throw "Promote refused: candidate must have 0% or unset traffic; found $($candidateEntries[0].percent)%."
    }

    if ($stableRevision -eq $candidateRevision) {
        throw "Promote refused: stable must not point at the candidate revision ($candidateRevision)."
    }

    return [pscustomobject]@{
        ProductionRevision = $productionRevision
        CandidateRevision  = $candidateRevision
        StableRevision     = $stableRevision
    }
}

function New-ServiceFromTrafficJson {
    param([string]$Json)

    $parsed = $Json | ConvertFrom-Json
    $traffic = @($parsed)
    return [pscustomobject]@{
        status = [pscustomobject]@{
            traffic = $traffic
        }
    }
}

if ($TestTrafficJson) {
    $mockService = New-ServiceFromTrafficJson -Json $TestTrafficJson
    $checked = Assert-PromoteSafety -Service $mockService
    Write-Host "PRODUCTION_REVISION=$($checked.ProductionRevision)"
    Write-Host "CANDIDATE_REVISION=$($checked.CandidateRevision)"
    Write-Host "STABLE_REVISION=$($checked.StableRevision)"
    Write-Host "status PROMOTE_SAFE"
    exit 0
}

$serviceBefore = Get-CloudRunService
$checked = Assert-PromoteSafety -Service $serviceBefore

if ($ValidateOnly) {
    Write-Host "PRODUCTION_REVISION=$($checked.ProductionRevision)"
    Write-Host "CANDIDATE_REVISION=$($checked.CandidateRevision)"
    Write-Host "STABLE_REVISION=$($checked.StableRevision)"
    Write-Host "status PROMOTE_SAFE"
    exit 0
}

$previousProductionRevision = $checked.ProductionRevision
$candidateRevision = $checked.CandidateRevision
$stableBeforeRevision = $checked.StableRevision

# --- Promote candidate to 100% (does not retag stable) ---
Invoke-Gcloud -Args @(
    "run", "services", "update-traffic", $SERVICE,
    "--project=$PROJECT",
    "--region=$REGION",
    "--to-tags=candidate=100"
)

$serviceAfter = Get-CloudRunService
$productionAfter = Get-ProductionTrafficEntry -Service $serviceAfter

if ($productionAfter.revisionName -ne $candidateRevision) {
    throw "Promotion verification failed. Expected production revision $candidateRevision, got $($productionAfter.revisionName)."
}

$stableEntries = @(
    Get-TrafficEntryByTag -Service $serviceAfter -Tag "stable"
)
if ($stableEntries.Count -ne 1) {
    throw "Expected exactly one stable-tagged revision after promotion; found $($stableEntries.Count)."
}

$stableRevision = [string]$stableEntries[0].revisionName
if ($stableRevision -ne $stableBeforeRevision) {
    throw "Promote must not change the stable rollback target. Before=$stableBeforeRevision After=$stableRevision."
}
if ($stableRevision -eq [string]$productionAfter.revisionName) {
    throw "Stable rollback target must remain distinct from new production ($stableRevision)."
}

Write-Host ""
Write-Host "PREVIOUS_PRODUCTION_REVISION=$previousProductionRevision"
Write-Host "NEW_PRODUCTION_REVISION=$($productionAfter.revisionName)"
Write-Host "STABLE_REVISION=$stableRevision"
Write-Host "status PASS"
