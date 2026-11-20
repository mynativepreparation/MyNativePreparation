# p07-restore.ps1 - restores src\core\storage\sessionStore.ts from the last git commit (the real file was overwritten and then
# deleted by mistake on 2026-11-20), shows what git restored, then runs the full check.
# Run:  .\run.cmd p07-restore.ps1

$file = "src/core/storage/sessionStore.ts"

Write-Host ">>> git status of the file before restoring" -ForegroundColor Cyan
git status --short -- $file

Write-Host ""
Write-Host ">>> Restore from HEAD" -ForegroundColor Cyan
git checkout HEAD -- $file
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAILED: git could not restore the file (exit code $LASTEXITCODE)" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ">>> Restored file (first 60 lines)" -ForegroundColor Cyan
Get-Content -LiteralPath "src\core\storage\sessionStore.ts" -TotalCount 60

Write-Host ""
Write-Host ">>> Full check (types, module boundaries, lint, tests)" -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) {
  Write-Host ("CHECK FAILED (exit code " + $LASTEXITCODE + ").") -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Restore + check finished OK." -ForegroundColor Green
exit 0
