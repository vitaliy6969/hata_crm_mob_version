# Deploy public/ to server. Credentials from .env (DEPLOY_SSH_*, DEPLOY_PATH)
$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' -and $_ -notmatch '^\s*#') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
}

$user = $env:DEPLOY_SSH_USER
$deployHost = $env:DEPLOY_SSH_HOST
$path = $env:DEPLOY_PATH
if (-not $user -or -not $deployHost -or -not $path) {
    Write-Host "In .env set: DEPLOY_SSH_USER, DEPLOY_SSH_HOST, DEPLOY_PATH" -ForegroundColor Yellow
    exit 1
}
$dest = "${user}@${deployHost}:${path}"
$local = Join-Path $PSScriptRoot "public"
Write-Host "Deploying $local -> $dest ..." -ForegroundColor Cyan
Write-Host "(Password will be prompted by ssh/scp)" -ForegroundColor Gray
scp -r "$local\*" $dest
if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed." -ForegroundColor Red; exit 1 }

# Backend: викласти src (index.js + update_schema.sql) у батьківську папку від public
$pathBackend = $path -replace '/public\s*$',''
if ($pathBackend -eq $path) { $pathBackend = $path.TrimEnd('/') -replace '/[^/]+$','' }
$destBackend = "${user}@${deployHost}:${pathBackend}/src"
Write-Host "Deploying backend src -> $pathBackend/src ..." -ForegroundColor Cyan
scp "$PSScriptRoot\src\index.js" "$PSScriptRoot\src\update_schema.sql" "$PSScriptRoot\src\run_migration.js" "$PSScriptRoot\src\db.js" "$PSScriptRoot\src\analytics-refresh.js" $destBackend
if ($LASTEXITCODE -ne 0) { Write-Host "Backend deploy failed (frontend was uploaded)." -ForegroundColor Yellow; exit 1 }

Write-Host "Deploying scripts (refresh-analytics) ..." -ForegroundColor Cyan
$destScripts = "${user}@${deployHost}:${pathBackend}/scripts"
ssh "${user}@${deployHost}" "mkdir -p $pathBackend/scripts"
scp "$PSScriptRoot\scripts\refresh-analytics.js" $destScripts
Write-Host "Running migration and pm2 restart on server (password may be asked again)..." -ForegroundColor Cyan
ssh "${user}@${deployHost}" "cd $pathBackend && node src/run_migration.js && pm2 restart hata-crm"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Site updated and backend restarted." -ForegroundColor Green
} else {
    Write-Host "SSH step failed. On server run: node src/run_migration.js && pm2 restart hata-crm" -ForegroundColor Yellow
}
