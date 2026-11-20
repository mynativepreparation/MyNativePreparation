# p07-t1.ps1 - phase P07 T1: runs the full check (types, boundaries, lint, tests) for the new `star` color token.
# (An earlier version of this script deleted src\core\storage\sessionStore.ts. That file is REAL and used by 10 files; it must never be deleted.)
# Run:  .\run.cmd p07-t1.ps1

Write-Host ">>> Full check (types, module boundaries, lint, tests)" -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) {
  Write-Host ("CHECK FAILED (exit code " + $LASTEXITCODE + ").") -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "P07 T1 check finished OK." -ForegroundColor Green
exit 0
