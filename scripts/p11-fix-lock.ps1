# p11-fix-lock.ps1 - P11 fix: the GitHub build failed at "npm ci" with
#   Missing: @emnapi/core@2.0.0-beta.2 from lock file
#   Missing: @emnapi/runtime@2.0.0-beta.2 from lock file
# The npm on the GitHub runner checks the lock file more strictly than the local npm. This script adds the two packages
# to package.json devDependencies as EXACT versions and writes them into package-lock.json (lock only, node_modules is
# not touched), checks the result and commits package.json + package-lock.json. Then run .\run.cmd p11-push.ps1.
# Run (from the project folder):  .\run.cmd p11-fix-lock.ps1
# It writes its own short summary to logs\p11-fix-lock.txt (native git / npm output is not kept in logs\last-run.txt).
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads a file without a BOM as ANSI).

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

$lockPath = Join-Path $root 'package-lock.json'
$pkgPath  = Join-Path $root 'package.json'
$logDir   = Join-Path $root 'logs'
$sumPath  = Join-Path $logDir 'p11-fix-lock.txt'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Content -LiteralPath $sumPath -Value ('p11-fix-lock ' + (Get-Date -Format s))

function Say([string]$text, [string]$color = 'White') {
  Write-Host $text -ForegroundColor $color
  Add-Content -LiteralPath $sumPath -Value $text
}

function Stop-Here([string]$why) {
  Say ('STOP: ' + $why) 'Red'
  exit 1
}

function Lock-Has([string]$name) {
  # True when package-lock.json has an entry for this package at version 2.0.0-beta.2 (top level or nested).
  $text = [System.IO.File]::ReadAllText($lockPath)
  $pattern = '"node_modules/(?:[^"]*/)?' + [regex]::Escape($name) + '": \{\s*"version": "2\.0\.0-beta\.2"'
  return ($text -match $pattern)
}

$wanted = @('@emnapi/core', '@emnapi/runtime')

Say '=== p11-fix-lock: add the emnapi packages to package-lock.json ===' 'Cyan'

Say 'Step 1: node and npm'
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-Here 'npm was not found.' }
$nodeV = (& node --version | Out-String).Trim()
$npmV  = (& npm --version | Out-String).Trim()
Say ('  node ' + $nodeV + ', npm ' + $npmV)

Say 'Step 2: files and backup'
if (-not (Test-Path -LiteralPath $lockPath)) { Stop-Here 'package-lock.json is missing.' }
if (-not (Test-Path -LiteralPath $pkgPath))  { Stop-Here 'package.json is missing.' }
Copy-Item -LiteralPath $lockPath -Destination (Join-Path $logDir 'package-lock.before-fix.json') -Force
Copy-Item -LiteralPath $pkgPath  -Destination (Join-Path $logDir 'package.before-fix.json') -Force
Say '  backups: logs\package-lock.before-fix.json and logs\package.before-fix.json'
$pkgBefore = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json

Say 'Step 3: are the two entries already in the lock?'
foreach ($w in $wanted) {
  $state = 'MISSING'
  if (Lock-Has $w) { $state = 'present' }
  Say ('  ' + $w + ' 2.0.0-beta.2: ' + $state)
}
$missing = @($wanted | Where-Object { -not (Lock-Has $_) })
if ($missing.Count -eq 0) {
  Stop-Here 'Both entries are already in the lock, so the problem is something else. Show Claude the NEW "Missing:" lines of the GitHub log.'
}

Say 'Step 4: npm install --package-lock-only (adds the two packages as exact devDependencies)'
$out = & npm install --package-lock-only --save-dev --save-exact --ignore-scripts --no-audit --no-fund '@emnapi/core@2.0.0-beta.2' '@emnapi/runtime@2.0.0-beta.2' 2>&1 | ForEach-Object { '' + $_ }
$npmCode = $LASTEXITCODE
$out | Select-Object -Last 15 | ForEach-Object { Say ('  npm: ' + $_) }
if ($npmCode -ne 0) {
  Stop-Here ('npm install failed (exit ' + $npmCode + '). The old files are in logs\ (package-lock.before-fix.json, package.before-fix.json); restore them if package.json was changed.')
}

Say 'Step 5: check the result'
foreach ($w in $wanted) {
  if (-not (Lock-Has $w)) { Stop-Here ($w + ' is still not in package-lock.json. Restore the backups from logs\ and tell Claude.') }
  Say ('  lock has ' + $w + ' 2.0.0-beta.2') 'Green'
}
try {
  $pkgAfter = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
} catch {
  Stop-Here 'package.json is not valid JSON after npm install. Restore the backups from logs\.'
}
$runtimeBefore = ($pkgBefore.dependencies | ConvertTo-Json -Compress)
$runtimeAfter  = ($pkgAfter.dependencies | ConvertTo-Json -Compress)
if ($runtimeBefore -ne $runtimeAfter) { Stop-Here 'The runtime dependencies changed. That must not happen. Restore the backups from logs\.' }
Say '  runtime dependencies: unchanged' 'Green'
$devBefore = @($pkgBefore.devDependencies.PSObject.Properties.Name)
$devAfter  = @($pkgAfter.devDependencies.PSObject.Properties.Name)
$added   = @($devAfter | Where-Object { $devBefore -notcontains $_ })
$removed = @($devBefore | Where-Object { $devAfter -notcontains $_ })
Say ('  devDependencies added: ' + ($added -join ', '))
if ($removed.Count -gt 0 -or $added.Count -ne 2) {
  Stop-Here 'devDependencies changed in an unexpected way (expected exactly the two emnapi packages added). Restore the backups from logs\.'
}

Say 'Step 6: commit package.json + package-lock.json'
if (-not (git config user.name))  { git config user.name  'My Native Preparation owner'; Say '  set local git user.name (placeholder)' }
if (-not (git config user.email)) { git config user.email 'owner@users.noreply.invalid';  Say '  set local git user.email (placeholder)' }
git add package.json package-lock.json
git commit -m 'P11: fix package-lock.json for npm ci on Linux (emnapi)' -- package.json package-lock.json
if ($LASTEXITCODE -ne 0) { Stop-Here 'git commit failed (or nothing to commit).' }
$head = (git rev-parse HEAD | Out-String).Trim()
Say ('  committed: ' + $head) 'Green'
$left = @(git status --porcelain | Where-Object { $_ -notmatch '^\s*\S+\s+NEXT\.md$' })
if ($left.Count -gt 0) {
  Say '  other changes still not committed (the push script will refuse until they are committed):' 'Yellow'
  $left | ForEach-Object { Say ('    ' + $_) }
} else {
  Say '  work tree is clean (NEXT.md may stay modified)' 'Green'
}

Say ''
Say 'Next: .\run.cmd p11-push.ps1 (pushes this fix; GitHub then starts a new run by itself).' 'Green'
Say 'done'
exit 0
