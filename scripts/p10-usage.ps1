# p10-usage.ps1 - READ ONLY planning helper for P10 T12 (cleanup of the OLD admin window). It changes NOTHING.
# It answers two questions with facts from the disk (no guessing):
#   A. which files import the old window modules and the three old / shared CSS files (production files and tests listed apart)
#   B. which classes of BlockEditor.css and CourseWindow.css are still used by code that stays (the rules that must be MOVED before those files go)
# Run:  .\run.cmd p10-usage.ps1      (the full result is also written to logs\p10-usage.txt)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$out = New-Object System.Collections.Generic.List[string]
function Say([string]$line) { Write-Host $line; $out.Add($line) | Out-Null }

$all = Get-ChildItem -Path (Join-Path $root 'src') -Recurse -File -Include *.ts, *.tsx, *.css
$code = @($all | Where-Object { $_.Extension -ne '.css' })
$isTest = '\.test\.(ts|tsx)$'
$prodCode = @($code | Where-Object { $_.Name -notmatch $isTest })

Say '== A. who imports the old window modules (production files | number of test files) =='
foreach ($n in 'ChapterEditor', 'ChapterStrip', 'CourseEditor', 'CourseForm', 'BlockEditor', 'PasteArea', 'MarkedPreview', 'chapterName', 'TestImport') {
  $rx = "from\s+['""][^'""]*/" + [regex]::Escape($n) + "['""]"
  $hits = @($code | Where-Object { $_.BaseName -ne $n -and (Select-String -Path $_.FullName -Pattern $rx -Quiet) })
  $prod = (@($hits | Where-Object { $_.Name -notmatch $isTest } | ForEach-Object { $_.Name }) -join ', ')
  $tests = @($hits | Where-Object { $_.Name -match $isTest }).Count
  if ($prod -eq '') { $prod = '(none)' }
  Say ("{0} <- {1} | tests: {2}" -f $n, $prod, $tests)
}

Say ''
Say '== A2. who imports the CSS files =='
foreach ($c in 'BlockEditor.css', 'CourseWindow.css', 'ChapterEditor.css', 'CourseWorkspace.css', 'ChapterWindow.css') {
  $rx = "['""][^'""]*/" + [regex]::Escape($c) + "['""]"
  $hits = @($code | Where-Object { Select-String -Path $_.FullName -Pattern $rx -Quiet } | ForEach-Object { $_.Name })
  $list = ($hits -join ', ')
  if ($list -eq '') { $list = '(none)' }
  Say ("{0} <- {1}" -f $c, $list)
}

$oldFiles = 'ChapterEditor.tsx', 'ChapterStrip.tsx', 'CourseEditor.tsx', 'CourseForm.tsx', 'BlockEditor.tsx', 'PasteArea.tsx', 'MarkedPreview.tsx'
$remaining = @($prodCode | Where-Object { $oldFiles -notcontains $_.Name })
$cssDir = Join-Path $root 'src'
Say ''
Say ('== B. classes of the shared CSS files that code OUTSIDE the old set still uses (old set: ' + ($oldFiles -join ', ') + ') ==')
foreach ($css in 'BlockEditor.css', 'CourseWindow.css') {
  $path = (Get-ChildItem -Path $cssDir -Recurse -File -Filter $css | Select-Object -First 1).FullName
  $text = Get-Content -Path $path -Raw
  $classes = @([regex]::Matches($text, '\.(np-[A-Za-z0-9_-]+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
  $used = New-Object System.Collections.Generic.List[string]
  foreach ($c in $classes) {
    $rx = '(?<![\w-])' + [regex]::Escape($c) + '(?![\w-])'
    $by = @($remaining | Where-Object { Select-String -Path $_.FullName -Pattern $rx -Quiet } | ForEach-Object { $_.Name })
    if ($by.Count -gt 0) { $used.Add(("   {0} <- {1}" -f $c, ($by -join ', '))) | Out-Null }
  }
  Say ("{0}: {1} classes, {2} still used outside the old set" -f $css, $classes.Count, $used.Count)
  foreach ($line in $used) { Say $line }
}

Set-Content -Path (Join-Path $root 'logs\p10-usage.txt') -Value $out -Encoding UTF8
Write-Host ''
Write-Host 'Done. Nothing was changed. Result also in logs\p10-usage.txt' -ForegroundColor Green
