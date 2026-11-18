# p01-verify.ps1 - proves that the module-isolation rule really catches a bad import.
# Run:  .\run.cmd p01-verify.ps1

$bad = 'src\modules\home\__bad_import.ts'

Write-Host ">>> Self-test: a module importing another module must be REJECTED" -ForegroundColor Cyan
Set-Content -Path $bad -Value "import '../settings/SettingsScreen';"
node scripts/check-boundaries.mjs
$caught = ($LASTEXITCODE -ne 0)
Remove-Item $bad -Force -ErrorAction SilentlyContinue

if (-not $caught) {
  Write-Host "SELF-TEST FAILED: the bad import was NOT caught." -ForegroundColor Red
  exit 1
}
Write-Host "Self-test OK: the bad import was caught (the error above is expected)." -ForegroundColor Green

Write-Host ""
Write-Host ">>> Real check on the clean code" -ForegroundColor Cyan
node scripts/check-boundaries.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "Boundary check failed on the clean code." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "P01 verify finished OK." -ForegroundColor Green
exit 0
