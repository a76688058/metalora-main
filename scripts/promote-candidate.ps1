# Promote the candidate-tagged revision to 100% production traffic on metalora-direct.

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
        throw "gcloud failed: gcloud $($Args -join ' ')"
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
        throw "Expected exactly one revision with 100% traffic; found $($entries.Count)."
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

$serviceBefore = Get-CloudRunService
$productionBefore = Get-ProductionTrafficEntry -Service $serviceBefore
$previousProductionRevision = $productionBefore.revisionName

$candidateEntries = Get-TrafficEntryByTag -Service $serviceBefore -Tag "candidate"
if ($candidateEntries.Count -ne 1) {
    throw "Candidate tag not found or ambiguous ($($candidateEntries.Count) entries). Deploy a candidate first."
}

$candidateRevision = $candidateEntries[0].revisionName

# --- Point stable at current production before promotion ---
Invoke-Gcloud -Args @(
    "run", "services", "update-traffic", $SERVICE,
    "--project=$PROJECT",
    "--region=$REGION",
    "--update-tags=stable=$previousProductionRevision"
)

# --- Promote candidate to 100% ---
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

$stableEntries = Get-TrafficEntryByTag -Service $serviceAfter -Tag "stable"
if ($stableEntries.Count -ne 1) {
    throw "Expected exactly one stable-tagged revision after promotion; found $($stableEntries.Count)."
}

$stableRevision = $stableEntries[0].revisionName

Write-Host ""
Write-Host "PREVIOUS_PRODUCTION_REVISION=$previousProductionRevision"
Write-Host "NEW_PRODUCTION_REVISION=$($productionAfter.revisionName)"
Write-Host "STABLE_REVISION=$stableRevision"
Write-Host "status PASS"
