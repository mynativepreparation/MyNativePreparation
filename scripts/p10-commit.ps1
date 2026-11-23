# p10-commit.ps1 - phase P10 cleanup checks + git commit "P10: admin editor".
# Order for the owner:  1) .\run.cmd check.ps1   (FULL check)   2) .\run.cmd build.ps1   (JS must be <= 800 KB, DECISIONS Q22)
#                       3) .\run.cmd p10-commit.ps1
# Read-only checks first (a failing blocking check stops here and nothing is committed), then the commit.

$ErrorActionPreference = 'Continue'

# 1. Make sure no secret/junk file types would be committed.
$required = @('node_modules', 'dist', 'builds', '.env', '*.keystore', '*.jks', '*.pem')
$ignore = Get-Content .gitignore
foreach ($r in $required) {
  if ($ignore -notcontains $r) { Write-Host ("WARNING: .gitignore is missing: " + $r) -ForegroundColor Yellow }
}

# 2. The backup of the old admin window (logs\p10-removed) must be ignored by git (logs is ignored).
git check-ignore -q logs/p10-removed
if ($LASTEXITCODE -eq 0) {
  Write-Host "logs\ is ignored by git (the moved old window files stay out of the commit). OK" -ForegroundColor Green
} else {
  Write-Host ">>> WARNING: logs\ is NOT ignored by git: the old window backup would be committed." -ForegroundColor Yellow
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

# 4. BLOCKING: the runtime dependencies must be exactly the same set as in the last commit (no new runtime dependency in P10).
$problems = @()
try {
  $before = @(((git show HEAD:package.json) -join "`n" | ConvertFrom-Json).dependencies.PSObject.Properties.Name)
  $now = @((Get-Content package.json -Raw | ConvertFrom-Json).dependencies.PSObject.Properties.Name)
  foreach ($dep in @($now | Where-Object { $before -notcontains $_ })) { $problems += ("new runtime dependency: " + $dep) }
  foreach ($dep in @($before | Where-Object { $now -notcontains $_ })) { $problems += ("runtime dependency removed: " + $dep) }
} catch {
  $problems += ("could not compare package.json with the last commit: " + $_.Exception.Message)
}
if ($problems.Count -gt 0) {
  Write-Host ">>> STOPPED: runtime dependency check failed:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host ("  " + $_) -ForegroundColor Red }
  exit 1
}
Write-Host ("Runtime dependencies unchanged since the last commit (" + $now.Count + "). OK") -ForegroundColor Green

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

# 6. Guards: files that other code needs must exist (2026-11-20 incident; the T12 cleanup of the old admin window).
foreach ($must in @('src\core\storage\sessionStore.ts', 'src\modules\admin\BlockEditor.css', 'src\modules\admin\ChapterList.css', 'src\modules\admin\imageFile.ts', 'src\modules\admin\CourseWorkspace.tsx')) {
  if (Test-Path -LiteralPath $must) {
    Write-Host ($must + " exists. OK") -ForegroundColor Green
  } else {
    Write-Host (">>> WARNING: " + $must + " is MISSING") -ForegroundColor Red
  }
}

# 7. The old admin window must really be gone from src (it was moved to logs\p10-removed).
$old = @('ChapterEditor.tsx', 'ChapterStrip.tsx', 'CourseEditor.tsx', 'CourseForm.tsx', 'BlockEditor.tsx', 'PasteArea.tsx', 'MarkedPreview.tsx', 'ChapterEditor.css', 'CourseWindow.css')
$stillThere = @($old | Where-Object { Test-Path -LiteralPath (Join-Path 'src\modules\admin' $_) })
if ($stillThere.Count -gt 0) {
  Write-Host ">>> WARNING: old window files are still in src\modules\admin: " -ForegroundColor Yellow
  $stillThere | ForEach-Object { Write-Host ("  " + $_) }
} else {
  Write-Host "The old admin window files are gone from src. OK" -ForegroundColor Green
}

# 8. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = (Get-ChildItem -Path builds -Directory).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 9. BLOCKING: no known vulnerability in the runtime dependencies.
Write-Host ""
Write-Host ">>> npm audit --omit=dev (blocking)" -ForegroundColor Cyan
npm audit --omit=dev 2>&1 | Select-Object -Last 12
if ($LASTEXITCODE -ne 0) {
  Write-Host ">>> STOPPED: npm audit --omit=dev reported problems." -ForegroundColor Red
  exit 1
}

# 10. A commit needs a name + email. If none is set, use a local (this repo only) placeholder.
$name = git config user.name
$email = git config user.email
if (-not $name)  { git config user.name  "My Native Preparation owner"; Write-Host "Set local git user.name (placeholder)." }
if (-not $email) { git config user.email "owner@users.noreply.invalid";  Write-Host "Set local git user.email (placeholder)." }

# 11. Commit.
git add -A
Write-Host ""
Write-Host ">>> Files to be committed:" -ForegroundColor Cyan
git status --short
git commit -m "P10: admin editor"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P10 commit finished OK." -ForegroundColor Green
exit 0
