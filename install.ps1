$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 20+ is required."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is required."
}

$NodeMajor = [int](& node -p "Number(process.versions.node.split('.')[0])")
if ($NodeMajor -lt 20) {
    throw "Node.js 20+ is required. Found: $(& node --version)"
}

Write-Host "[1/4] Installing dependencies..."
& npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

Write-Host "[2/4] Installing Playwright Chromium..."
& npx playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Playwright Chromium install failed." }

Write-Host "[3/4] Building..."
& npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

Write-Host "[4/4] Installing command..."
& npm install --global $Root
if ($LASTEXITCODE -ne 0) {
    $Prefix = if ($env:AGENT_WEBUI_RELAY_PREFIX) {
        $env:AGENT_WEBUI_RELAY_PREFIX
    } else {
        Join-Path $env:LOCALAPPDATA "agent-webui-relay\npm"
    }

    Write-Warning "Default global npm location was not writable. Installing under $Prefix instead."
    & npm install --global --prefix $Prefix $Root
    if ($LASTEXITCODE -ne 0) { throw "User-scoped global install failed." }

    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $Entries = @($UserPath -split ';' | Where-Object { $_ })
    if ($Entries -notcontains $Prefix) {
        $NewPath = if ($UserPath) { "$UserPath;$Prefix" } else { $Prefix }
        [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
        Write-Host "Added $Prefix to the user PATH. New terminals will see the command."
    }
    if (($env:Path -split ';') -notcontains $Prefix) {
        $env:Path = "$env:Path;$Prefix"
    }
}

Write-Host ""
Write-Host "Installed agent-webui-relay (alias: awr)."
Write-Host "Next: agent-webui-relay login"
