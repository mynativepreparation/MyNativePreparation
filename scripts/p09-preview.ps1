# p09-preview.ps1 - builds the app and serves it on localhost for the owner's visual check (P09 T7: the Settings screen).
# Same server as p05..p08-preview: pinned to localhost:4173 (the owner is already registered there; otherwise Register first).
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p09-preview.ps1"
# For the phone: keep THIS window running, open a SECOND PowerShell window and run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p04-phone.ps1"
# It prints an https link; open that link on the phone (the phone has its own data, so Register there first).

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in a NORMAL Chrome window (not Incognito):  http://localhost:4173/" -ForegroundColor Green
Write-Host "If the page behaves like the OLD version after a new build: the app only switches to a new version when you accept its update or when ALL tabs of localhost:4173 are closed. Close every tab of the site and open it again, or F12 > Application > Service Workers > Unregister, then Ctrl+Shift+R. Do NOT use 'Clear site data' (it deletes your registration)." -ForegroundColor Yellow
Write-Host "Walk-through (P09 Settings). Open Settings from the bottom bar / menu:" -ForegroundColor Cyan
Write-Host "  1. ORDER: from the top you see Profile, Theme, Fingerprint, PIN, Passphrase information (with Log out), Update app, About. Nothing is missing, nothing is doubled." -ForegroundColor Cyan
Write-Host "  2. PROFILE: the card shows your name / email / phone (prefilled from registration). Change the name (try a long Gujarati name: it must wrap, not run off the screen) and press Save. A 'saved' message appears." -ForegroundColor Cyan
Write-Host "  3. BAD EMAIL: type 'abc' in email and Save: a friendly message, nothing is saved. Fix it to a normal address and Save again. Then clear ALL three fields and Save: an empty profile is allowed." -ForegroundColor Cyan
Write-Host "  4. KEPT: put some values in again, Save, then reload the page (F5): the values are still there. Then Log out (Passphrase card), log in again, open Settings: the values are STILL there." -ForegroundColor Cyan
Write-Host "  5. UPDATE APP, normal: press the Update app button. A short busy text, then 'You have the latest version'. The button is disabled while it checks." -ForegroundColor Cyan
Write-Host "  6. UPDATE APP, offline: F12 > Network > tick 'Offline', press the button: 'You are offline' and nothing else happens. Untick Offline afterwards." -ForegroundColor Cyan
Write-Host "  7. ABOUT: the app name, a real version number, 'MIT licence, free and open source', the data policy (same wording as the privacy screen) and one line naming the open-source parts (Noto Sans Gujarati, pdf-lib ...)." -ForegroundColor Cyan
Write-Host "  8. Keyboard (PC): Tab through the whole Settings screen from top to bottom. Every control gets a visible focus ring; press Enter on the Update app button with the keyboard and TELL CLAUDE where the focus is afterwards." -ForegroundColor Cyan
Write-Host "  9. Look at light and dark (Theme card): all texts, fields, buttons and messages on every card are readable in both." -ForegroundColor Cyan
Write-Host " 10. Make the window narrow (about 360 px wide; Chrome: F12, then Ctrl+Shift+M): no sideways scroll, nothing overlaps, long texts wrap, the buttons are easy to hit." -ForegroundColor Cyan
Write-Host " 11. ON THE PHONE (link from p04-phone.ps1): open Settings, edit the profile and Save, press Update app, scroll to About: everything readable, no overlap." -ForegroundColor Cyan
Write-Host "Tell Claude (in Gujarati is fine) what looks wrong, or say 'all good'." -ForegroundColor Cyan
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview -- --host localhost --port 4173 --strictPort
