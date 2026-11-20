# p07-preview.ps1 - builds the app and serves it on localhost for the owner's visual check (P07 T10: the Test game).
# Same server as p05/p06-preview: pinned to localhost:4173 (the owner is already registered there; otherwise Register first).
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p07-preview.ps1"
# For the phone (sound and touch): keep THIS window running, open a SECOND PowerShell window and run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p04-phone.ps1"
# It prints an https link; open that link on the phone (the phone has its own data, so Register there first).

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in a NORMAL Chrome window (not Incognito):  http://localhost:4173/" -ForegroundColor Green
Write-Host "If the page behaves like the OLD version after a new build: the app only switches to a new version when you accept its update or when ALL tabs of localhost:4173 are closed. Close every tab of the site and open it again, or F12 > Application > Service Workers > Unregister, then Ctrl+Shift+R. Do NOT use 'Clear site data' (it deletes your registration)." -ForegroundColor Yellow
Write-Host "Walk-through (P07 Test game). Turn the PC volume up a little first:" -ForegroundColor Cyan
Write-Host "  1. Home > 'Sample: General Science' > Test tile: an intro with the title, 'N questions' and a Start button." -ForegroundColor Cyan
Write-Host "  2. Press Start: question 1 shows with 4 options A to D, 'Question 1 of N', a progress bar and 'Score: 0'." -ForegroundColor Cyan
Write-Host "  3. Choose a WRONG option: 'Not quite.' appears, your choice has a cross + 'Your answer', the right option has a tick + 'Correct answer', the explanation card shows (if the question has one), the options are locked, a soft low note plays." -ForegroundColor Cyan
Write-Host "  4. Press Next. Choose a RIGHT option: 'Correct!', a rising two-note sound, the score goes up. The last question has 'See result' instead of 'Next'." -ForegroundColor Cyan
Write-Host "  5. Keyboard (PC): keys 1-4 or A-D choose an option, Enter goes on." -ForegroundColor Cyan
Write-Host "  6. Result: the stars appear one by one, the percent, 'X of N correct', a cheer message and a fanfare. With 3 or more stars a confetti burst runs for about 2 seconds and then disappears." -ForegroundColor Cyan
Write-Host "  7. Play again: a new game starts. Play 2 or 3 games: the order of the questions and of the options changes between games (the sample may have only a few questions)." -ForegroundColor Cyan
Write-Host "  8. Mute button in the game header: press it, then press F5 and start a game again: it is still muted. Press it again: sound is back." -ForegroundColor Cyan
Write-Host "  9. Leave dialog: in the middle of a game press the Leave button, then the browser Back button, then a tab in the bottom bar. Each time 'Leave the game?' appears with Stay / Leave. Stay (or Esc) keeps the game; Leave goes away." -ForegroundColor Cyan
Write-Host " 10. On the result screen: Back to course works; Report opens the 'coming later' placeholder (the real report is P08)." -ForegroundColor Cyan
Write-Host " 11. Home > 'Sample: Empty Course' > Test does not open a game (the Gujarati 'not available' text with a Back button)." -ForegroundColor Cyan
Write-Host " 12. Look at light and dark (Settings, or the Windows theme if there is no switch): the correct (green), wrong (red) and star colours are readable in both." -ForegroundColor Cyan
Write-Host " 13. Make the window narrow (about 360 px wide; Chrome: F12, then Ctrl+Shift+M): no sideways scroll, nothing overlaps, the buttons are easy to hit." -ForegroundColor Cyan
Write-Host " 14. ON THE PHONE (link from p04-phone.ps1, silent mode OFF, volume up): sound is audible after Start, taps feel good, no overlap in portrait, confetti and stars look smooth." -ForegroundColor Cyan
Write-Host "Tell Claude (in Gujarati is fine) what looks wrong, or say 'all good'." -ForegroundColor Cyan
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview -- --host localhost --port 4173 --strictPort
