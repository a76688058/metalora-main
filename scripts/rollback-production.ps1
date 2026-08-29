# Roll back metalora-direct production traffic to the stable-tagged revision.

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
        throw "Expected exactly one revision with 100% traffic after rollback; found $($entries.Count)."
    }

    if ([int]$entries[0].percent -ne 100) {
        throw "Stable revision must receive 100% traffic after rollback; found $($entries[0].percent)%."
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
$stableEntries = @(
    Get-TrafficEntryByTag -Service $serviceBefore -Tag "stable"
)

if ($stableEntries.Count -ne 1) {
    throw "Stable tag not found or ambiguous ($($stableEntries.Count) entries)."
}

$stableRevision = $stableEntries[0].revisionName

Invoke-Gcloud -Args @(
    "run", "services", "update-traffic", $SERVICE,
    "--project=$PROJECT",
    "--region=$REGION",
    "--to-tags=stable=100"
)

$serviceAfter = Get-CloudRunService
$productionAfter = Get-ProductionTrafficEntry -Service $serviceAfter

if ($productionAfter.revisionName -ne $stableRevision) {
    throw "Rollback verification failed. Expected $stableRevision, got $($productionAfter.revisionName)."
}

Write-Host ""
Write-Host "ROLLED_BACK_TO=$stableRevision"
Write-Host "status PASS"
