# p03-manifest.ps1 - phase P03 T6: builds public/content/manifest.json (SHA-256 of every course file), then runs the full check.
# Run:  .\run.cmd p03-manifest.ps1

Write-Host ">>> Build manifest.json" -ForegroundColor Cyan
node scripts/make-manifest.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED: make-manifest (exit code $LASTEXITCODE)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ">>> Full check (types, module boundaries, lint, tests)" -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED: npm run check (exit code $LASTEXITCODE)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "P03 manifest + check finished OK." -ForegroundColor Green
exit 0
