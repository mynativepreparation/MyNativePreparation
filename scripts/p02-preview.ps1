# p02-preview.ps1 - builds the app and starts the preview server for the owner's visual check (P02 T11).
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p02-preview.ps1"

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in Chrome Incognito:  http://localhost:4173/#/gallery" -ForegroundColor Green
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview
