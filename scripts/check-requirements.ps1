# HataCRM - check required programs
# Run: powershell -File scripts\check-requirements.ps1

$ErrorActionPreference = "SilentlyContinue"
$ok = 0
$fail = 0

$root = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $root ".env"
$nodeModules = Join-Path $root "node_modules"

Write-Host ""
Write-Host "=== HataCRM: environment check ===" -ForegroundColor Cyan

# Node.js
$nodeVer = node -v 2>$null
if ($LASTEXITCODE -eq 0 -and $nodeVer) {
    Write-Host "  [OK] Node.js: $nodeVer" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  [ ] Node.js not found. Install: https://nodejs.org/" -ForegroundColor Yellow
    $fail++
}

# npm
$npmVer = npm -v 2>$null
if ($LASTEXITCODE -eq 0 -and $npmVer) {
    Write-Host "  [OK] npm: $npmVer" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  [ ] npm not found" -ForegroundColor Yellow
    $fail++
}

# Git
$gitVer = git --version 2>$null
if ($LASTEXITCODE -eq 0 -and $gitVer) {
    Write-Host "  [OK] Git: $($gitVer.Trim())" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  [ ] Git not found (optional)" -ForegroundColor Gray
}

# SSH
$sshOut = ssh -V 2>&1
if ($sshOut -match "OpenSSH") {
    Write-Host "  [OK] SSH (for deploy)" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  [ ] SSH not found (needed for deploy.ps1)" -ForegroundColor Gray
}

# .env
if (Test-Path $envPath) {
    Write-Host "  [OK] .env exists" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  [ ] .env missing. Add PORT, DATABASE_URL" -ForegroundColor Yellow
    $fail++
}

# node_modules
if (Test-Path $nodeModules) {
    Write-Host "  [OK] node_modules installed" -ForegroundColor Green
    $ok++
} else {
    Write-Host "  [ ] Run: npm install" -ForegroundColor Yellow
    $fail++
}

# DB connection (via separate script to avoid PowerShell escaping)
if (Test-Path $envPath) {
    Write-Host "  Checking DB..." -ForegroundColor Cyan
    Push-Location $root
    & node (Join-Path $PSScriptRoot "check-db.js") 2>$null
    $dbOk = ($LASTEXITCODE -eq 0)
    Pop-Location
    if ($dbOk) {
        Write-Host "  [OK] PostgreSQL reachable" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "  [ ] PostgreSQL not reachable (check DATABASE_URL or start DB)" -ForegroundColor Yellow
        $fail++
    }
}

Write-Host ""
Write-Host "--- Summary ---" -ForegroundColor Cyan
Write-Host "  OK: $ok" -ForegroundColor Green
if ($fail -gt 0) { Write-Host "  To fix: $fail" -ForegroundColor Yellow }
Write-Host ""
