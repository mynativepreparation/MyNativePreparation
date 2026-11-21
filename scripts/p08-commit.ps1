# p08-commit.ps1 - phase P08 cleanup check + git commit.
# Run:  .\run.cmd p08-commit.ps1
# Run `.\run.cmd build.ps1` first (it runs the checks, builds, prints the JS size against the 800 KB budget (DECISIONS Q22),
# and keeps exactly one folder in builds\).
# Order: read-only checks first (a failing blocking check stops here and nothing is deleted), then the spike cleanup, then the commit.

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

# 4. BLOCKING (DECISIONS Q19-Q22): the only new runtime dependencies since the last commit are the three PDF ones, with these
#    exact versions (no ^ or ~). Any other new runtime dependency stops the commit.
$allowed = [ordered]@{ 'pdf-lib' = '1.17.1'; '@pdf-lib/fontkit' = '1.1.1'; 'regenerator-runtime' = '0.14.1' }
$problems = @()
try {
  $before = @(((git show HEAD:package.json) -join "`n" | ConvertFrom-Json).dependencies.PSObject.Properties.Name)
  $depsNow = (Get-Content package.json -Raw | ConvertFrom-Json).dependencies
  $now = @($depsNow.PSObject.Properties.Name)
  foreach ($dep in @($now | Where-Object { $before -notcontains $_ })) {
    if (-not $allowed.Contains($dep)) { $problems += ("unexpected new runtime dependency: " + $dep) }
  }
  foreach ($dep in $allowed.Keys) {
    $entry = $depsNow.PSObject.Properties[$dep]
    if (-not $entry) { $problems += ("missing runtime dependency: " + $dep) }
    elseif ($entry.Value -ne $allowed[$dep]) { $problems += ("not the exact version: " + $dep + " is " + $entry.Value + ", expected " + $allowed[$dep]) }
  }
} catch {
  $problems += ("could not compare package.json with the last commit: " + $_.Exception.Message)
}
if ($problems.Count -gt 0) {
  Write-Host ">>> STOPPED: runtime dependency check failed:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host ("  " + $_) -ForegroundColor Red }
  exit 1
}
Write-Host ("Runtime dependencies: only the PDF ones are new (" + (($allowed.Keys | ForEach-Object { $_ + " " + $allowed[$_] }) -join ', ') + "), exact versions. OK") -ForegroundColor Green

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

# 7. The PDF fonts must be in public\fonts (the report loads them at run time).
if (Test-Path -LiteralPath "public\fonts") {
  $fonts = @(Get-ChildItem -Path "public\fonts" -File)
  Write-Host ("public\fonts files: " + $fonts.Count)
  $fonts | ForEach-Object { Write-Host ("  " + $_.Name + "  " + [math]::Round($_.Length / 1024, 1) + " KB") }
  if ($fonts.Count -eq 0) { Write-Host ">>> WARNING: public\fonts is empty." -ForegroundColor Yellow }
} else {
  Write-Host ">>> WARNING: public\fonts is missing." -ForegroundColor Yellow
}

# 8. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = (Get-ChildItem -Path builds -Directory).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 9. BLOCKING: no known vulnerability in the runtime dependencies (the PDF libraries are new).
Write-Host ""
Write-Host ">>> npm audit (runtime dependencies only, must be 0 findings)" -ForegroundColor Cyan
npm audit --omit=dev
$auditExit = $LASTEXITCODE
Write-Host ("npm audit --omit=dev exit code: " + $auditExit + " (0 = none found)")
if ($auditExit -ne 0) {
  Write-Host ">>> STOPPED: npm audit --omit=dev did not report 0 findings (or could not run, e.g. no internet). Read the lines above; nothing was committed." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host ">>> npm audit (all packages incl. dev tools, last 12 lines only, information)" -ForegroundColor Cyan
npm audit 2>&1 | Select-Object -Last 12

# 10. Cleanup of the PDF spike (P08 T1/T2). ONLY these two explicit paths are removed, nothing else.
Write-Host ""
Write-Host ">>> Spike cleanup" -ForegroundColor Cyan
foreach ($spike in @('scripts\p08-spike', 'scripts\p08-spike.ps1')) {
  if (Test-Path -LiteralPath $spike) {
    Remove-Item -LiteralPath $spike -Recurse -Force -ErrorAction SilentlyContinue
    if ((Test-Path -LiteralPath $spike) -and (Get-Item -LiteralPath $spike).PSIsContainer) {
      cmd /c rmdir /s /q $spike   # fallback for very long paths inside a node_modules folder
    }
    if (Test-Path -LiteralPath $spike) {
      Write-Host (">>> STOPPED: could not remove " + $spike + " (close any program that uses it and run this script again).") -ForegroundColor Red
      exit 1
    }
    Write-Host ("Removed spike: " + $spike)
  } else {
    Write-Host ("Spike already gone: " + $spike)
  }
}

# 11. A commit needs a name + email. If none is set, use a local (this repo only) placeholder.
$name = git config user.name
$email = git config user.email
if (-not $name)  { git config user.name  "My Native Preparation owner"; Write-Host "Set local git user.name (placeholder)." }
if (-not $email) { git config user.email "owner@users.noreply.invalid";  Write-Host "Set local git user.email (placeholder)." }

# 12. Commit.
git add -A
Write-Host ""
Write-Host ">>> Files to be committed:" -ForegroundColor Cyan
git status --short
git commit -m "P08: report PDF"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P08 commit finished OK." -ForegroundColor Green
exit 0
