# check.ps1 - the FULL project check: types, module boundaries, lint, all tests.
# Run:  .\run.cmd check.ps1
#
# Speed (owner request 2026-11-22): the three light steps (types, boundaries, lint) run in a background job WHILE the tests run in
# front, and every step prints its own time, so the log shows where the minutes go. The type check is incremental (package.json),
# so only the first run after a big change is slow. For a quick check after a small change use fast.ps1 instead;
# use THIS script before a commit, at the end of a phase, or when fast.ps1 asks for it.
# The log shows the last lines of every step (npm output is captured here, because Start-Transcript does not record it by itself).

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'
$total = [Diagnostics.Stopwatch]::StartNew()

$light = Start-Job -ArgumentList $root -ScriptBlock {
  param($root)
  Set-Location $root
  $env:NO_COLOR = '1'
  $env:FORCE_COLOR = '0'
  foreach ($step in 'typecheck', 'boundaries', 'lint') {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $out = cmd /c "npm run $step 2>&1"
    [pscustomobject]@{ Step = $step; Code = $LASTEXITCODE; Seconds = [math]::Round($sw.Elapsed.TotalSeconds); Output = @($out) }
  }
}

$sw = [Diagnostics.Stopwatch]::StartNew()
$testOut = cmd /c "npm run test 2>&1"
$testCode = $LASTEXITCODE
$testSeconds = [math]::Round($sw.Elapsed.TotalSeconds)

$results = @(Receive-Job -Job $light -Wait -AutoRemoveJob)
$failed = @()

foreach ($r in $results) {
  if ($r.Code -eq 0) {
    Write-Host ("--- {0}: ok ({1} s)" -f $r.Step, $r.Seconds) -ForegroundColor Green
    $r.Output | Select-Object -Last 3 | ForEach-Object { Write-Host $_ }
  } else {
    Write-Host ("--- {0}: FAILED ({1} s)" -f $r.Step, $r.Seconds) -ForegroundColor Red
    $r.Output | Select-Object -Last 80 | ForEach-Object { Write-Host $_ }
    $failed += $r.Step
  }
}
if ($results.Count -lt 3) { $failed += 'light-steps-did-not-finish' }

if ($testCode -eq 0) {
  Write-Host ("--- test: ok ({0} s)" -f $testSeconds) -ForegroundColor Green
  $testOut | Select-Object -Last 12 | ForEach-Object { Write-Host $_ }
} else {
  Write-Host ("--- test: FAILED ({0} s)" -f $testSeconds) -ForegroundColor Red
  $testOut | Select-Object -Last 150 | ForEach-Object { Write-Host $_ }
  $failed += 'test'
}

Write-Host ("TOTAL {0} s" -f [math]::Round($total.Elapsed.TotalSeconds))
if ($failed.Count -gt 0) {
  Write-Host ("CHECK FAILED: " + ($failed -join ', ')) -ForegroundColor Red
  exit 1
}

# A green full check is the starting point of fast.ps1 ("what changed since the last green run").
New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
Set-Content -Path (Join-Path $root 'logs\fast-marker.txt') -Value (Get-Date -Format s)
Write-Host "CHECK OK." -ForegroundColor Green
exit 0
