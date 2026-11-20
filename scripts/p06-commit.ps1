# p06-commit.ps1 - phase P06 cleanup check + git commit.
# Run:  .\run.cmd p06-commit.ps1
# Run `.\run.cmd build.ps1` first (it runs the checks, builds, and keeps exactly one folder in builds\).

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

# 4. P06 (DECISIONS Q17): react-zoom-pan-pinch may be used only in ImageViewer.tsx (its test replaces it with a stand-in).
$zoomUse = Get-ChildItem -Path src -Recurse -Include *.ts, *.tsx |
  Select-String -Pattern 'react-zoom-pan-pinch' -SimpleMatch |
  Where-Object { $_.Path -notmatch 'ImageViewer(\.test)?\.tsx$' }
if ($zoomUse) {
  Write-Host ">>> WARNING: react-zoom-pan-pinch is used outside ImageViewer:" -ForegroundColor Yellow
  $zoomUse | ForEach-Object { Write-Host ("  " + $_.Path + ":" + $_.LineNumber + "  " + $_.Line.Trim()) }
} else {
  Write-Host "react-zoom-pan-pinch is used only in ImageViewer. OK" -ForegroundColor Green
}

# 5. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = (Get-ChildItem -Path builds -Directory).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 6. Information only: known vulnerabilities. Does not stop the commit.
Write-Host ""
Write-Host ">>> npm audit (runtime dependencies only, information)" -ForegroundColor Cyan
npm audit --omit=dev
Write-Host ("npm audit exit code: " + $LASTEXITCODE + " (0 = none found; this does not stop the commit)")
Write-Host ""
Write-Host ">>> npm audit (all packages incl. dev tools, last 12 lines only, information)" -ForegroundColor Cyan
npm audit 2>&1 | Select-Object -Last 12

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
git commit -m "P06: reader, font zoom, zoomable images"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P06 commit finished OK." -ForegroundColor Green
exit 0
