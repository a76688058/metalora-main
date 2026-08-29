# Deploy a zero-traffic candidate revision to metalora-direct (production stays at 100%).
# Requires: gcloud CLI, git, pushed main, clean worktree.

$ErrorActionPreference = "Stop"

$PROJECT = "metalora-auth"
$REGION = "us-west1"
$SERVICE = "metalora-direct"
$IMAGE_BASE = "us-west1-docker.pkg.dev/metalora-auth/cloud-run-source-deploy/metalora-direct"

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args
    )
    $output = & git @Args
    if ($LASTEXITCODE -ne 0) {
        throw "git failed: git $($Args -join ' ') (exit $LASTEXITCODE)"
    }
    return $output
}

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
        throw "Expected exactly one revision with 100% traffic; found $($entries.Count). Resolve traffic split before deploying."
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

function Get-RevisionImage {
    param([string]$RevisionName)

    $json = gcloud run revisions describe $RevisionName `
        --project=$PROJECT `
        --region=$REGION `
        --format=json
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to describe revision $RevisionName"
    }
    $rev = $json | ConvertFrom-Json
    return $rev.spec.containers[0].image
}

# --- Git preflight ---
$branch = (Invoke-Git -Args @("branch", "--show-current") | Select-Object -First 1).ToString().Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
    throw "Deploy requires branch main (current: detached HEAD or unknown)."
}
if ($branch -ne "main") {
    throw "Deploy requires branch main (current: $branch)."
}

$porcelain = @(Invoke-Git -Args @("status", "--porcelain"))
if ($porcelain.Count -gt 0) {
    $preview = ($porcelain | Select-Object -First 5) -join "`n"
    $suffix = if ($porcelain.Count -gt 5) { "`n..." } else { "" }
    throw "Working tree is not clean. Commit, stash, or remove local changes before deploying.`n$preview$suffix"
}

Invoke-Git -Args @("fetch", "origin", "main") | Out-Null

$fullSha = (Invoke-Git -Args @("rev-parse", "HEAD") | Select-Object -First 1).ToString().Trim()
$shortSha = (Invoke-Git -Args @("rev-parse", "--short", "HEAD") | Select-Object -First 1).ToString().Trim()
$originMain = (Invoke-Git -Args @("rev-parse", "origin/main") | Select-Object -First 1).ToString().Trim()

if ($fullSha -ne $originMain) {
    throw "Local HEAD ($shortSha) is not aligned with origin/main. Push before deploying."
}

# --- Current production revision ---
$serviceBefore = Get-CloudRunService
$productionBefore = Get-ProductionTrafficEntry -Service $serviceBefore
$productionRevision = $productionBefore.revisionName

Write-Host "Current production revision: $productionRevision"

# --- Tag stable (traffic percentage unchanged) ---
Invoke-Gcloud -Args @(
    "run", "services", "update-traffic", $SERVICE,
    "--project=$PROJECT",
    "--region=$REGION",
    "--update-tags=stable=$productionRevision"
)

# --- Build image ---
$image = "${IMAGE_BASE}:${shortSha}"
Write-Host "Building image: $image"

Invoke-Gcloud -Args @(
    "builds", "submit", ".",
    "--project=$PROJECT",
    "--tag=$image"
)

# --- Deploy candidate (0% production traffic) ---
Invoke-Gcloud -Args @(
    "run", "deploy", $SERVICE,
    "--project=$PROJECT",
    "--region=$REGION",
    "--image=$image",
    "--no-traffic",
    "--tag=candidate",
    "--update-env-vars=DEPLOY_SHA=$fullSha"
)

# --- Post-deploy verification ---
$serviceAfter = Get-CloudRunService
$productionAfter = Get-ProductionTrafficEntry -Service $serviceAfter

if ($productionAfter.revisionName -ne $productionRevision) {
    throw "Production revision changed during deploy. Expected $productionRevision, got $($productionAfter.revisionName)."
}

$candidateEntries = Get-TrafficEntryByTag -Service $serviceAfter -Tag "candidate"
if ($candidateEntries.Count -ne 1) {
    throw "Expected exactly one candidate-tagged revision; found $($candidateEntries.Count)."
}

$candidateEntry = $candidateEntries[0]
$candidateRevision = $candidateEntry.revisionName

if ($null -ne $candidateEntry.percent -and [int]$candidateEntry.percent -gt 0) {
    throw "Candidate revision must not receive production traffic; found $($candidateEntry.percent)%."
}

$stableEntries = Get-TrafficEntryByTag -Service $serviceAfter -Tag "stable"
if ($stableEntries.Count -ne 1) {
    throw "Expected exactly one stable-tagged revision; found $($stableEntries.Count)."
}

$stableRevision = $stableEntries[0].revisionName
$candidateUrl = $candidateEntry.url
if (-not $candidateUrl) {
    throw "Candidate URL not found on traffic entry."
}

$deployedImage = Get-RevisionImage -RevisionName $candidateRevision

Write-Host ""
Write-Host "PRODUCTION_REVISION=$productionRevision"
Write-Host "STABLE_REVISION=$stableRevision"
Write-Host "CANDIDATE_REVISION=$candidateRevision"
Write-Host "CANDIDATE_URL=$candidateUrl"
Write-Host "IMAGE=$deployedImage"
Write-Host "GIT_SHA=$fullSha"
Write-Host ""
Write-Host "status PASS"
