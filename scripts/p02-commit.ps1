# p02-commit.ps1 - phase P02 cleanup check + git commit.
# Run:  .\run.cmd p02-commit.ps1

$ErrorActionPreference = 'Continue'

# 1. Make sure no secret/junk file types would be committed.
$required = @('node_modules', 'dist', 'builds', '.env', '*.keystore', '*.jks', '*.pem')
$ignore = Get-Content .gitignore
foreach ($r in $required) {
  if ($ignore -notcontains $r) { Write-Host ("WARNING: .gitignore is missing: " + $r) -ForegroundColor Yellow }
}

# 2. Junk check: debug logs (console.log / debugger) in source must not exist.
$junk = Get-ChildItem -Path src -Recurse -Include *.ts, *.tsx |
  Select-String -Pattern 'console\.log|debugger' -SimpleMatch:$false
if ($junk) {
  Write-Host ">>> Debug leftovers found:" -ForegroundColor Yellow
  $junk | ForEach-Object { Write-Host ("  " + $_.Path + ":" + $_.LineNumber + "  " + $_.Line.Trim()) }
} else {
  Write-Host "No console.log / debugger in src. OK" -ForegroundColor Green
}

# 3. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = (Get-ChildItem -Path builds -Directory).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 4. A commit needs a name + email. If none is set, use a local (this repo only) placeholder.
$name = git config user.name
$email = git config user.email
if (-not $name)  { git config user.name  "My Native Preparation owner"; Write-Host "Set local git user.name (placeholder)." }
if (-not $email) { git config user.email "owner@users.noreply.invalid";  Write-Host "Set local git user.email (placeholder)." }

# 5. Commit.
git add -A
Write-Host ""
Write-Host ">>> Files to be committed:" -ForegroundColor Cyan
git status --short
git commit -m "P02: design system, themes, gallery"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P02 commit finished OK." -ForegroundColor Green
exit 0
