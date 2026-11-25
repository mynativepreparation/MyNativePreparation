# p11-commit.ps1 - phase P11 cleanup checks + git commit "P11: publish and sync".
# Order for the owner:  1) .\run.cmd build.ps1       (runs the FULL check, builds, measures the JS size: budget 800 KB gzip, DECISIONS Q22)
#                       2) .\run.cmd p11-commit.ps1  (this file)
#                       3) .\run.cmd p11-push.ps1    (the FIRST push: it makes the whole history PUBLIC, so this script looks for secrets first)
# Read-only checks first (a failing blocking check stops here and nothing is committed), then the commit.
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads a file without a BOM as ANSI).

$ErrorActionPreference = 'Continue'
$blocking = @()

function Mask([string]$text) {
  # Never print a whole secret into the log: the first 12 characters and the length only.
  $head = $text.Substring(0, [Math]::Min(12, $text.Length))
  return ($head + '... (' + $text.Length + ' chars)')
}

# 1. .gitignore must keep secret/junk file types out of the commit.
$required = @('node_modules', 'dist', 'builds', 'logs', '.env', '*.keystore', '*.jks', '*.pem')
$ignore = Get-Content .gitignore
foreach ($r in $required) {
  if ($ignore -notcontains $r) { $blocking += (".gitignore is missing: " + $r) }
}
git check-ignore -q logs/last-run.txt
if ($LASTEXITCODE -ne 0) { $blocking += 'logs\ is NOT ignored by git (run logs and the old window backup would go public)' }

# 2. Licence: Apache-2.0 in package.json and the full text in LICENSE (DECISIONS Q29 / Q30).
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
if ($pkg.license -ne 'Apache-2.0') { $blocking += ("package.json license is '" + $pkg.license + "', expected Apache-2.0") }
if (Test-Path -LiteralPath LICENSE) {
  $flat = ([System.IO.File]::ReadAllText((Join-Path (Get-Location) 'LICENSE'))) -replace '\s+', ' '
  if ($flat -notmatch 'Apache License Version 2\.0, January 2004') { $blocking += 'LICENSE is not the Apache License 2.0' }
} else {
  $blocking += 'LICENSE is missing'
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

# 4. BLOCKING: the runtime dependencies must be exactly the same set as in the last commit (no new runtime dependency in P11).
try {
  $before = @(((git show HEAD:package.json) -join "`n" | ConvertFrom-Json).dependencies.PSObject.Properties.Name)
  $now = @($pkg.dependencies.PSObject.Properties.Name)
  foreach ($dep in @($now | Where-Object { $before -notcontains $_ })) { $blocking += ("new runtime dependency: " + $dep) }
  foreach ($dep in @($before | Where-Object { $now -notcontains $_ })) { $blocking += ("runtime dependency removed: " + $dep) }
  Write-Host ("Runtime dependencies compared with the last commit (" + $now.Count + " now). ") -NoNewline
  Write-Host "Done." -ForegroundColor Green
} catch {
  $blocking += ("could not compare package.json with the last commit: " + $_.Exception.Message)
}

# 5. Guards: files that the publish / sync / deploy work needs must exist.
$must = @(
  'src\core\admin\githubWrite.ts', 'src\core\admin\publishPlan.ts', 'src\core\admin\publishRun.ts', 'src\core\admin\liveCheck.ts',
  'src\core\content\manifestBuild.ts', 'src\core\content\config.ts', 'src\core\content\sync.ts',
  'src\modules\admin\usePublish.ts', 'src\modules\admin\useLiveCheck.ts', 'src\modules\admin\PublishPanel.tsx', 'src\modules\admin\publishText.ts',
  'src\modules\home\useContentSync.ts', '.github\workflows\pages.yml', 'LICENSE', 'scripts\p11-push.ps1'
)
foreach ($m in $must) {
  if (Test-Path -LiteralPath $m) { Write-Host ($m + " exists. OK") -ForegroundColor Green }
  else { $blocking += ("missing file: " + $m) }
}

# 6. BLOCKING: the build must be newer than every source file, and the JS budget must hold (js-size.ps1 stops at 800 KB gzip).
if (-not (Test-Path -LiteralPath dist)) {
  $blocking += 'dist\ does not exist: run .\run.cmd build.ps1 first'
} else {
  $distTime = (Get-ChildItem dist -Recurse -File | Measure-Object -Property LastWriteTime -Maximum).Maximum
  $newest = (Get-ChildItem -Path src, public -Recurse -File | Measure-Object -Property LastWriteTime -Maximum).Maximum
  foreach ($f in @('package.json', 'vite.config.ts', 'index.html')) {
    $t = (Get-Item -LiteralPath $f).LastWriteTime
    if ($t -gt $newest) { $newest = $t }
  }
  if ($distTime -lt $newest) {
    $blocking += ('dist\ is older than the source (dist ' + $distTime.ToString('s') + ', source ' + $newest.ToString('s') + '): run .\run.cmd build.ps1 first')
  } else {
    Write-Host ("dist\ is newer than the source (" + $distTime.ToString('s') + "). OK") -ForegroundColor Green
    & ".\scripts\js-size.ps1"
    if ($LASTEXITCODE -ne 0) { $blocking += 'JS is over the budget (see above)' }
  }
}

# 7. Exactly one build in builds\ (AGENTS.md phase end checklist).
$buildCount = @(Get-ChildItem -Path builds -Directory -ErrorAction SilentlyContinue).Count
Write-Host ("builds\ folders: " + $buildCount)
if ($buildCount -ne 1) { Write-Host "WARNING: builds\ should contain exactly one build." -ForegroundColor Yellow }

# 8. SECRETS: this repo goes PUBLIC with the first push. Look at every file git would track (tracked + new, minus ignored).
Write-Host ""
Write-Host ">>> Secret scan of the files that will be committed (the repo becomes public with the push)" -ForegroundColor Cyan
$files = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard)
Write-Host ("  files git would track: " + $files.Count)
$badNames = '(^|/)\.env($|\.)|\.(pem|key|p12|pfx|keystore|jks)$|(^|/)id_(rsa|ed25519|ecdsa)|(^|/)\.npmrc$'
foreach ($f in $files) {
  if ($f -match $badNames) { $blocking += ("a secret-looking FILE would be committed: " + $f) }
}
$patterns = @(
  @{ Name = 'GitHub fine-grained token'; Regex = 'github_pat_[A-Za-z0-9_]{22,}' },
  @{ Name = 'GitHub token';              Regex = 'gh[pousr]_[A-Za-z0-9]{30,}' },
  @{ Name = 'AWS access key';            Regex = 'AKIA[0-9A-Z]{16}' },
  @{ Name = 'private key block';         Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' }
)
$textExt = '\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|ps1|cmd|css|html|txt|svg|webmanifest)$'
$hits = 0
foreach ($f in $files) {
  if ($f -notmatch $textExt) { continue }
  $item = Get-Item -LiteralPath $f -ErrorAction SilentlyContinue
  if ($null -eq $item -or $item.Length -gt 2MB) { continue }
  $lines = [System.IO.File]::ReadAllLines($item.FullName)
  for ($i = 0; $i -lt $lines.Length; $i++) {
    foreach ($p in $patterns) {
      $m = [regex]::Match($lines[$i], $p.Regex)
      if ($m.Success) {
        $hits++
        $where = $f + ':' + ($i + 1) + '  ' + $p.Name + '  ' + (Mask $m.Value)
        if ($f -match '\.test\.tsx?$') {
          Write-Host ("  WARNING (test file, probably a fake value - look at it): " + $where) -ForegroundColor Yellow
        } else {
          $blocking += ("secret-looking text in a source file: " + $where)
        }
      }
    }
  }
}
if ($hits -eq 0) { Write-Host "  No secret-looking text in the files to be committed. OK" -ForegroundColor Green }

# 9. The OLD commits go public too. Show what they contain (warning only: history is never rewritten here).
Write-Host ""
Write-Host ">>> History check (all commits that the push will publish)" -ForegroundColor Cyan
$old = @(git log --all --oneline -G 'github_pat_[A-Za-z0-9_]{22,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----')
if ($old.Count -gt 0) {
  Write-Host "  WARNING: these old commits contain secret-looking text (fake test values are normal; a REAL token must be revoked on GitHub):" -ForegroundColor Yellow
  $old | ForEach-Object { Write-Host ("    " + $_) }
} else {
  Write-Host "  No secret-looking text in any old commit. OK" -ForegroundColor Green
}
$authors = @(git log --all --format='%an <%ae>' | Sort-Object -Unique)
Write-Host "  Authors in the history (names and e-mail addresses become PUBLIC with the push):"
$authors | ForEach-Object { Write-Host ("    " + $_) }
$realMail = @($authors | Where-Object { $_ -notmatch 'noreply|\.invalid' })
if ($realMail.Count -gt 0) {
  Write-Host "  ATTENTION: a real-looking e-mail address is in the history. Tell Claude BEFORE running p11-push.ps1." -ForegroundColor Yellow
}

if ($blocking.Count -gt 0) {
  Write-Host ""
  Write-Host ">>> STOPPED: nothing was committed. Fix these first:" -ForegroundColor Red
  $blocking | ForEach-Object { Write-Host ("  - " + $_) -ForegroundColor Red }
  exit 1
}

# 10. BLOCKING: no known vulnerability in the runtime dependencies.
Write-Host ""
Write-Host ">>> npm audit --omit=dev (blocking)" -ForegroundColor Cyan
npm audit --omit=dev 2>&1 | Select-Object -Last 12
if ($LASTEXITCODE -ne 0) {
  Write-Host ">>> STOPPED: npm audit --omit=dev reported problems." -ForegroundColor Red
  exit 1
}

# 11. A commit needs a name + email. If none is set, use a local (this repo only) placeholder.
$name = git config user.name
$email = git config user.email
if (-not $name)  { git config user.name  "My Native Preparation owner"; Write-Host "Set local git user.name (placeholder)." }
if (-not $email) { git config user.email "owner@users.noreply.invalid";  Write-Host "Set local git user.email (placeholder)." }
Write-Host ("This commit will be made as: " + (git config user.name) + " <" + (git config user.email) + ">")

# 12. Commit.
git add -A
Write-Host ""
Write-Host ">>> Files to be committed:" -ForegroundColor Cyan
git status --short
git commit -m "P11: publish and sync"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit failed (or nothing to commit)." -ForegroundColor Red
  exit 1
}

Write-Host ""
git log --oneline -n 3
Write-Host "P11 commit finished OK. Next: .\run.cmd p11-push.ps1 (after Claude has looked at the history check above)." -ForegroundColor Green
exit 0
