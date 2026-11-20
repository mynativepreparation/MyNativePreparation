# p04-cleanup.ps1 - deletes the unused onboarding stub (P04), then runs the full check.
# Run:  .\run.cmd p04-cleanup.ps1

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$stub = Join-Path $root 'src\modules\onboarding\OnboardingStub.tsx'
if (Test-Path -LiteralPath $stub) {
  Remove-Item -LiteralPath $stub -Force
  Write-Host "Deleted: $stub" -ForegroundColor Green
} else {
  Write-Host "Already deleted: $stub" -ForegroundColor Yellow
}

npm run check
if ($LASTEXITCODE -ne 0) {
  Write-Host "CHECK FAILED (exit code $LASTEXITCODE)." -ForegroundColor Red
  exit 1
}
Write-Host "CHECK OK." -ForegroundColor Green
exit 0
