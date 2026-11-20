# p05-preview.ps1 - builds the app and serves it on localhost for the owner's visual check (P05 T6).
# Same server as p04-preview: pinned to localhost:4173 (the owner is already registered there; otherwise Register first).
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p05-preview.ps1"

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in a NORMAL Chrome window (not Incognito):  http://localhost:4173/" -ForegroundColor Green
Write-Host "Walk-through (P05 Home and courses):" -ForegroundColor Cyan
Write-Host "  1. Home shows 2 course cards: 'Sample: General Science' and 'Sample: Empty Course'." -ForegroundColor Cyan
Write-Host "  2. Open 'Sample: General Science': 4 tiles (Overview, Content, Test, Report); all 4 open (the screens say 'Coming in a later update')." -ForegroundColor Cyan
Write-Host "  3. Press Back, then open 'Sample: Empty Course': Overview, Content and Test show the Gujarati 'not available' text and do not open; Report opens." -ForegroundColor Cyan
Write-Host "  4. The bottom bar keeps 'Courses' highlighted on the course screens." -ForegroundColor Cyan
Write-Host "  5. Look at light and dark (Settings, or the Windows theme if there is no switch)." -ForegroundColor Cyan
Write-Host "  6. Make the window narrow (about 360 px wide; Chrome: F12, then Ctrl+Shift+M): no sideways scroll, no overlapping cards or tiles." -ForegroundColor Cyan
Write-Host "Tell Claude (in Gujarati is fine) what looks wrong, or say 'all good'." -ForegroundColor Cyan
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview -- --host localhost --port 4173 --strictPort
