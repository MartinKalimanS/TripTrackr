<#
.SYNOPSIS
  One command to try TripTrackr on a USB-connected Android phone.

.DESCRIPTION
  1. Starts Docker Desktop if needed and brings up the dev stack (Postgres, Redis, RustFS, API, worker).
  2. Decides how the phone reaches this PC (see -Connection), then points the stack
     (S3_PUBLIC_ENDPOINT in .env) and the app (EXPO_PUBLIC_API_URL in apps/mobile/.env.local) at it.
  3. Offers to load the city catalogue (GeoNames, CC BY 4.0) the first time; stops need it.
  4. Builds and installs the development client when it is missing or its native inputs changed.
  5. Starts Metro in its own window and opens the app on the phone.

  Safe to re-run. It changes files only inside this repository (git-ignored ones) and, only if you
  say yes in Wi-Fi mode, adds one Windows Firewall rule for TCP 3000, 8081 and 9000 on private
  networks.

  Expo Go cannot run this app (native modules), and there is no iOS path from Windows: this is
  Android only. See apps/mobile/README.md.

.PARAMETER Connection
  Lan  - the phone reaches this PC by its Wi-Fi address. Needs the same network, a Private network
         profile and a firewall rule. Airplane mode really cuts the API: use this for offline tests.
  Usb  - the phone reaches this PC through the USB cable (adb reverse). Works on any network,
         including campus and public Wi-Fi, and needs no firewall change. adb reverse survives
         airplane mode, so to go offline run:  adb reverse --remove-all
  Auto - (default) Usb when this PC's network is set to Public in Windows, otherwise Lan.

.PARAMETER HostIp
  Lan mode: this PC's address as the phone sees it. Detected from the default route when omitted.

.PARAMETER Device
  adb serial to use when several devices are attached. A physical phone is preferred otherwise.

.PARAMETER Check
  Report what would happen and change nothing: no files edited, nothing started, nothing built.

.PARAMETER BackendOnly
  Bring up the stack (and offer the city catalogue), then stop. No phone needed.

.PARAMETER SkipBackend
  Leave Docker alone; only build/install if needed, start Metro and open the app.

.PARAMETER NoApiBuild
  Do not pass --build to docker compose (faster restarts when the API code has not changed).

.PARAMETER RebuildApp
  Force a native rebuild and reinstall of the development client.

.PARAMETER ImportGeo
  Download and import the city catalogue without asking (also the only way when not interactive).

.PARAMETER Stop
  Stop the Docker stack (data is kept) and exit. Close the Metro window yourself.
#>
[CmdletBinding()]
param(
    [ValidateSet('Auto', 'Lan', 'Usb')]
    [string]$Connection = 'Auto',
    [string]$HostIp,
    [string]$Device,
    [switch]$Check,
    [switch]$BackendOnly,
    [switch]$SkipBackend,
    [switch]$NoApiBuild,
    [switch]$RebuildApp,
    [switch]$ImportGeo,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 1.0

$Root = Split-Path -Parent $PSScriptRoot
$MobileDir = Join-Path $Root 'apps\mobile'
$EnvFile = Join-Path $Root '.env'
$MobileEnvFile = Join-Path $MobileDir '.env.local'
$StampFile = Join-Path $MobileDir 'android\.run-on-phone.stamp'
$Compose = @('compose', '--env-file', '.env', '-f', 'infra/docker-compose.yml')
$AppId = 'com.triptrackr.app.dev'
$DevClientScheme = 'exp+triptrackr'
$ApiPort = 3000
$MetroPort = 8081
$StoragePort = 9000
$FirewallRuleName = 'TripTrackr dev (phone access)'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$BuildJdk = $null

Set-Location $Root

# ---------------------------------------------------------------- output helpers

function Write-Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Info([string]$Text) { Write-Host "    $Text" }
function Write-Ok([string]$Text) { Write-Host "    OK  $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    !!  $Text" -ForegroundColor Yellow }
function Stop-Script([string]$Text) {
    Write-Host ''
    Write-Host "ERROR: $Text" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- process helpers

# Runs a native command and reports whether it exited 0, printing nothing.
function Test-Quiet([scriptblock]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command *> $null; return ($LASTEXITCODE -eq 0) }
    catch { return $false }
    finally { $ErrorActionPreference = $previous }
}

# Runs a native command with its output visible and stops the script if it fails.
function Invoke-Native([string]$Label, [scriptblock]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command } finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { Stop-Script "$Label failed (exit code $LASTEXITCODE). The output above says why." }
}

# Runs a native command and returns its output lines; failures yield whatever was printed.
function Get-NativeOutput([scriptblock]$Command) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { return @(& $Command 2>&1 | ForEach-Object { "$_" } | Where-Object { $_.Trim() }) }
    catch { return @() }
    finally { $ErrorActionPreference = $previous }
}

function Confirm-Action([string]$Question, [bool]$Default) {
    if ([Console]::IsInputRedirected) { return $false }
    $hint = if ($Default) { '[Y/n]' } else { '[y/N]' }
    $answer = Read-Host "    $Question $hint"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return ($answer.Trim() -match '^(y|yes)$')
}

function Test-Http([string]$Url, [string]$Contains) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        $body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
        return ((-not $Contains) -or $body.Contains($Contains))
    }
    catch { return $false }
}

function Wait-Http([string]$Url, [int]$Seconds, [string]$Contains) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (Test-Http $Url $Contains) { return $true }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    return $false
}

# ---------------------------------------------------------------- .env helpers

function Get-EnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path $Path)) { return $null }
    $match = [regex]::Match([IO.File]::ReadAllText($Path), '(?m)^' + [regex]::Escape($Key) + '=([^\r\n]*)')
    if ($match.Success) { return $match.Groups[1].Value }
    return $null
}

# Sets KEY=value in a dotenv file, keeping every other line and the file's line endings.
# Returns $true when the file changed.
function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
    $text = [IO.File]::ReadAllText($Path)
    $pattern = '(?m)^' + [regex]::Escape($Key) + '=[^\r\n]*'
    $line = "$Key=$Value"
    if ([regex]::IsMatch($text, $pattern)) {
        $updated = [regex]::Replace($text, $pattern, $line.Replace('$', '$$'))
    }
    else {
        $newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
        $separator = if (($text.Length -eq 0) -or $text.EndsWith("`n")) { '' } else { $newline }
        $updated = $text + $separator + $line + $newline
    }
    if ($updated -ceq $text) { return $false }
    [IO.File]::WriteAllText($Path, $updated, $Utf8NoBom)
    return $true
}

# ---------------------------------------------------------------- network

# The address the OS would use to leave this machine. A UDP "connect" sends nothing.
function Get-LanIp {
    $client = New-Object System.Net.Sockets.UdpClient
    try {
        $client.Connect('203.0.113.1', 9)
        return $client.Client.LocalEndPoint.Address.ToString()
    }
    catch { return $null }
    finally { $client.Close() }
}

function Get-NetworkProfile([string]$Ip) {
    try {
        $address = Get-NetIPAddress -IPAddress $Ip -ErrorAction Stop
        $joined = Get-NetConnectionProfile -InterfaceIndex $address.InterfaceIndex -ErrorAction Stop
        return [pscustomobject]@{ Name = "$($joined.Name)"; Alias = "$($address.InterfaceAlias)"; Category = "$($joined.NetworkCategory)" }
    }
    catch { return $null }
}

# Auto picks the USB tunnel on a Public network: Windows blocks inbound connections there and such
# networks (campus, cafe, hotel) often isolate devices from each other, so a LAN address would not work.
function Resolve-Connection([string]$Ip) {
    if ($Connection -ne 'Auto') { return $Connection }
    $network = Get-NetworkProfile $Ip
    if ($network -and $network.Category -eq 'Public') {
        Write-Warn "Windows classes the network '$($network.Name)' as Public (campus or public Wi-Fi?): it blocks the phone and may isolate devices."
        Write-Info 'Using the USB tunnel instead. Pass -Connection Lan to insist on Wi-Fi.'
        return 'Usb'
    }
    return 'Lan'
}

function Show-PublicNetworkAdvice([string]$Ip) {
    $network = Get-NetworkProfile $Ip
    if ($network -and $network.Category -eq 'Public') {
        Write-Warn "Windows classes '$($network.Name)' as Public, so it will block the phone."
        Write-Info "Only on a network you trust (admin PowerShell): Set-NetConnectionProfile -InterfaceAlias '$($network.Alias)' -NetworkCategory Private"
    }
}

# adb reverse lasts until the phone is unplugged or adb restarts, so it is re-asserted on every run.
function Set-UsbTunnels([string]$Adb, [string]$Serial) {
    foreach ($port in @($ApiPort, $MetroPort, $StoragePort)) {
        Invoke-Native "adb reverse tcp:$port" { & $Adb -s $Serial reverse "tcp:$port" "tcp:$port" }
    }
    Write-Ok "USB tunnel up: the phone's localhost:$ApiPort, $MetroPort and $StoragePort reach this PC."
}

function Ensure-Firewall {
    if (Get-NetFirewallRule -DisplayName 'TripTrackr dev*' -ErrorAction SilentlyContinue) {
        Write-Ok 'Windows Firewall already lets the phone in.'
        return
    }
    $ports = "$ApiPort,$MetroPort,$StoragePort"
    $command = "New-NetFirewallRule -DisplayName '$FirewallRuleName' -Direction Inbound -Protocol TCP -LocalPort $ports -Action Allow -Profile Private | Out-Null"
    Write-Warn "No Windows Firewall rule lets the phone reach this PC on TCP $ports."
    if ($Check) { return }
    if (-not (Confirm-Action "Add one now, for private networks only? (needs admin approval)" $false)) {
        Write-Info 'Skipped. If the phone cannot connect, run this in an admin PowerShell:'
        Write-Info "  $command"
        return
    }
    Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-Command', $command
    if (Get-NetFirewallRule -DisplayName 'TripTrackr dev*' -ErrorAction SilentlyContinue) { Write-Ok 'Firewall rule added.' }
    else { Write-Warn 'The rule was not added. Run the command above in an admin PowerShell.' }
}

# ---------------------------------------------------------------- docker and the backend

function Ensure-Docker {
    if (Test-Quiet { docker info }) { Write-Ok 'Docker is running.'; return $true }
    if ($Check) { Write-Warn 'Docker is not running (it would be started).'; return $false }
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $desktop)) {
        Stop-Script 'Docker is not running and Docker Desktop was not found. Start your Docker engine, then run this again.'
    }
    Write-Info 'Starting Docker Desktop (the first start can take a minute)...'
    Start-Process $desktop
    $deadline = (Get-Date).AddSeconds(240)
    while ((Get-Date) -lt $deadline) {
        if (Test-Quiet { docker info }) { Write-Ok 'Docker is running.'; return $true }
        Start-Sleep -Seconds 3
    }
    Stop-Script 'Docker did not become ready in 4 minutes. Open Docker Desktop, wait for "Running", then run this again.'
}

function Sync-EnvSetting([string]$Key, [string]$Value, [string]$Why) {
    $current = Get-EnvValue $EnvFile $Key
    if ($current -eq $Value) { Write-Ok "$Key already $Value"; return }
    if ($Check) { Write-Info "$Key would change: '$current' -> '$Value'"; return }
    [void](Set-EnvValue $EnvFile $Key $Value)
    Write-Ok "$Key=$Value ($Why)"
}

# StorageHost is where the phone finds the object store: the PC's LAN address, or localhost over USB.
function Start-Backend([string]$StorageHost) {
    if (-not (Test-Path $EnvFile)) {
        if ($Check) { Write-Warn '.env is missing (it would be copied from .env.example).'; return }
        Copy-Item (Join-Path $Root '.env.example') $EnvFile
        Write-Warn '.env did not exist, so .env.example was copied (stock development values).'
    }

    Sync-EnvSetting 'S3_PUBLIC_ENDPOINT' "http://${StorageHost}:$StoragePort" 'so the phone can upload photos and documents'

    # Against the local RustFS the region must be us-east-1 (infra/README.md); R2's "auto" breaks signing.
    if ((Get-EnvValue $EnvFile 'S3_ENDPOINT') -match '^https?://(localhost|127\.0\.0\.1|rustfs)([:/]|$)') {
        Sync-EnvSetting 'S3_REGION' 'us-east-1' 'RustFS needs it'
    }

    if ($Check) {
        $running = @(Get-NativeOutput { docker @Compose ps --services --status running } | Where-Object { $_ -match '^[a-z0-9-]+$' })
        Write-Info ("Running services: " + $(if ($running.Count -gt 0) { $running -join ', ' } else { 'none' }))
        return
    }

    $up = @('up', '-d')
    if (-not $NoApiBuild) { $up += '--build' }
    Write-Info 'docker compose up (the first build takes a few minutes)...'
    Invoke-Native 'docker compose up' { docker @Compose @up }

    Write-Info "Waiting for the API on http://localhost:$ApiPort/health ..."
    if (-not (Wait-Http "http://localhost:$ApiPort/health" 150 '')) {
        Write-Host ''
        Invoke-Native 'docker compose logs' { docker @Compose logs --tail 40 api }
        Stop-Script 'The API did not become healthy. The last log lines are above.'
    }
    Write-Ok 'API is up.'
}

function Get-CityCount {
    $user = Get-EnvValue $EnvFile 'POSTGRES_USER'
    $db = Get-EnvValue $EnvFile 'POSTGRES_DB'
    if (-not $user) { $user = 'triptrackr' }
    if (-not $db) { $db = 'triptrackr' }
    $lines = @(Get-NativeOutput { docker @Compose exec -T postgres psql -U $user -d $db -tAc 'SELECT count(*) FROM cities' })
    $count = 0
    if ($lines.Count -gt 0 -and [int]::TryParse($lines[-1].Trim(), [ref]$count)) { return $count }
    return -1
}

function Import-GeoCatalogue {
    $base = 'https://download.geonames.org/export/dump'
    $dir = Join-Path $Root 'data'
    $countries = Join-Path $dir 'countryInfo.txt'
    $cities = Join-Path $dir 'cities15000.txt'
    New-Item -ItemType Directory -Force $dir | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $progress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        if (-not (Test-Path $countries)) {
            Write-Info 'Downloading countryInfo.txt (GeoNames, CC BY 4.0)...'
            Invoke-WebRequest -Uri "$base/countryInfo.txt" -OutFile $countries -UseBasicParsing
        }
        if (-not (Test-Path $cities)) {
            $zip = Join-Path $dir 'cities15000.zip'
            Write-Info 'Downloading cities15000.zip (GeoNames, CC BY 4.0)...'
            Invoke-WebRequest -Uri "$base/cities15000.zip" -OutFile $zip -UseBasicParsing
            Expand-Archive -Path $zip -DestinationPath $dir -Force
            Remove-Item $zip
        }
    }
    finally { $ProgressPreference = $progress }

    Write-Info 'Importing (about a minute)...'
    Invoke-Native 'geo import' { npm run geo:import -w apps/api -- --countries $countries --cities $cities }
    Write-Ok 'City catalogue loaded.'
}

function Ensure-GeoCatalogue {
    $count = Get-CityCount
    if ($count -gt 0) { Write-Ok "City catalogue loaded ($count cities)."; return }
    if ($count -lt 0) {
        Write-Warn 'Could not read the city catalogue (the database is not reachable yet).'
        if ($Check) { return }
    }
    else {
        Write-Warn 'The city catalogue is empty, so the city picker has nothing to offer and stops cannot be added.'
        if ($Check) { return }
    }
    if ($ImportGeo -or (Confirm-Action 'Download the free GeoNames extracts (about 10 MB) and import them now?' $true)) {
        Import-GeoCatalogue
    }
    else { Write-Info 'Skipped. Re-run with -ImportGeo whenever you want it.' }
}

# ---------------------------------------------------------------- android

function Find-Adb {
    $found = Get-Command adb -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    foreach ($sdk in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
        if ($sdk) {
            $candidate = Join-Path $sdk 'platform-tools\adb.exe'
            if (Test-Path $candidate) { return $candidate }
        }
    }
    return $null
}

function Initialize-AndroidEnvironment([string]$Adb) {
    if (-not $env:ANDROID_HOME) {
        $sdk = Split-Path -Parent (Split-Path -Parent $Adb)
        if (Test-Path (Join-Path $sdk 'platform-tools')) { $env:ANDROID_HOME = $sdk }
    }
}

# Expo's docs call for JDK 17 on Windows. A newer JDK breaks the Android build: with JDK 26, Gradle's
# jlink step fails on android-36 ("JdkImageTransform"). A user-level JAVA_HOME pointing at one
# silently wins over a machine-level JDK 17, so the build picks its own JDK for this run only.
function Get-JdkMajor([string]$Dir) {
    $release = Join-Path $Dir 'release'
    if (-not (Test-Path (Join-Path $Dir 'bin\javac.exe')) -or -not (Test-Path $release)) { return 0 }
    $match = [regex]::Match([IO.File]::ReadAllText($release), '(?m)^JAVA_VERSION="(?:1\.)?(\d+)')
    if ($match.Success) { return [int]$match.Groups[1].Value }
    return 0
}

function Find-BuildJdk {
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($scope in 'Process', 'User', 'Machine') {
        $value = [Environment]::GetEnvironmentVariable('JAVA_HOME', $scope)
        if ($value) { $candidates.Add($value.TrimEnd('\')) }
    }
    foreach ($vendor in 'Java', 'Microsoft', 'Eclipse Adoptium', 'Zulu', 'Amazon Corretto', 'Android\Android Studio') {
        $base = Join-Path $env:ProgramFiles $vendor
        if (Test-Path $base) {
            foreach ($dir in (Get-ChildItem $base -Directory -ErrorAction SilentlyContinue)) { $candidates.Add($dir.FullName) }
            $candidates.Add((Join-Path $base 'jbr'))
        }
    }
    $found = foreach ($dir in ($candidates | Select-Object -Unique)) {
        $major = Get-JdkMajor $dir
        if ($major -gt 0) { [pscustomobject]@{ Path = $dir; Major = $major } }
    }
    foreach ($wanted in 17, 21) {
        $pick = @($found | Where-Object { $_.Major -eq $wanted }) | Select-Object -First 1
        if ($pick) { return $pick }
    }
    return $null
}

function Get-Devices([string]$Adb) {
    foreach ($row in (Get-NativeOutput { & $Adb devices -l })) {
        if ($row -match '^(\S+)\s+(device|unauthorized|offline)\b(.*)$') {
            $serial = $Matches[1]
            $state = $Matches[2]
            $model = if ($Matches[3] -match 'model:(\S+)') { $Matches[1] } else { '' }
            [pscustomobject]@{ Serial = $serial; State = $state; Model = $model }
        }
    }
}

# Expo CLI's --device takes a NAME, not an adb serial (its docs say "name or ID"; the code compares
# names only): the `model:` token of `adb devices -l` for a phone, the AVD name for an emulator.
function Get-ExpoDeviceName([string]$Adb, [string]$Serial) {
    $attached = @(Get-Devices $Adb | Where-Object { $_.State -eq 'device' })
    $mine = @($attached | Where-Object { $_.Serial -eq $Serial })
    if ($mine.Count -eq 0) { Stop-Script "Device $Serial is no longer attached." }
    $name = $mine[0].Model
    if ($Serial -like 'emulator-*') {
        $avd = @(Get-NativeOutput { & $Adb -s $Serial emu avd name } | Where-Object { $_ -notmatch '^OK$' })
        $name = if ($avd.Count -gt 0) { $avd[0].Trim() } else { '' }
    }
    if (-not $name) { Stop-Script "Could not work out the name Expo CLI uses for device $Serial (adb devices -l shows no model)." }
    $same = @($attached | Where-Object { $_.Serial -ne $Serial -and $_.Model -eq $name })
    if ($same.Count -gt 0) {
        Stop-Script "Two attached devices are both called '$name' and Expo CLI can only pick one by name. Unplug the other one ($($same[0].Serial))."
    }
    return $name
}

function Select-Device([string]$Adb) {
    Get-NativeOutput { & $Adb start-server } | Out-Null
    $deadline = (Get-Date).AddSeconds($(if ($Check) { 0 } else { 90 }))
    $told = $false
    while ($true) {
        $all = @(Get-Devices $Adb)
        $ready = @($all | Where-Object { $_.State -eq 'device' })
        if ($Device) { $ready = @($ready | Where-Object { $_.Serial -eq $Device }) }
        if ($ready.Count -gt 0) {
            $physical = @($ready | Where-Object { $_.Serial -notlike 'emulator-*' })
            if ($physical.Count -gt 0) { return $physical[0].Serial }
            return $ready[0].Serial
        }
        if ((Get-Date) -ge $deadline) { break }
        if (-not $told) {
            $told = $true
            if (@($all | Where-Object { $_.State -eq 'unauthorized' }).Count -gt 0) {
                Write-Warn 'The phone is asking to allow USB debugging: unlock it and tap Allow.'
            }
            else {
                Write-Warn 'No phone found. Plug it in over USB and turn on Developer options > USB debugging. Waiting up to 90 seconds...'
            }
        }
        Start-Sleep -Seconds 3
    }
    if ($Check) { Write-Warn 'No authorised phone attached.'; return $null }
    Stop-Script 'No authorised phone found. Plug it in, enable USB debugging, accept the prompt, and run this again (or pass -Device <serial>).'
}

function Test-AppInstalled([string]$Adb, [string]$Serial) {
    $lines = @(Get-NativeOutput { & $Adb -s $Serial shell pm list packages $AppId })
    return [bool](@($lines | Where-Object { $_ -match ('^package:' + [regex]::Escape($AppId) + '\s*$') }).Count)
}

# What decides whether the installed binary is stale: the app's native dependencies and config.
function Get-NativeStamp([string]$Serial) {
    $hashes = foreach ($name in 'package.json', 'app.config.ts') {
        (Get-FileHash -Algorithm SHA256 -Path (Join-Path $MobileDir $name)).Hash
    }
    return "$Serial|" + ($hashes -join '|')
}

function Install-DevClient([string]$Adb, [string]$Serial) {
    $stamp = Get-NativeStamp $Serial
    $recorded = if (Test-Path $StampFile) { ([IO.File]::ReadAllText($StampFile)).Trim() } else { '' }
    $reason = $null
    if ($RebuildApp) { $reason = 'forced by -RebuildApp' }
    elseif (-not (Test-AppInstalled $Adb $Serial)) { $reason = 'it is not installed on the phone' }
    elseif ($recorded -ne $stamp) { $reason = 'it was built before the app''s native dependencies or config last changed' }

    if (-not $reason) { Write-Ok 'The development client on the phone is up to date.'; return }
    if ($Check) {
        Write-Info "Would build and install the development client: $reason."
        Write-Info "Expo CLI would target the device named '$(Get-ExpoDeviceName $Adb $Serial)'."
        return
    }
    if (-not $BuildJdk) {
        Stop-Script 'Building the Android app needs JDK 17 (newer ones break the build). Install it, then run this again:  winget install Microsoft.OpenJDK.17   (or: choco install -y microsoft-openjdk17)'
    }

    Write-Info "Building and installing the development client: $reason."
    Write-Info 'The first build takes 10-20 minutes; later ones are much faster.'
    $env:APP_VARIANT = 'development'
    $expoName = Get-ExpoDeviceName $Adb $Serial
    Write-Info "Expo CLI will target the device named '$expoName'."
    Push-Location $MobileDir
    try { Invoke-Native 'expo run:android' { npx expo run:android --device $expoName --no-bundler } }
    finally { Pop-Location }

    New-Item -ItemType Directory -Force (Split-Path -Parent $StampFile) | Out-Null
    [IO.File]::WriteAllText($StampFile, $stamp, $Utf8NoBom)
    Write-Ok 'Development client installed.'
}

# Best effort: toybox nc is present on most phones but not all.
function Test-PhoneReachesApi([string]$Adb, [string]$Serial, [string]$PcHost, [string]$Mode) {
    $lines = @(Get-NativeOutput { & $Adb -s $Serial shell "toybox nc -w 3 $PcHost $ApiPort < /dev/null; echo rc=`$?" })
    $text = $lines -join ' '
    if ($text -match 'rc=0') { Write-Ok "The phone can reach http://${PcHost}:$ApiPort."; return }
    if ($text -match 'rc=(\d+)' -and $Matches[1] -ne '127') {
        Write-Warn "Could not confirm the phone can reach http://${PcHost}:$ApiPort."
        if ($Mode -eq 'Usb') { Write-Info 'Is the API up (docker compose ps)? The tunnel itself was created above.' }
        else { Write-Info 'Check the phone is on the same Wi-Fi as this PC, that the network allows device-to-device traffic, and that the firewall rule exists. Or use -Connection Usb.' }
        return
    }
    Write-Info 'Skipped the phone reachability check (this phone has no nc).'
}

# PcHost is how the phone addresses Metro: the PC's LAN address, or localhost through the USB tunnel.
function Start-Metro([string]$Adb, [string]$Serial, [string]$PcHost, [string]$Mode, [bool]$ClearCache) {
    $probeHost = if ($Mode -eq 'Usb') { '127.0.0.1' } else { 'localhost' }
    $statusUrl = "http://${probeHost}:$MetroPort/status"
    if (Test-Http $statusUrl 'packager-status:running') {
        Write-Ok 'Metro is already running; opening the app on the phone.'
        if ($ClearCache) { Write-Warn 'The API address changed: close the Metro window and run this again so it restarts with a clean cache.' }
        $url = [Uri]::EscapeDataString("http://${PcHost}:$MetroPort")
        Get-NativeOutput { & $Adb -s $Serial shell am start -a android.intent.action.VIEW -d "'${DevClientScheme}://expo-development-client/?url=$url'" } | Out-Null
        return
    }
    if (($Mode -eq 'Usb') -and (Test-Http "http://localhost:$MetroPort/status" 'packager-status:running')) {
        $owner = Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        $which = if ($owner) { " (process $($owner.OwningProcess))" } else { '' }
        Stop-Script "A Metro$which is already running on port $MetroPort but only on IPv6; the USB tunnel reaches 127.0.0.1 and would be dropped. Close it (its terminal window), then run this again."
    }

    $env:APP_VARIANT = 'development'
    $flags = '--dev-client --android'
    if ($Mode -eq 'Usb') {
        Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
        $env:NODE_OPTIONS = ("$env:NODE_OPTIONS --dns-result-order=ipv4first").Trim()
        $flags += ' --localhost'
    }
    else { $env:REACT_NATIVE_PACKAGER_HOSTNAME = $PcHost }
    if ($ClearCache) { $flags += ' --clear' }
    Write-Info 'Starting Metro in its own window (close that window to stop it)...'
    Start-Process powershell.exe -WorkingDirectory $Root -ArgumentList '-NoExit', '-NoProfile', '-Command', "`$Host.UI.RawUI.WindowTitle = 'TripTrackr - Metro'; npm run start -w apps/mobile -- $flags"
    if (Wait-Http $statusUrl 150 'packager-status:running') { Write-Ok 'Metro is up; the app is opening on the phone.' }
    else { Write-Warn 'Metro did not report ready in time. Check its window.' }
}

# ---------------------------------------------------------------- main

if ($Stop) {
    Write-Step 'Stopping the Docker stack (data is kept)'
    Invoke-Native 'docker compose down' { docker @Compose down }
    Write-Ok 'Stopped. Close the Metro window yourself if it is open.'
    exit 0
}

Write-Host 'TripTrackr - run on an Android phone' -ForegroundColor White
if ($Check) { Write-Host '(check only: nothing will be changed)' -ForegroundColor DarkGray }

Write-Step 'Tools'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-Script 'Node.js was not found. Install Node 22 (see .nvmrc).' }
Write-Ok ("node " + (node --version))
$BuildJdk = Find-BuildJdk
if ($BuildJdk) {
    $previousJavaHome = $env:JAVA_HOME
    $env:JAVA_HOME = $BuildJdk.Path
    $env:PATH = (Join-Path $BuildJdk.Path 'bin') + ';' + $env:PATH
    Write-Ok "JDK $($BuildJdk.Major) for the Android build: $($BuildJdk.Path)"
    if ($previousJavaHome -and ($previousJavaHome.TrimEnd('\') -ne $BuildJdk.Path.TrimEnd('\'))) {
        Write-Info "(Your JAVA_HOME is $previousJavaHome; that JDK breaks the Android build, so this run uses the one above. Nothing permanent is changed.)"
    }
}
else { Write-Warn 'No JDK 17 found. It is needed to build the Android app:  winget install Microsoft.OpenJDK.17' }
if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
    if ($Check) { Write-Warn 'node_modules is missing (npm ci would run).' }
    else { Write-Info 'Installing dependencies (npm ci)...'; Invoke-Native 'npm ci' { npm ci } }
}

Write-Step 'Network'
if ($HostIp) {
    if ($HostIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Stop-Script "-HostIp '$HostIp' is not an IPv4 address." }
    $ip = $HostIp
}
else { $ip = Get-LanIp }
if ($ip) { Write-Ok "This PC's LAN address: $ip" }
$mode = Resolve-Connection $ip
if ($mode -eq 'Lan') {
    if (-not $ip) { Stop-Script 'Could not work out this PC''s LAN address. Pass it with -HostIp 192.168.x.y, or use -Connection Usb.' }
    Write-Ok 'Connection: Wi-Fi (the phone must be on the same network as this PC).'
    if ($ip -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') {
        Write-Warn 'That does not look like a home/office LAN address (a VPN?). Pass the Wi-Fi address with -HostIp if the phone cannot connect.'
    }
    Show-PublicNetworkAdvice $ip
    Ensure-Firewall
    $pcHost = $ip
}
else {
    Write-Ok 'Connection: USB tunnel (adb reverse). No firewall change is needed.'
    $pcHost = 'localhost'
}

if (-not $SkipBackend) {
    Write-Step 'Backend (Docker)'
    $dockerUp = Ensure-Docker
    if ($dockerUp) {
        Start-Backend $pcHost
        Ensure-GeoCatalogue
    }
}

if ($BackendOnly) {
    Write-Host ''
    Write-Ok "Backend ready at http://localhost:$ApiPort. Run again without -BackendOnly to open the app."
    exit 0
}

Write-Step 'App configuration'
if (-not (Test-Path $MobileEnvFile)) {
    if ($Check) { Write-Warn 'apps/mobile/.env.local is missing (it would be created).' }
    else { Set-Content -Path $MobileEnvFile -Value '' -Encoding ASCII }
}
$apiUrl = "http://${pcHost}:$ApiPort"
$apiUrlChanged = $false
if ((Get-EnvValue $MobileEnvFile 'EXPO_PUBLIC_API_URL') -ne $apiUrl) {
    if ($Check) { Write-Info "EXPO_PUBLIC_API_URL would become $apiUrl" }
    else { $apiUrlChanged = Set-EnvValue $MobileEnvFile 'EXPO_PUBLIC_API_URL' $apiUrl; Write-Ok "EXPO_PUBLIC_API_URL=$apiUrl" }
}
else { Write-Ok "EXPO_PUBLIC_API_URL already $apiUrl" }
if (-not (Get-EnvValue $MobileEnvFile 'EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN')) {
    Write-Warn 'EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN is not set in apps/mobile/.env.local: the globe will not render.'
}

Write-Step 'Phone'
$adb = Find-Adb
if (-not $adb) { Stop-Script 'adb was not found. Install Android Studio (SDK platform-tools) or set ANDROID_HOME.' }
Initialize-AndroidEnvironment $adb
$serial = Select-Device $adb
if ($serial) {
    Write-Ok "Using device $serial"
    Install-DevClient $adb $serial
    if ($mode -eq 'Usb') {
        if ($Check) { Write-Info 'Would create the USB tunnel (adb reverse) for the API, Metro and the object store.' }
        else { Set-UsbTunnels $adb $serial }
    }
    if (-not $Check) { Test-PhoneReachesApi $adb $serial $pcHost $mode }
}
elseif (-not $Check) { Stop-Script 'No phone selected.' }

if ($Check) {
    Write-Host ''
    Write-Ok 'Check finished. Nothing was changed.'
    exit 0
}

Write-Step 'Launching'
Start-Metro $adb $serial $pcHost $mode $apiUrlChanged

Write-Host ''
Write-Host 'Done. TripTrackr (Dev) should be opening on your phone.' -ForegroundColor Green
Write-Info 'Sign-up emails are not sent in development: read the verification link in `npm run infra:logs`.'
if ($mode -eq 'Usb') {
    Write-Info 'Keep the phone plugged in. To try offline mode: adb reverse --remove-all   (back online: run this script again).'
    Write-Info 'Airplane mode alone does not cut the USB tunnel.'
}
Write-Info 'Metro runs in its own window. Stop everything with: run-on-phone.cmd -Stop'
