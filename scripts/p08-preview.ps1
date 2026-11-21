# p08-preview.ps1 - builds the app and serves it on localhost for the owner's visual check (P08 T9: the Report screen and the PDF).
# Same server as p05/p06/p07-preview: pinned to localhost:4173 (the owner is already registered there; otherwise Register first).
# This script keeps running (the server). Stop it with Ctrl+C.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p08-preview.ps1"
# For the phone (share sheet / download): keep THIS window running, open a SECOND PowerShell window and run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p04-phone.ps1"
# It prints an https link; open that link on the phone (the phone has its own data, so Register there first).

npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Open in a NORMAL Chrome window (not Incognito):  http://localhost:4173/" -ForegroundColor Green
Write-Host "If the page behaves like the OLD version after a new build: the app only switches to a new version when you accept its update or when ALL tabs of localhost:4173 are closed. Close every tab of the site and open it again, or F12 > Application > Service Workers > Unregister, then Ctrl+Shift+R. Do NOT use 'Clear site data' (it deletes your registration)." -ForegroundColor Yellow
Write-Host "Walk-through (P08 Report PDF). Have a PDF viewer ready (Chrome itself or Edge opens PDF files):" -ForegroundColor Cyan
Write-Host "  1. FIRST, before you read or play anything: Home > 'Sample: General Science' > Report tile. You should see the Report title, the two buttons 'All courses' / 'This course', a friendly empty message, NO file name field and NO Create PDF button, and a Back button." -ForegroundColor Cyan
Write-Host "  2. Press Back, open the course Overview (and Content), play ONE test to the end, then open the Report tile again. Now you see 3 totals (courses opened, tests taken, stars) and a card for the course: opened, tests taken, a best-percent bar, the last percent and stars." -ForegroundColor Cyan
Write-Host "  3. Press 'This course', then 'All courses': the screen reloads each time, the pressed button looks different. 'Sample: Empty Course' only appears if you opened it." -ForegroundColor Cyan
Write-Host "  4. File name: it starts as NativePrep-report-<today's date>. Change it (try a Gujarati name and characters like / : ? which are removed when saving). Clear it completely: the default name is used." -ForegroundColor Cyan
Write-Host "  5. Press 'Create PDF': a short busy text, the page stays responsive, then the button becomes Save. The first time the PDF font loads (needs the page online once; later it works offline)." -ForegroundColor Cyan
Write-Host "  6. Press Save. Chrome on the PC opens a 'Save as' window with your file name (pick a folder), or downloads the file. Cancel the window once: no error text should appear, only a 'cancelled' message." -ForegroundColor Cyan
Write-Host "  7. Open the saved PDF in a viewer and check: a colourful header band, the date, the totals, one card per course with the bar and stars (stars are drawn shapes, not letters), page number at the bottom." -ForegroundColor Cyan
Write-Host "  8. GUJARATI: if a course title or your profile name is in Gujarati, check the joined letters (conjuncts like ક્ષ જ્ઞ ત્ર, reph, vowel signs) look like the same text on the web page. Select some text with the mouse and Ctrl+C: it is real text, not a picture. Your email and phone number must NOT be in the PDF." -ForegroundColor Cyan
Write-Host "  9. Many courses (only if you have about 8 or more courses with activity): the PDF should continue on a second page, no card cut in half, nothing outside the margins. With only the sample courses this cannot be seen: say 'skip'." -ForegroundColor Cyan
Write-Host " 10. Keyboard (PC): Tab through the Report screen (scope buttons, file name, Create PDF, Back). Press Enter on Create PDF with the keyboard and TELL CLAUDE where the focus is afterwards (the button is disabled while busy, then becomes Save): can you press Tab or Enter again, or did the focus vanish?" -ForegroundColor Cyan
Write-Host " 11. Look at light and dark (Settings, or the Windows theme if there is no switch): all texts, bars and stars on the Report screen are readable in both." -ForegroundColor Cyan
Write-Host " 12. Make the window narrow (about 360 px wide; Chrome: F12, then Ctrl+Shift+M): no sideways scroll, nothing overlaps, a long Gujarati course title wraps, the buttons are easy to hit." -ForegroundColor Cyan
Write-Host " 13. ON THE PHONE (link from p04-phone.ps1): open Report, Create PDF, Save: the phone's share sheet (or a download) appears with your file name; open the PDF there: Gujarati letters correct, colours, no overlap." -ForegroundColor Cyan
Write-Host "Tell Claude (in Gujarati is fine) what looks wrong, or say 'all good'." -ForegroundColor Cyan
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
npm run preview -- --host localhost --port 4173 --strictPort
