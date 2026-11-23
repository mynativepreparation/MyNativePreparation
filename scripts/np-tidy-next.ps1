# np-tidy-next.ps1 - ONE-OFF: removes the finished T12 text from NEXT.md (a regex per line; every other line stays as it is).
# Run:  .\run.cmd np-tidy-next.ps1      (takes a second; each replacement only happens when it matches exactly ONE line)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$path = Join-Path $root 'NEXT.md'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$script:text = [IO.File]::ReadAllText($path, $utf8)
$before = $script:text.Length

function Swap([string]$pattern, [string]$replacement) {
  $rx = New-Object System.Text.RegularExpressions.Regex($pattern, 'Multiline')
  $count = $rx.Matches($script:text).Count
  if ($count -ne 1) {
    Write-Host ("SKIPPED (matches: " + $count + "): " + $pattern) -ForegroundColor Yellow
    return
  }
  $script:text = $rx.Replace($script:text, $replacement, 1)
  Write-Host ("Replaced: " + $pattern) -ForegroundColor Green
}

$updated = @'
Updated: 2026-11-23 (T12 DONE + COMMITTED: `df6188c` `P10: admin editor`; FULL check OK 173 files, 2863 tests; build OK, JS 718.74 KB gzip; npm audit 0) by Claude.  ACTIVE phase: **P10 Admin editor** (`docs/phases/P10-admin.md`). T11i-T11q, T11u-T11w and T12 are DONE, VERIFIED and TICKED. Remaining: owner request **Q27** (tests per course) = **T11r-T11t**, then **T13** (phase end; read its text in the phase file). The window was REBUILT from the owner's TWO MOCK-UP IMAGES (DECISIONS Q26, tail).
'@

$doNow = @'
**NEXT = Q27 / T11r (the first of T11r-T11t).** Ask the owner whether to start (a plain 'go ahead' = T11r). Then read DECISIONS Q27 (tail only: `edit_file` with `dryRun`, or `head` / `tail`) and the T11r-T11t lines of `docs/phases/P10-admin.md` (head 40 = the task list, the Log is at the end). Q27 needs a SECOND small commit before T13: copy `scripts/p10-commit.ps1`, change the message. `logs\p10-removed\` holds the OLD admin window (17 files kept as a backup, the 8 old tests renamed `*.test.tsx.bak`; it is ignored by git): delete it only when the owner says so.
'@

$committed = @'
- COMMITTED: everything up to and including T12 is in `df6188c` (`P10: admin editor`). Only bookkeeping edits (this file, the P10 Log) come after it.
'@

$oldWindow = @'
- The OLD admin window (`CourseEditor`, `ChapterEditor`, `ChapterStrip`, `CourseForm`, `BlockEditor.tsx`, `PasteArea`, `MarkedPreview`, `ChapterEditor.css`, `CourseWindow.css`) is GONE from `src` (T12, committed). `BlockEditor.css` STAYS (used by `CoverField`, `TestEditor`, `TestImport`, `CourseWorkspace`, `ChapterList`); the shared picture helpers are in `modules/admin/imageFile.ts` (`IMAGE_ERROR_TEXT`, `readBytes`) and `imageUrl.ts` (`imageToDataUrl`); the chapter-list rules are in `modules/admin/ChapterList.css`.
'@

$leftovers = @'
- Leftovers (never auto-delete; ask the owner before removing): 16 `fingerprint.*` keys + `toast.dismiss` in `en.json` look unused; `core/identity/handover.ts` + `handover.test.ts` and `modules/onboarding/FingerprintScreen.tsx` came from an old P04 session and look unrouted (an old note said "no .css, no test", but the disk showed `FingerprintScreen.css` and `.test.tsx` next to it on 2026-11-21: CHECK on disk before judging).
'@

Swap '^Updated: 2026-11-23 \(T12 step 3b[^\r\n]*' $updated
Swap '^\*\*T12 Cleanup \+ commit[^\r\n]*' $doNow
Swap '^T12 \(delete the old window files ONLY[^\r\n]*(\r?\n)+' ''
Swap '^- No longer reached from the app[^\r\n]*' $oldWindow
Swap '^- UNCOMMITTED \(go into the P10 commit\)[^\r\n]*' $committed
Swap '^- Old window files go in T12[^\r\n]*\r?\n' ''
Swap '^- Leftovers \(never auto-delete\)[^\r\n]*' $leftovers

[IO.File]::WriteAllText($path, $script:text, $utf8)
Write-Host ("NEXT.md: " + $before + " -> " + $script:text.Length + " characters.") -ForegroundColor Cyan
exit 0
