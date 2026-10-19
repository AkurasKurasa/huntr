# Sets up the Supabase keep-awake bot in one go.
# Run from the huntr folder in PowerShell:   .\setup-keepalive.ps1
# (If Windows blocks it: powershell -ExecutionPolicy Bypass -File .\setup-keepalive.ps1)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Read-EnvValue($file, $key) {
  if (-not (Test-Path $file)) { return $null }
  $line = Get-Content $file | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

Write-Host "`n== Huntr keep-awake setup ==`n" -ForegroundColor Magenta

# 1. Put the GitHub workflows where GitHub looks for them
if (Test-Path 'deploy\github-workflows') {
  New-Item -ItemType Directory -Force -Path '.github\workflows' | Out-Null
  Copy-Item 'deploy\github-workflows\*.yml' '.github\workflows\' -Force
  Write-Host "[1/4] Workflows copied to .github\workflows" -ForegroundColor Green
} else {
  Write-Host "[1/4] deploy\github-workflows not found - skipping (workflows may already be in place)" -ForegroundColor Yellow
}

# 2. Make sure the server has its packages and settings
if (-not (Test-Path 'server\.env')) {
  Write-Host "server\.env is missing. Copy server\.env.example to server\.env and fill in your Supabase keys, then run this again." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path 'server\node_modules')) {
  Write-Host "Installing server packages..."
  npm install --prefix server --no-audit --no-fund | Out-Null
}

# 3. Create the bot account and test it
Write-Host "[2/4] Creating the bot account in Supabase..."
$raw = (npm run --silent bot --prefix server -- --json) | Select-Object -Last 1
$bot = $raw | ConvertFrom-Json
if (-not $bot.ok) {
  Write-Host "Could not create the bot: $($bot.error)" -ForegroundColor Red
  exit 1
}
Write-Host "[2/4] Bot ready: $($bot.email) (test sign-in worked)" -ForegroundColor Green

$supabaseUrl = Read-EnvValue 'server\.env' 'SUPABASE_URL'
$anonKey     = Read-EnvValue 'server\.env' 'SUPABASE_ANON_KEY'

# 4. Push secrets/variables to GitHub if the GitHub CLI is available
$gh = Get-Command gh -ErrorAction SilentlyContinue
$ghReady = $false
if ($gh) {
  gh auth status 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    gh repo view 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ghReady = $true }
  }
}

if ($ghReady) {
  Write-Host "[3/4] Saving secrets and variables to your GitHub repo..."
  $bot.email    | gh secret set HUNTR_BOT_EMAIL
  $bot.password | gh secret set HUNTR_BOT_PASSWORD
  gh variable set VITE_SUPABASE_URL --body $supabaseUrl
  gh variable set VITE_SUPABASE_ANON_KEY --body $anonKey
  Write-Host "[3/4] Saved." -ForegroundColor Green
  Write-Host "[4/4] Commit and push .github\workflows, then run it once:" -ForegroundColor Cyan
  Write-Host "      git add .github; git commit -m 'Add keep-awake workflow'; git push"
  Write-Host "      gh workflow run keep-supabase-awake.yml"
} else {
  Write-Host "[3/4] GitHub CLI not set up here, so add these by hand:" -ForegroundColor Yellow
  Write-Host "      Repo -> Settings -> Secrets and variables -> Actions"
  Write-Host ""
  Write-Host "      SECRETS"
  Write-Host "        HUNTR_BOT_EMAIL        $($bot.email)"
  Write-Host "        HUNTR_BOT_PASSWORD     $($bot.password)"
  Write-Host "      VARIABLES"
  Write-Host "        VITE_SUPABASE_URL      $supabaseUrl"
  Write-Host "        VITE_SUPABASE_ANON_KEY $anonKey"
  Write-Host ""
  Write-Host "[4/4] Push the repo (including .github\workflows), then Actions -> Keep Supabase awake -> Run workflow." -ForegroundColor Cyan
}
Write-Host "`nDone. The job will sign in as the bot every 3 days.`n" -ForegroundColor Magenta
