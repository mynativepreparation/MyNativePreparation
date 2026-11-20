# p04-commit.ps1 - phase P04 cleanup check + git commit.
# Run:  .\run.cmd p04-commit.ps1

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

# 4. P04: the unused onboarding stub must be gone.
if (Test-Path -LiteralPath 'src\modules\onboarding\OnboardingStub.tsx') {
  Write-Host "WARNING: src\modules\onboarding\OnboardingStub.tsx still exists (run p04-cleanup.ps1)." -ForegroundColor Yellow
} else {
  Write-Host "OnboardingStub.tsx is gone. OK" -ForegroundColor Green
}

# 5. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = (Get-ChildItem -Path builds -Directory).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 6. Information only: known vulnerabilities in RUNTIME dependencies. Does not stop the commit.
Write-Host ""
Write-Host ">>> npm audit (runtime dependencies only, information)" -ForegroundColor Cyan
npm audit --omit=dev
Write-Host ("npm audit exit code: " + $LASTEXITCODE + " (0 = none found; this does not stop the commit)")

# 7. A commit needs a name + email. If none is set, use a local (this repo only) placeholder.
$name = git config user.name
$email = git config user.email
if (-not $name)  { git config user.name  "My Native Preparation owner"; Write-Host "Set local git user.name (placeholder)." }
if (-not $email) { git config user.email "owner@users.noreply.invalid";  Write-Host "Set local git user.email (placeholder)." }

# 8. Commit.
git add -A
Write-Host ""
Write-Host ">>> Files to be committed:" -ForegroundColor Cyan
git status --short
git commit -m "P04: identity, onboarding, encrypted local store"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P04 commit finished OK." -ForegroundColor Green
exit 0
