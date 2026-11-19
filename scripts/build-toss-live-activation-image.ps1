# Build a local activation image from one committed source SHA.
# Does not deploy or change Cloud Run traffic.
# The repository freeze file is not rewritten.
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$image = "us-west1-docker.pkg.dev/metalora-auth/cloud-run-source-deploy/metalora-direct:activation"
$activationError = $null
$temp = $null
$work = $null

try {
    Push-Location $repoRoot
    try {
        $porcelain = & git status --porcelain
        if ($LASTEXITCODE -ne 0) { throw "git status failed" }
        if (-not [string]::IsNullOrWhiteSpace(($porcelain | Out-String))) {
            throw "activation refused: source worktree is dirty"
        }
        $sourceSha = (& git rev-parse HEAD).Trim()
        if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw "git rev-parse HEAD did not return a commit" }
    } finally {
        Pop-Location
    }

    $keyFile = $env:METALORA_TOSS_LIVE_CLIENT_KEY_FILE
    if ($keyFile) {
        $keyFull = [System.IO.Path]::GetFullPath($keyFile)
        if ($keyFull.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "activation refused: client key file must stay outside the repository"
        }
        $clientKey = [System.IO.File]::ReadAllText($keyFull).Trim()
    } else {
        $secure = Read-Host -AsSecureString -Prompt "Toss LIVE client key"
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $clientKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
    }
    if ($clientKey -notmatch '^live_ck_[A-Za-z0-9]+$') {
        throw "activation refused: client key prefix is not a public LIVE client key"
    }
    if ($clientKey -match 'test_(ck|sk|gsk)|live_(sk|gsk)') {
        throw "activation refused: test key or private secret prefix"
    }

    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("metalora-live-ck-" + [guid]::NewGuid().ToString("n"))
    $work = Join-Path ([System.IO.Path]::GetTempPath()) ("metalora-activation-" + [guid]::NewGuid().ToString("n"))
    $context = Join-Path $work "context"
    if ($context.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "activation context must stay outside the repository"
    }
    New-Item -ItemType Directory -Path $context | Out-Null
    [System.IO.File]::WriteAllText($temp, $clientKey)
    $clientKey = $null
    $account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $temp /inheritance:r "/grant:r" "${account}:(R)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "temporary key ACL could not be restricted" }

    $archive = Join-Path $work "source.tar"
    Push-Location $repoRoot
    try {
        & git archive --format=tar -o $archive HEAD
        if ($LASTEXITCODE -ne 0) { throw "git archive failed" }
    } finally {
        Pop-Location
    }
    & tar -xf $archive -C $context
    if ($LASTEXITCODE -ne 0) { throw "git archive extract failed" }
    [System.IO.File]::WriteAllText((Join-Path $context "SOURCE_SHA"), $sourceSha)

    $confirm = Read-Host -Prompt "Type PUSH to build the local activation image"
    if ($confirm -ne "PUSH") { throw "activation image build was not confirmed" }

    & docker build `
        --label "org.opencontainers.image.revision=$sourceSha" `
        --secret "id=toss_live_client_key,src=$temp" `
        -t $image `
        $context
    if ($LASTEXITCODE -ne 0) { throw "docker build failed" }
} catch {
    $activationError = $_
} finally {
    if ($temp) {
        & icacls $temp /reset | Out-Null
        Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $temp) {
            throw "Temporary activation files could not be removed."
        }
    }
    if ($work) {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $work) {
            throw "Temporary activation files could not be removed."
        }
    }
}

if ($null -ne $activationError) {
    throw $activationError
}
