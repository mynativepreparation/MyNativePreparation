# fast.ps1 - quick check of ONLY what changed in src\ since the last green run (fast.ps1 or check.ps1).
# Run:  .\run.cmd fast.ps1
#
# Always: module boundaries + the incremental type check of the whole project (both are cheap).
# Only for the changed files: ESLint, and the tests that changed or that import a changed file (vitest related).
# A changed CSS / JSON / SVG file also runs the tests that mention its file name (some tests read the CSS file with fs).
# A change of package.json, tsconfig, vite or eslint config, or more than 60 changed files, runs the FULL check.ps1 instead.
# Use check.ps1 before a commit and at the end of a phase. The marker is logs\fast-marker.txt (its time = the last green run).

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'
$total = [Diagnostics.Stopwatch]::StartNew()
$markerPath = Join-Path $root 'logs\fast-marker.txt'
$fullCheck = Join-Path $PSScriptRoot 'check.ps1'

function Run-Step([string]$Name, [string]$Command) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $out = cmd /c "$Command 2>&1"
  $code = $LASTEXITCODE
  $secs = [math]::Round($sw.Elapsed.TotalSeconds)
  if ($code -eq 0) {
    Write-Host ("--- {0}: ok ({1} s)" -f $Name, $secs) -ForegroundColor Green
    $out | Select-Object -Last 4 | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host ("--- {0}: FAILED ({1} s)" -f $Name, $secs) -ForegroundColor Red
    $out | Select-Object -Last 150 | ForEach-Object { Write-Host $_ }
  }
  return $code
}

if (-not (Test-Path $markerPath)) {
  Write-Host 'No green run recorded yet (logs\fast-marker.txt is missing): running the full check once.' -ForegroundColor Yellow
  & $fullCheck
  exit $LASTEXITCODE
}
$since = (Get-Item $markerPath).LastWriteTime

foreach ($name in 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'eslint.config.js') {
  $file = Join-Path $root $name
  if ((Test-Path $file) -and ((Get-Item $file).LastWriteTime -gt $since)) {
    Write-Host ("{0} changed since the last green run: running the full check instead." -f $name) -ForegroundColor Yellow
    & $fullCheck
    exit $LASTEXITCODE
  }
}

$srcRoot = Join-Path $root 'src'
$rel = @(Get-ChildItem -Path $srcRoot -Recurse -File |
  Where-Object { $_.LastWriteTime -gt $since } |
  ForEach-Object { $_.FullName.Substring($root.Length + 1).Replace('\', '/') })

if ($rel.Count -gt 60) {
  Write-Host ("{0} files changed: running the full check instead." -f $rel.Count) -ForegroundColor Yellow
  & $fullCheck
  exit $LASTEXITCODE
}

$tests = @($rel | Where-Object { $_ -match '\.test\.tsx?$' })
$sources = @($rel | Where-Object { ($_ -match '\.tsx?$') -and ($_ -notmatch '\.test\.tsx?$') })
$assets = @($rel | Where-Object { $_ -notmatch '\.tsx?$' })

Write-Host ("Changed since the last green run ({0}): {1} test file(s), {2} source file(s), {3} other file(s)" -f $since.ToString('HH:mm:ss'), $tests.Count, $sources.Count, $assets.Count)
$rel | Select-Object -First 40 | ForEach-Object { Write-Host ("  " + $_) }

# Tests that mention the file name of a changed CSS / JSON / SVG file (e.g. a test that reads RichStyles.css with fs).
$readers = @()
if ($assets.Count -gt 0) {
  $names = @($assets | ForEach-Object { Split-Path $_ -Leaf })
  $allTests = @(Get-ChildItem -Path $srcRoot -Recurse -File -Include '*.test.ts', '*.test.tsx')
  foreach ($t in $allTests) {
    $text = Get-Content -Raw -LiteralPath $t.FullName
    foreach ($n in $names) {
      if ($text.Contains($n)) { $readers += $t.FullName.Substring($root.Length + 1).Replace('\', '/'); break }
    }
  }
}

$failed = @()
if ((Run-Step 'boundaries' 'npm run boundaries') -ne 0) { $failed += 'boundaries' }
if ((Run-Step 'typecheck' 'npm run typecheck') -ne 0) { $failed += 'typecheck' }

$lintFiles = @($tests + $sources)
if ($lintFiles.Count -gt 0) {
  if ((Run-Step 'lint (changed files)' ('npx eslint ' + ($lintFiles -join ' '))) -ne 0) { $failed += 'lint' }
}

$runTests = @(($tests + $readers) | Select-Object -Unique)
if ($runTests.Count -gt 0) {
  if ((Run-Step 'tests (changed test files)' ('npx vitest run --passWithNoTests ' + ($runTests -join ' '))) -ne 0) { $failed += 'tests' }
}

$relatedInput = @($sources + $assets)
if ($relatedInput.Count -gt 0) {
  if ((Run-Step 'tests (related to changed files)' ('npx vitest related --run --passWithNoTests ' + ($relatedInput -join ' '))) -ne 0) { $failed += 'related tests' }
}

Write-Host ("TOTAL {0} s" -f [math]::Round($total.Elapsed.TotalSeconds))
if ($failed.Count -gt 0) {
  Write-Host ("FAST CHECK FAILED: " + ($failed -join ', ')) -ForegroundColor Red
  exit 1
}

Set-Content -Path $markerPath -Value (Get-Date -Format s)
Write-Host ("FAST CHECK OK ({0} changed file(s))." -f $rel.Count) -ForegroundColor Green
exit 0
