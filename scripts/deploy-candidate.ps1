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

function Get-RevisionRecord {
    param([string]$RevisionName)

    $json = gcloud run revisions describe $RevisionName `
        --project=$PROJECT `
        --region=$REGION `
        --format=json
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to describe revision $RevisionName"
    }
    return ($json | ConvertFrom-Json)
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
if ($shortSha -ne $fullSha.Substring(0, $shortSha.Length)) {
    throw "Short SHA does not match HEAD."
}

# --- Deployment config (local files only) ---
$repoRoot = (Invoke-Git -Args @("rev-parse", "--show-toplevel") | Select-Object -First 1).ToString().Trim()
$cloudBuildPath = Join-Path $repoRoot "cloudbuild.yaml"
$dockerPath = Join-Path $repoRoot "Dockerfile"
if (-not (Test-Path -LiteralPath $cloudBuildPath)) { throw "cloudbuild.yaml is missing." }
if (-not (Test-Path -LiteralPath $dockerPath)) { throw "Dockerfile is missing." }
$cloudBuild = Get-Content -LiteralPath $cloudBuildPath -Raw
$dockerfile = Get-Content -LiteralPath $dockerPath -Raw
if ($cloudBuild -notlike "*gcr.io/cloud-builders/docker*") {
    throw "Cloud Build config does not use the docker builder."
}
if ($cloudBuild -notlike "*DOCKER_BUILDKIT=1*") {
    throw "Cloud Build config does not enable BuildKit."
}
if ($cloudBuild -match '(?m)^ARG ' -or $cloudBuild -like "*--build-arg*") {
    throw "Cloud Build config contains a Docker build arg."
}
if ($dockerfile -notlike "*# syntax=docker/dockerfile:1.4*") {
    throw "Dockerfile does not select the BuildKit syntax frontend."
}
if ($dockerfile -notlike "*--mount=type=secret*" -or $dockerfile -notlike "*required=false*") {
    throw "Dockerfile secret mount is not the optional BuildKit mount."
}
if ($dockerfile -match '(?m)^ARG ') {
    throw "Dockerfile contains a build arg."
}

# --- Current production revision (read only; no tag or traffic write) ---
$serviceBefore = Get-CloudRunService
$productionBefore = Get-ProductionTrafficEntry -Service $serviceBefore
$productionRevision = $productionBefore.revisionName

Write-Host "Current production revision: $productionRevision"

# --- Build image before any Cloud Run tag or revision change ---
$image = "${IMAGE_BASE}:${shortSha}"
Write-Host "Building image: $image"

Invoke-Gcloud -Args @(
    "builds", "submit", ".",
    "--project=$PROJECT",
    "--config=cloudbuild.yaml",
    "--substitutions=_IMAGE=$image"
)

# --- Verify the built image and its source tag before Cloud Run changes ---
$fullShaAfterBuild = (Invoke-Git -Args @("rev-parse", "HEAD") | Select-Object -First 1).ToString().Trim()
$shortShaAfterBuild = (Invoke-Git -Args @("rev-parse", "--short", "HEAD") | Select-Object -First 1).ToString().Trim()
if ($fullShaAfterBuild -ne $fullSha -or $shortShaAfterBuild -ne $shortSha) {
    throw "HEAD changed during the image build. Refusing to deploy."
}
if ($image -ne "${IMAGE_BASE}:${shortSha}") {
    throw "Image reference does not match the validated source SHA."
}

$imageJson = gcloud artifacts docker images describe $image `
    --project=$PROJECT `
    --format=json
if ($LASTEXITCODE -ne 0) {
    throw "Built image was not found: $image"
}
$imageRecord = $imageJson | ConvertFrom-Json
$imageDigest = [string]$imageRecord.image_summary.digest
$imageReference = [string]$imageRecord.image_summary.fully_qualified_digest
if ($imageDigest -notmatch '^sha256:[0-9a-f]{64}$') {
    throw "Built image digest is missing for $image"
}
if ($imageReference -ne "${IMAGE_BASE}@${imageDigest}") {
    throw "Built image does not belong to the metalora-direct registry."
}

Write-Host "Verified image: $image"
Write-Host "IMAGE_DIGEST=$imageDigest"

# --- Deploy the verified image (0% production traffic; stable tag is not moved) ---
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

$candidateEntries = @(
    Get-TrafficEntryByTag -Service $serviceAfter -Tag "candidate"
)
if ($candidateEntries.Count -ne 1) {
    throw "Expected exactly one candidate-tagged revision; found $($candidateEntries.Count)."
}

$candidateEntry = $candidateEntries[0]
$candidateRevision = $candidateEntry.revisionName

if ($null -ne $candidateEntry.percent -and [int]$candidateEntry.percent -gt 0) {
    throw "Candidate revision must not receive production traffic; found $($candidateEntry.percent)%."
}

$stableEntries = @(
    Get-TrafficEntryByTag -Service $serviceAfter -Tag "stable"
)
if ($stableEntries.Count -ne 1) {
    throw "Expected exactly one stable-tagged revision; found $($stableEntries.Count)."
}

$stableRevision = $stableEntries[0].revisionName
$candidateUrl = $candidateEntry.url
if (-not $candidateUrl) {
    throw "Candidate URL not found on traffic entry."
}

$candidateRecord = Get-RevisionRecord -RevisionName $candidateRevision
$ready = @($candidateRecord.status.conditions | Where-Object {
        $_.type -eq "Ready" -and $_.status -eq "True"
    })
if ($ready.Count -lt 1) {
    throw "Candidate revision is not Ready: $candidateRevision"
}

$deployedImage = [string]$candidateRecord.spec.containers[0].image
if ($deployedImage -ne $image -and $deployedImage -ne $imageReference) {
    throw "Candidate revision image does not match the verified image."
}

$deploySha = @($candidateRecord.spec.containers[0].env | Where-Object {
        $_.name -eq "DEPLOY_SHA"
    } | Select-Object -First 1).value
if ([string]$deploySha -ne $fullSha) {
    throw "Candidate DEPLOY_SHA does not match the validated source SHA."
}

Write-Host ""
Write-Host "PRODUCTION_REVISION=$productionRevision"
Write-Host "STABLE_REVISION=$stableRevision"
Write-Host "CANDIDATE_REVISION=$candidateRevision"
Write-Host "CANDIDATE_URL=$candidateUrl"
Write-Host "IMAGE=$deployedImage"
Write-Host "GIT_SHA=$fullSha"
Write-Host ""
Write-Host "status PASS"
