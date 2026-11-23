# p10-bak.ps1 - the OLD test files moved to logs\p10-removed\ are found by vitest (it scans every folder) and fail there,
# because their relative imports no longer point anywhere. This renames them to *.test.tsx.bak so vitest ignores them,
# then runs the fast check. Nothing is deleted.
# Run:  .\run.cmd p10-bak.ps1
# Undo for one file: strip the .bak, then move it back into src\modules\admin\.

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dir = Join-Path $root 'logs\p10-removed'
$n = 0
if (Test-Path -LiteralPath $dir) {
  $tests = @(Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Name -match '\.test\.(ts|tsx)$' })
  foreach ($f in $tests) {
    Rename-Item -LiteralPath $f.FullName -NewName ($f.Name + '.bak')
    Write-Host ("Renamed: " + $f.Name + " -> " + $f.Name + ".bak") -ForegroundColor Green
    $n++
  }
}
Write-Host ("Renamed " + $n + " test file(s).")
Write-Host ""

& (Join-Path $PSScriptRoot 'fast.ps1')
exit $LASTEXITCODE
