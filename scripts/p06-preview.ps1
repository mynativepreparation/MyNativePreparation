# p06-preview.ps1 - builds the app and serves it on localhost for the owner's visual check (P06 T8: the Reader).
# Same server as p05-preview: pinned to localhost:4173 (the owner is already registered there; otherwise Register first).
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p06-preview.ps1"
# For the phone (two-finger pinch needs a touch screen): keep THIS window running, open a SECOND PowerShell window and run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p04-phone.ps1"
# It prints an https link; open that link on the phone (the phone has its own data, so Register there first).

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in a NORMAL Chrome window (not Incognito):  http://localhost:4173/" -ForegroundColor Green
Write-Host "Walk-through (P06 Reader):" -ForegroundColor Cyan
Write-Host "  1. Home > 'Sample: General Science' > Overview: title, subtitle, text and the water-cycle picture show in order, as an e-book page (not a PDF)." -ForegroundColor Cyan
Write-Host "  2. Press A+ and A-: the text gets bigger / smaller, wraps inside the same page width, no sideways scroll. The buttons stop at the smallest and largest size." -ForegroundColor Cyan
Write-Host "  3. Leave the page and come back: the text size is remembered." -ForegroundColor Cyan
Write-Host "  4. Tap the picture: it opens full screen. Zoom with + / - / reset (laptop: mouse wheel or double click). Close and the Esc key close it, and you are back on the same spot." -ForegroundColor Cyan
Write-Host "  5. Back to the course > Content: same checks as 1 to 4." -ForegroundColor Cyan
Write-Host "  6. Back to Home > 'Sample: Empty Course' > Overview and Content do not open (the Gujarati 'not available' text)." -ForegroundColor Cyan
Write-Host "  7. Look at light and dark (Settings, or the Windows theme if there is no switch)." -ForegroundColor Cyan
Write-Host "  8. Make the window narrow (about 360 px wide; Chrome: F12, then Ctrl+Shift+M): no sideways scroll, nothing overlaps." -ForegroundColor Cyan
Write-Host "  9. ON THE PHONE (link from p04-phone.ps1): two-finger pinch on the text changes the size and the page does not zoom; pinch and drag on the opened picture; Close works." -ForegroundColor Cyan
Write-Host "Tell Claude (in Gujarati is fine) what looks wrong, or say 'all good'." -ForegroundColor Cyan
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview -- --host localhost --port 4173 --strictPort
