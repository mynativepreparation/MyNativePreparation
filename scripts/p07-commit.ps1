# p07-commit.ps1 - phase P07 cleanup check + git commit.
# Run:  .\run.cmd p07-commit.ps1
# Run `.\run.cmd build.ps1` first (it runs the checks, builds, prints the JS size against the 250 KB budget, and keeps exactly one folder in builds\).

$ErrorActionPreference = 'Continue'

# 1. Make sure no secret/junk file types would be committed.
$required = @('node_modules', 'dist', 'builds', '.env', '*.keystore', '*.jks', '*.pem')
$ignore = Get-Content .gitignore
foreach ($r in $required) {
  if ($ignore -notcontains $r) { Write-Host ("WARNING: .gitignore is missing: " + $r) -ForegroundColor Yellow }
}

# 2. Junk: placeholder .gitkeep files in folders that now have real files.
foreach ($keep in Get-ChildItem -Path src, public -Recurse -Force -Filter .gitkeep -File) {
  $others = @(Get-ChildItem -Path $keep.DirectoryName -Force | Where-Object { $_.Name -ne '.gitkeep' })
  if ($others.Count -gt 0) {
    Remove-Item -LiteralPath $keep.FullName -Force
    Write-Host ("Removed unneeded placeholder: " + $keep.FullName)
  }
}

# 3. Junk: debug logs (console.log / debugger) in source must not exist.
$junk = Get-ChildItem -Path src -Recurse -Include *.ts, *.tsx |
  Select-String -Pattern 'console\.log|debugger' -SimpleMatch:$false
if ($junk) {
  Write-Host ">>> Debug leftovers found:" -ForegroundColor Yellow
  $junk | ForEach-Object { Write-Host ("  " + $_.Path + ":" + $_.LineNumber + "  " + $_.Line.Trim()) }
} else {
  Write-Host "No console.log / debugger in src. OK" -ForegroundColor Green
}

# 4. P07 (DECISIONS Q18): no new runtime dependency. The game has its own sound and confetti; package.json must list
#    the same runtime dependencies as the last commit.
$added = @()
try {
  $before = @(((git show HEAD:package.json) -join "`n" | ConvertFrom-Json).dependencies.PSObject.Properties.Name)
  $now = @((Get-Content package.json -Raw | ConvertFrom-Json).dependencies.PSObject.Properties.Name)
  $added = @($now | Where-Object { $before -notcontains $_ })
} catch {
  Write-Host ("Could not compare package.json with the last commit: " + $_.Exception.Message) -ForegroundColor Yellow
}
if ($added.Count -gt 0) {
  Write-Host (">>> WARNING: new runtime dependencies since the last commit: " + ($added -join ', ')) -ForegroundColor Yellow
} else {
  Write-Host "No new runtime dependency. OK" -ForegroundColor Green
}

# 5. P07 (DECISIONS Q18): no sound / confetti / animation library may be imported (tests are excluded from this check).
$libUse = Get-ChildItem -Path src -Recurse -Include *.ts, *.tsx |
  Where-Object { $_.FullName -notmatch '\.test\.tsx?$' } |
  Select-String -Pattern "from '(canvas-confetti|react-confetti|howler|tone|use-sound|framer-motion|lottie-react)'"
if ($libUse) {
  Write-Host ">>> WARNING: a sound / confetti / animation library is imported:" -ForegroundColor Yellow
  $libUse | ForEach-Object { Write-Host ("  " + $_.Path + ":" + $_.LineNumber + "  " + $_.Line.Trim()) }
} else {
  Write-Host "No sound / confetti / animation library imported. OK" -ForegroundColor Green
}

# 6. Guard from the 2026-11-20 incident: this core file is used by many files and must exist.
if (Test-Path -LiteralPath "src\core\storage\sessionStore.ts") {
  Write-Host "src\core\storage\sessionStore.ts exists. OK" -ForegroundColor Green
} else {
  Write-Host ">>> WARNING: src\core\storage\sessionStore.ts is MISSING (restore it: git checkout HEAD -- src/core/storage/sessionStore.ts)" -ForegroundColor Red
}

# 7. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = (Get-ChildItem -Path builds -Directory).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 8. Information only: known vulnerabilities. Does not stop the commit.
Write-Host ""
Write-Host ">>> npm audit (runtime dependencies only, information)" -ForegroundColor Cyan
npm audit --omit=dev
Write-Host ("npm audit exit code: " + $LASTEXITCODE + " (0 = none found; this does not stop the commit)")
Write-Host ""
Write-Host ">>> npm audit (all packages incl. dev tools, last 12 lines only, information)" -ForegroundColor Cyan
npm audit 2>&1 | Select-Object -Last 12

# 9. A commit needs a name + email. If none is set, use a local (this repo only) placeholder.
$name = git config user.name
$email = git config user.email
if (-not $name)  { git config user.name  "My Native Preparation owner"; Write-Host "Set local git user.name (placeholder)." }
if (-not $email) { git config user.email "owner@users.noreply.invalid";  Write-Host "Set local git user.email (placeholder)." }

# 10. Commit.
git add -A
Write-Host ""
Write-Host ">>> Files to be committed:" -ForegroundColor Cyan
git status --short
git commit -m "P07: test game, stars, sound, confetti"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P07 commit finished OK." -ForegroundColor Green
exit 0
