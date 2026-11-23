# p10-cleanup.ps1 - P10 T12: takes the OLD admin window out of src (facts: logs\p10-usage.txt, nothing that stays imports it).
# It MOVES the files to logs\p10-removed\ instead of deleting them: P10 is not committed yet, so git could not bring them back.
# SAFETY: first it reads every file that STAYS; if one still imports an old module or an old CSS file, it stops and moves NOTHING.
# Run:  .\run.cmd p10-cleanup.ps1      then:  .\run.cmd fast.ps1
# Undo (only if something broke):  Move-Item logs\p10-removed\* src\modules\admin\

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$adminPath = (Resolve-Path 'src\modules\admin').Path
$remove = @(
  'ChapterEditor.tsx', 'ChapterStrip.tsx', 'CourseEditor.tsx', 'CourseForm.tsx', 'BlockEditor.tsx', 'PasteArea.tsx', 'MarkedPreview.tsx',
  'BlockEditor.test.tsx', 'BlockEditor.paste.test.tsx', 'ChapterEditor.test.tsx', 'PasteArea.test.tsx',
  'CourseEditor.test.tsx', 'CourseEditor.problems.test.tsx', 'CourseEditor.testeditor.test.tsx', 'CourseEditor.window.test.tsx',
  'ChapterEditor.css', 'CourseWindow.css'
)
# BlockEditor.css STAYS: all 15 of its classes are used by code that stays.

# ---- 1. safety scan of everything that stays ----
$kept = @(Get-ChildItem -Path 'src' -Recurse -File -Include *.ts, *.tsx, *.css | Where-Object {
    -not ($_.DirectoryName -eq $adminPath -and ($remove -contains $_.Name))
  })

$parts = @()
foreach ($n in 'ChapterEditor', 'ChapterStrip', 'CourseEditor', 'CourseForm', 'BlockEditor', 'PasteArea', 'MarkedPreview') {
  $parts += ("['""][^'""]*/" + $n + "['""]")
}
foreach ($c in 'ChapterEditor.css', 'CourseWindow.css') {
  $parts += ("['""][^'""]*/" + [regex]::Escape($c) + "['""]")
}
$rx = '(' + ($parts -join '|') + ')'

$problems = @()
foreach ($f in $kept) {
  foreach ($h in @(Select-String -Path $f.FullName -Pattern $rx)) {
    $problems += ('  ' + $f.Name + ':' + $h.LineNumber + '   ' + $h.Line.Trim())
  }
}
Write-Host ("Safety scan: " + $kept.Count + " files that stay were read.")
if ($problems.Count -gt 0) {
  Write-Host "STOPPED: a file that stays still imports an old module or CSS file. NOTHING was moved:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host $_ -ForegroundColor Red }
  exit 1
}
Write-Host "Safety scan OK: nothing that stays imports the old window." -ForegroundColor Green

# ---- 2. move the old files to logs\p10-removed\ ----
$backup = Join-Path $root 'logs\p10-removed'
New-Item -ItemType Directory -Force -Path $backup | Out-Null
$moved = 0
foreach ($f in $remove) {
  $from = Join-Path $adminPath $f
  if (Test-Path -LiteralPath $from) {
    Move-Item -LiteralPath $from -Destination (Join-Path $backup $f) -Force
    Write-Host ("Moved:   " + $f) -ForegroundColor Green
    $moved++
  } else {
    Write-Host ("Missing: " + $f + " (already gone)") -ForegroundColor Yellow
  }
}
Write-Host ""
Write-Host ("Moved " + $moved + " of " + $remove.Count + " files to logs\p10-removed\ (logs is ignored by git).")
Write-Host "Next: .\run.cmd fast.ps1  (the typecheck names anything that was missed)." -ForegroundColor Cyan
exit 0
