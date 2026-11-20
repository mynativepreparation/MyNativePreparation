# p04-preview.ps1 - builds the app and serves it on localhost for the owner's identity check (P04 T13).
# WebAuthn (fingerprint) needs HTTPS or localhost, so the server is pinned to localhost:4173.
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p04-preview.ps1"

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in a NORMAL Chrome window (not Incognito):  http://localhost:4173/" -ForegroundColor Green
Write-Host "Walk-through A (fingerprint): Register -> Copy -> Fingerprint (turn on) -> Info -> Privacy -> Home" -ForegroundColor Cyan
Write-Host "Walk-through B (PIN): Register -> Copy -> Fingerprint (Skip) -> PIN (6 digits, twice) -> Info -> Privacy -> Home; close and reopen the tab -> PIN screen (a wrong PIN shows the tries left; 5 wrong PINs remove the lock, then the 12 words are needed)" -ForegroundColor Cyan
Write-Host "Walk-through C (BOTH locks, T12d; needs a device with a fingerprint, so use the phone link from p04-phone.ps1): Register -> Fingerprint (turn on) -> Info -> Privacy -> Home -> Settings -> PIN card: Turn on -> type the 12 words once -> PIN twice." -ForegroundColor Cyan
Write-Host "   Then close and reopen the tab: the FINGERPRINT prompt comes first; a good fingerprint opens the app (NO PIN). Cancel the fingerprint -> the PIN screen opens (right PIN opens the app, a wrong PIN shows the tries left). Settings: turn one lock off -> reopen -> only the other one asks." -ForegroundColor Cyan
Write-Host "Settings has a card for each lock; both locks can be on at the same time (fingerprint first, the PIN is the fallback)." -ForegroundColor Cyan
Write-Host "Then: close the tab and reopen the same address -> Log out -> Login with the same 12 words -> Login with a wrong key" -ForegroundColor Cyan
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview -- --host localhost --port 4173 --strictPort
