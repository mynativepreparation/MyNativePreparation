# check.ps1 - runs the full project check (types, module boundaries, lint, tests).
# Run:  .\run.cmd check.ps1

npm run check
if ($LASTEXITCODE -ne 0) {
  Write-Host "CHECK FAILED (exit code $LASTEXITCODE)." -ForegroundColor Red
  exit 1
}
Write-Host "CHECK OK." -ForegroundColor Green
exit 0
