# Dry-run by default. Does not change Cloud Run traffic or tags.
# The rollback target is the approved revision below, never the stable tag.
# A real rollback requires both -Execute and
# -OwnerAuthorization "APPROVE ROLLBACK metalora-direct-00153-puf".
# That execution still does not remove tags.
# After a future traffic rollback, tag removal is a separate owner authorization.
# Re-read the tag-to-revision map first, then remove only the one tag that
# points at the LIVE-capable revision just left. Never remove unrelated tags.
# If that mapping is ambiguous, stop and remove nothing.

param(
    [switch]$Execute,
    [string]$OwnerAuthorization = "",
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

$Project = "metalora-auth"
$Region = "us-west1"
$Service = "metalora-direct"
$ApprovedRevision = "metalora-direct-00153-puf"
$ApprovedSha = "f8e4bc2dc1b09ddbb5ba86037afcce25adb6d106"
$RequiredAuthorization = "APPROVE ROLLBACK metalora-direct-00153-puf"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-RollbackCommand {
    return "gcloud run services update-traffic $Service --project=$Project --region=$Region --to-revisions=${ApprovedRevision}=100"
}

function Test-RollbackPreconditions {
    param(
        [string]$ObservedRevision,
        [string]$ObservedSha,
        [bool]$CancellationPresent
    )

    if ($ObservedRevision -ne $ApprovedRevision) {
        throw "Rollback refused: revision '$ObservedRevision' is not the approved target $ApprovedRevision. No substitute revision is allowed."
    }
    if ($ObservedSha -ne $ApprovedSha) {
        throw "Rollback refused: DEPLOY_SHA '$ObservedSha' does not match $ApprovedSha."
    }
    if (-not $CancellationPresent) {
        throw "Rollback refused: $ApprovedRevision at $ApprovedSha does not contain the admin cancellation route."
    }
}

function Test-ExecutionAuthorized {
    param([bool]$ExecuteRequested, [string]$Authorization)

    if (-not $ExecuteRequested) {
        return $false
    }
    if ($Authorization -ne $RequiredAuthorization) {
        throw "Rollback execution refused: owner authorization is missing. No traffic change was made."
    }
    return $true
}

function Get-CandidateContainmentPlan {
    param($TaggedRevisions)

    $liveCapable = @($TaggedRevisions | Where-Object {
            $outsideTarget = $_.Revision -ne $ApprovedRevision -and -not [string]::IsNullOrWhiteSpace($_.Tag)
            $explicitlyOpen = $_.FreezeState -eq "disabled"
            $servingUnknown = $_.FreezeState -eq "unknown" -and [int]$_.Percent -gt 0
            $outsideTarget -and ($explicitlyOpen -or $servingUnknown)
        })

    if ($liveCapable.Count -eq 0) {
        return @{
            Status = "READY"
            Reason = "No tagged revision outside the approved rollback target is LIVE-capable."
            Command = ""
        }
    }

    $tags = @($liveCapable | ForEach-Object { $_.Tag } | Select-Object -Unique)
    $revisions = @($liveCapable | ForEach-Object { $_.Revision } | Select-Object -Unique)
    if ($tags.Count -ne 1 -or $revisions.Count -ne 1) {
        return @{
            Status = "BLOCKED"
            Reason = "LIVE-capable candidate tag mapping is ambiguous. Remove no tags."
            Command = ""
        }
    }

    $tag = [string]$tags[0]
    if ($tag -eq "stable") {
        return @{
            Status = "BLOCKED"
            Reason = "The only LIVE-capable tag is stable. Refusing to remove it."
            Command = ""
        }
    }

    $sameTagOnApprovedTarget = @($TaggedRevisions | Where-Object {
            $_.Tag -eq $tag -and $_.Revision -eq $ApprovedRevision
        })
    if ($sameTagOnApprovedTarget.Count -gt 0) {
        return @{
            Status = "BLOCKED"
            Reason = "Tag '$tag' also points at the approved rollback revision. Remove no tags."
            Command = ""
        }
    }

    return @{
        Status = "READY"
        Reason = "After traffic returns to $ApprovedRevision, remove only tag '$tag' from $($revisions[0])."
        Command = "gcloud run services update-traffic $Service --project=$Project --region=$Region --remove-tags=$tag"
    }
}

function Test-GitContainsFixedString {
    param([string]$Sha, [string]$Pattern, [string]$Path)

    & git -C $RepoRoot grep -F -q -e $Pattern $Sha -- $Path
    return ($LASTEXITCODE -eq 0)
}

function Invoke-SelfTest {
    $failures = @()

    try {
        Test-RollbackPreconditions -ObservedRevision "metalora-direct-00139-men" -ObservedSha $ApprovedSha -CancellationPresent $true
        $failures += "unsafe revision was accepted"
    } catch {
        if ($_.Exception.Message -notmatch "not the approved target") { $failures += $_.Exception.Message }
    }

    try {
        Test-RollbackPreconditions -ObservedRevision $ApprovedRevision -ObservedSha "84aabfb99bcb68cf658e6b7b1fd9a44ecc81ce2d" -CancellationPresent $true
        $failures += "SHA mismatch was accepted"
    } catch {
        if ($_.Exception.Message -notmatch "DEPLOY_SHA") { $failures += $_.Exception.Message }
    }

    try {
        Test-RollbackPreconditions -ObservedRevision $ApprovedRevision -ObservedSha $ApprovedSha -CancellationPresent $false
        $failures += "missing cancellation route was accepted"
    } catch {
        if ($_.Exception.Message -notmatch "cancellation route") { $failures += $_.Exception.Message }
    }

    $dryRunMutates = Test-ExecutionAuthorized -ExecuteRequested $false -Authorization ""
    if ($dryRunMutates) { $failures += "default dry-run requested a mutation" }

    try {
        [void](Test-ExecutionAuthorized -ExecuteRequested $true -Authorization "")
        $failures += "missing owner authorization was accepted"
    } catch {
        if ($_.Exception.Message -notmatch "owner authorization") { $failures += $_.Exception.Message }
    }

    $command = Get-RollbackCommand
    if ($command -notmatch "--to-revisions=metalora-direct-00153-puf=100") {
        $failures += "rollback command does not target 00153-puf"
    }
    if ($command -match "stable") {
        $failures += "rollback command still depends on the stable tag"
    }

    $ambiguous = Get-CandidateContainmentPlan -TaggedRevisions @(
        @{ Revision = "metalora-direct-00160-rix"; Tag = "candidate"; FreezeState = "disabled"; Percent = 100 },
        @{ Revision = "metalora-direct-00160-rix"; Tag = "other"; FreezeState = "disabled"; Percent = 0 }
    )
    if ($ambiguous.Status -ne "BLOCKED" -or $ambiguous.Command -ne "") {
        $failures += "ambiguous LIVE-capable tags were not fail-closed"
    }

    $frozen = Get-CandidateContainmentPlan -TaggedRevisions @(
        @{ Revision = "metalora-direct-00160-rix"; Tag = "candidate"; FreezeState = "enabled"; Percent = 0 },
        @{ Revision = "metalora-direct-00139-men"; Tag = "stable"; FreezeState = "enabled"; Percent = 0 },
        @{ Revision = "metalora-direct-00079-pxx"; Tag = "old"; FreezeState = "unknown"; Percent = 0 }
    )
    if ($frozen.Status -ne "READY" -or $frozen.Command -ne "") {
        $failures += "frozen tagged revisions were treated as requiring tag removal"
    }

    if ($failures.Count -gt 0) {
        throw ("Self-test failed: " + ($failures -join "; "))
    }

    Write-Host "SELF_TEST=PASS"
}

function Invoke-GcloudText {
    param([Parameter(Mandatory = $true)][string[]]$GcloudArgs)

    $output = & gcloud @GcloudArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud failed: gcloud $($GcloudArgs -join ' ')"
    }
    return @($output)
}

if ($SelfTest -and $Execute) {
    throw "Self-test cannot run together with execution."
}

if ($SelfTest) {
    Invoke-SelfTest
    exit 0
}

$mutationAuthorized = Test-ExecutionAuthorized -ExecuteRequested ([bool]$Execute) -Authorization $OwnerAuthorization

$trafficJson = Invoke-GcloudText -GcloudArgs @(
    "run", "services", "describe", $Service,
    "--project=$Project",
    "--region=$Region",
    "--format=json(status.traffic)"
)
$traffic = (ConvertFrom-Json (($trafficJson -join "`n"))).status.traffic

$shaLines = Invoke-GcloudText -GcloudArgs @(
    "run", "revisions", "list",
    "--service=$Service",
    "--project=$Project",
    "--region=$Region",
    "--limit=300",
    "--format=csv[no-heading](metadata.name,spec.containers[0].env.filter(name:DEPLOY_SHA).flatten(value))"
)

$shaByRevision = @{}
foreach ($line in $shaLines) {
    $match = [regex]::Match([string]$line, '^(?<name>metalora-direct-[^,]+),"?name=DEPLOY_SHA,value=(?<sha>[0-9a-f]{40})"?$')
    if ($match.Success) {
        $shaByRevision[$match.Groups["name"].Value] = $match.Groups["sha"].Value
    }
}

$observedSha = [string]$shaByRevision[$ApprovedRevision]
$cancellationPresent = (Test-GitContainsFixedString -Sha $ApprovedSha -Pattern "registerFullOrderCancellationRoute" -Path "server.ts") -and
    (Test-GitContainsFixedString -Sha $ApprovedSha -Pattern "/api/admin/orders/:orderId/cancel" -Path "src/lib/paymentCancellation.ts")

Test-RollbackPreconditions -ObservedRevision $ApprovedRevision -ObservedSha $observedSha -CancellationPresent $cancellationPresent
$targetFreezeEnabled = Test-GitContainsFixedString -Sha $ApprovedSha -Pattern "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true" -Path "src/lib/publicPaymentFreeze.ts"
if (-not $targetFreezeEnabled) {
    throw "Rollback refused: $ApprovedRevision does not keep the public payment freeze enabled."
}

$tagged = @()
foreach ($entry in @($traffic)) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.tag)) { continue }
    $revisionName = [string]$entry.revisionName
    $revisionSha = [string]$shaByRevision[$revisionName]
    if ([string]::IsNullOrWhiteSpace($revisionSha)) {
        throw "Rollback refused: DEPLOY_SHA for tagged revision $revisionName could not be read."
    }
    $freezeEnabled = Test-GitContainsFixedString -Sha $revisionSha -Pattern "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = true" -Path "src/lib/publicPaymentFreeze.ts"
    $freezeDisabled = Test-GitContainsFixedString -Sha $revisionSha -Pattern "PUBLIC_PAYMENT_FROZEN_UNTIL_NEW7 = false" -Path "src/lib/publicPaymentFreeze.ts"
    $freezeState = if ($freezeEnabled) { "enabled" } elseif ($freezeDisabled) { "disabled" } else { "unknown" }
    $percent = if ($null -eq $entry.percent) { 0 } else { [int]$entry.percent }
    $tagged += @{
        Revision = $revisionName
        Tag = [string]$entry.tag
        FreezeState = $freezeState
        Percent = $percent
    }
}

$containment = Get-CandidateContainmentPlan -TaggedRevisions $tagged
$command = Get-RollbackCommand

Write-Host "ROLLBACK_TARGET=$ApprovedRevision"
Write-Host "DEPLOY_SHA=$observedSha"
Write-Host "SHA_MATCH=true"
Write-Host "CANCELLATION_ROUTE=present"
Write-Host "PAYMENT_FREEZE=enabled"
Write-Host "TAGGED_REVISIONS_CHECKED=$($tagged.Count)"
Write-Host "CONTAINMENT_STATUS=$($containment.Status)"
Write-Host "CONTAINMENT_REASON=$($containment.Reason)"
if ($containment.Command) {
    Write-Host "CONTAINMENT_COMMAND=$($containment.Command)"
}
Write-Host "CONTAINMENT_EXECUTED=false"
Write-Host "COMMAND=$command"

if ($containment.Status -ne "READY") {
    throw "Candidate containment is BLOCKED. No traffic or tag change was made."
}

if (-not $mutationAuthorized) {
    Write-Host "DRY_RUN=true"
    Write-Host "MUTATION=not executed"
    exit 0
}

[void](Invoke-GcloudText -GcloudArgs @(
    "run", "services", "update-traffic", $Service,
    "--project=$Project",
    "--region=$Region",
    "--to-revisions=$ApprovedRevision=100"
))

$afterJson = Invoke-GcloudText -GcloudArgs @(
    "run", "services", "describe", $Service,
    "--project=$Project",
    "--region=$Region",
    "--format=json(status.traffic)"
)
$afterTraffic = @((ConvertFrom-Json (($afterJson -join "`n"))).status.traffic)
$positive = @($afterTraffic | Where-Object { $null -ne $_.percent -and [int]$_.percent -gt 0 })
if ($positive.Count -ne 1 -or [int]$positive[0].percent -ne 100 -or [string]$positive[0].revisionName -ne $ApprovedRevision) {
    throw "Rollback verification failed. Approved revision did not receive 100% traffic."
}

Write-Host "DRY_RUN=false"
Write-Host "MUTATION=traffic-only"
Write-Host "ROLLED_BACK_TO=$ApprovedRevision"
Write-Host "status PASS"
