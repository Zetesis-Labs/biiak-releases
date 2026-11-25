param(
    [Parameter(Mandatory)][ValidateSet('encrypted', 'plaintext', 'upgrade')][string]$Scenario,
    [Parameter(Mandatory)][ValidatePattern('^v[0-9]+\.[0-9]+\.[0-9]+(-alpha\.[0-9]+)?$')][string]$Tag,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedHash,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_REPOSITORY -ne 'Zetesis-Labs/biiak-releases') { throw 'disposable_public_runner_required' }
if ($env:GH_TOKEN -or $env:GITHUB_TOKEN) { throw 'installation_step_must_not_receive_credentials' }
$programDir = 'C:\Program Files\Biiak'
$dataRoot = 'C:\ProgramData\Biiak'
$serviceName = 'xyz.zetesis.biiak.engine'
$configuration = Join-Path $dataRoot 'data\service.json'
if ((Test-Path -LiteralPath $programDir) -or (Test-Path -LiteralPath $dataRoot) -or (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) { throw 'empty_runner_required' }
if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { throw 'api_port_in_use' }
$version = $Tag.Substring(1)
$filename = "Biiak_${version}_x64-setup.exe"
$candidate = Join-Path $PWD "candidate\$filename"
$result = [ordered]@{ accepted = $false; scenario = $Scenario; tag = $Tag; sourceCommit = $SourceCommit; installerSha256 = $ExpectedHash; clean = $true; versionVerified = $false; dataPreserved = $false; custodyPreserved = $false; textRuntimeStarted = $false; uninstalled = $false }

function Invoke-Executable([string]$Path, [string[]]$Arguments, [int]$TimeoutSeconds = 600) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    $null = $process.Handle
    try {
        $process | Wait-Process -Timeout $TimeoutSeconds -ErrorAction Stop
        if ($null -eq $process.ExitCode -or $process.ExitCode -ne 0) { throw "executable_exit:$($process.ExitCode)" }
    } finally { $process.Dispose() }
}
function Request-Api([string]$Path, [string]$Method = 'GET', $Body = $null, [string]$Token = '') {
    $parameters = @{ Uri = "http://127.0.0.1:8787$Path"; Method = $Method; TimeoutSec = 120 }
    if ($Token) { $parameters.Headers = @{ Authorization = "Bearer $Token" } }
    if ($null -ne $Body) { $parameters.ContentType = 'application/json'; $parameters.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
    Invoke-RestMethod @parameters
}
function Wait-Engine([string]$ExpectedVersion, [string]$State) {
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        try {
            $info = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/info' -TimeoutSec 2
            if ($info.version -eq $ExpectedVersion -and $info.state -eq $State) { return $info }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "engine_not_ready:$ExpectedVersion`:$State"
}
function Custody-Fingerprint {
    $name = [string](Get-Content -LiteralPath $configuration -Raw | ConvertFrom-Json).keyName
    $key = [Security.Cryptography.CngKey]::Open($name, [Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider, [Security.Cryptography.CngKeyOpenOptions]::MachineKey)
    try { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($key.Export([Security.Cryptography.CngKeyBlobFormat]::GenericPublicBlob))) }
    finally { $key.Dispose() }
}
function Check-Hash([string]$Path, [string]$Hash) {
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ine $Hash) { throw 'distribution_hash_mismatch' }
}

try {
    Check-Hash $candidate $ExpectedHash
    $lines = @(Get-Content -LiteralPath 'candidate\SHA256SUMS')
    $expectedNames = @($filename, "$filename.sig", 'latest.json', 'distribution.json')
    if ($lines.Count -ne 4) { throw 'hash_manifest_invalid' }
    $seen = @()
    foreach ($line in $lines) {
        if ($line -cnotmatch '^([a-f0-9]{64})  ([a-zA-Z0-9_.-]+)$') { throw 'hash_entry_invalid' }
        $hash = $Matches[1]; $name = $Matches[2]
        if ($name -cnotin $expectedNames -or $name -cin $seen) { throw 'hash_filename_invalid' }
        Check-Hash (Join-Path 'candidate' $name) $hash
        $seen += $name
    }
    $distribution = Get-Content -LiteralPath 'candidate\distribution.json' -Raw | ConvertFrom-Json
    if ($distribution.commit -cne $SourceCommit -or $distribution.platform -ne 'windows-x64') { throw 'source_manifest_mismatch' }
    $update = Get-Content -LiteralPath 'candidate\latest.json' -Raw | ConvertFrom-Json
    if ($update.version -cne $version -or $update.platforms.'windows-x86_64'.url -cne "https://github.com/Zetesis-Labs/biiak-releases/releases/download/$Tag/$filename") { throw 'update_manifest_mismatch' }
    if ($update.platforms.'windows-x86_64'.signature -cne (Get-Content -LiteralPath "candidate\$filename.sig" -Raw).Trim()) { throw 'signature_manifest_mismatch' }

    $initialVersion = $version
    if ($Scenario -eq 'upgrade') {
        $initialVersion = '0.1.0-alpha.20'
        $baselineName = "Biiak_${initialVersion}_x64-setup.exe"
        $baselineLines = @(Get-Content -LiteralPath 'baseline\SHA256SUMS' | Where-Object { $_ -cmatch "^[a-f0-9]{64}  $([regex]::Escape($baselineName))$" })
        if ($baselineLines.Count -ne 1) { throw 'baseline_hash_missing' }
        Check-Hash (Join-Path 'baseline' $baselineName) $baselineLines[0].Substring(0, 64)
        Invoke-Executable (Join-Path $PWD "baseline\$baselineName") @('/S')
    } else { Invoke-Executable $candidate @('/S') }
    $null = Wait-Engine $initialVersion 'uninitialized'
    $mode = if ($Scenario -eq 'plaintext') { 'plaintext' } else { 'encrypted' }
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $setup = Request-Api '/api/setup' 'POST' @{ username = 'acceptance-ci'; password = $password; modules = @('meetings'); dataProtection = $mode }
    $token = [string]$setup.session.token
    if (-not $token) { throw 'setup_session_missing' }
    $info = Request-Api '/api/info'
    if ($info.storage.backend -ne 'sqlite' -or $info.storage.dataProtection -ne $mode) { throw 'storage_mode_mismatch' }
    $meeting = Request-Api '/api/meetings/manual' 'POST' @{ title = 'Acta sintética de aceptación'; summary = 'Dato sintético que debe persistir' } $token
    if (-not $meeting.id) { throw 'synthetic_write_failed' }
    $beforeMeeting = Request-Api "/api/meetings/$($meeting.id)" 'GET' $null $token | ConvertTo-Json -Depth 30 -Compress
    $beforeKey = Custody-Fingerprint
    if ($Scenario -eq 'upgrade') { Invoke-Executable $candidate @('/S', '/UPDATE') }
    $null = Wait-Engine $version 'open'
    $result.versionVerified = $true
    Restart-Service -Name $serviceName
    $null = Wait-Engine $version 'open'
    $login = Request-Api '/api/session/login' 'POST' @{ username = 'acceptance-ci'; password = $password }
    $token = [string]$login.token
    if (-not $token) { throw 'login_session_missing' }
    $afterMeeting = Request-Api "/api/meetings/$($meeting.id)" 'GET' $null $token | ConvertTo-Json -Depth 30 -Compress
    if ($beforeMeeting -cne $afterMeeting) { throw 'synthetic_data_changed' }
    $result.dataPreserved = $true
    if ((Custody-Fingerprint) -cne $beforeKey) { throw 'custody_changed' }
    $result.custodyPreserved = $true

    foreach ($library in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
        if (-not (Test-Path -LiteralPath (Join-Path ([Environment]::SystemDirectory) $library) -PathType Leaf)) { throw 'visual_cpp_dependency_missing' }
    }
    $runtimes = @($distribution.components | Where-Object { $_.id -ceq 'llama-win-x64' -and $_.backend -ceq 'cpu' })
    if ($runtimes.Count -ne 1) { throw 'text_runtime_manifest_invalid' }
    $runtime = $runtimes[0]
    if ($runtime.url -cnotmatch '^https://github\.com/ggml-org/llama\.cpp/releases/download/[a-zA-Z0-9.-]+/[a-zA-Z0-9.-]+\.zip$') { throw 'text_runtime_url_invalid' }
    $zip = Join-Path $env:RUNNER_TEMP 'text-runtime.zip'
    Invoke-WebRequest -Uri $runtime.url -OutFile $zip -TimeoutSec 180
    if ((Get-Item -LiteralPath $zip).Length -ne $runtime.bytes) { throw 'text_runtime_size_mismatch' }
    Check-Hash $zip $runtime.sha256
    $runtimeDir = Join-Path $env:RUNNER_TEMP 'text-runtime'
    Expand-Archive -LiteralPath $zip -DestinationPath $runtimeDir
    $servers = @(Get-ChildItem -LiteralPath $runtimeDir -Filter llama-server.exe -Recurse -File)
    if ($servers.Count -ne 1) { throw 'text_runtime_executable_missing' }
    Invoke-Executable $servers[0].FullName @('--help') 30
    $result.textRuntimeStarted = $true
    Invoke-Executable (Join-Path $programDir 'uninstall.exe') @('/S', "_?=$programDir")
    if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { throw 'service_remains_after_uninstall' }
    $result.uninstalled = $true
    $result.accepted = $true
} catch {
    $result.error = $_.Exception.Message
    throw
} finally {
    $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath 'windows-acceptance.json' -Encoding utf8
    # GitHub destroys this VM. Preserve synthetic data and logs until then.
}
