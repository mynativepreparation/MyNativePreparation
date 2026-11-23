# p10-fonts2.ps1 - P10 T11p: 13 more reader fonts (DECISIONS Q26 c; the owner chose the list on 22 Nov), all SIL Open Font License 1.1.
#   Gujarati : Baloo Bhai 2, Mukta Vaani, Rasa, Kumar One (display: headings only)
#   Hindi    : Noto Sans Devanagari, Noto Serif Devanagari, Martel, Kalam   (Devanagari script: Hindi, Marathi, Sanskrit)
#   English  : Inter, Merriweather, Lexend, Atkinson Hyperlegible, Caveat
# Same method as p10-fonts.ps1: the @fontsource npm packages (newest STABLE version that is at least 14 days old) are only DOWNLOADED with
# `npm pack` into logs\p10-fonts2-tmp (no install, no scripts run) and are NOT added to package.json.
# Copies only woff2 files of the needed subsets (Gujarati / Devanagari + Latin, or Latin only) and the weights 400 and 700 where the package has
# them, into public\fonts\, with the licence texts. A family that cannot be downloaded or checked is SKIPPED (nothing of it is copied) and
# listed at the end, so one missing package never blocks the others.
# Writes src\core\ui\fonts.css again: the 12 existing @font-face blocks of the three Gujarati families (kept exactly as they are) + the blocks
# of the new families. Running this script twice is safe (the new blocks are rebuilt each time).
# Order: p10-fonts.ps1 first (it was run in T11c); this script stops if the 12 old blocks are not in fonts.css. Do NOT run p10-fonts.ps1 after
# this one: it rewrites the whole file and the new families would disappear from the CSS (run this script again then).
# Needs internet, takes a few minutes. Run:  .\run.cmd p10-fonts2.ps1

$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
$tmpRoot = Join-Path $root 'logs\p10-fonts2-tmp'
$dest = Join-Path $root 'public\fonts'
$cssPath = Join-Path $root 'src\core\ui\fonts.css'
$infoPath = Join-Path $dest 'FONTS-reader.txt'

$oldFamilies = @('Hind Vadodara', 'Noto Sans Gujarati', 'Noto Serif Gujarati')

$families = @(
  @{ Name = 'Baloo Bhai 2';          Language = 'gu'; Package = '@fontsource/baloo-bhai-2';          Licence = 'BalooBhai2-OFL.txt';           Subsets = @('gujarati', 'latin') },
  @{ Name = 'Mukta Vaani';           Language = 'gu'; Package = '@fontsource/mukta-vaani';           Licence = 'MuktaVaani-OFL.txt';           Subsets = @('gujarati', 'latin') },
  @{ Name = 'Rasa';                  Language = 'gu'; Package = '@fontsource/rasa';                  Licence = 'Rasa-OFL.txt';                 Subsets = @('gujarati', 'latin') },
  @{ Name = 'Kumar One';             Language = 'gu'; Package = '@fontsource/kumar-one';             Licence = 'KumarOne-OFL.txt';             Subsets = @('gujarati', 'latin') },
  @{ Name = 'Noto Sans Devanagari';  Language = 'hi'; Package = '@fontsource/noto-sans-devanagari';  Licence = 'NotoSansDevanagari-OFL.txt';   Subsets = @('devanagari', 'latin') },
  @{ Name = 'Noto Serif Devanagari'; Language = 'hi'; Package = '@fontsource/noto-serif-devanagari'; Licence = 'NotoSerifDevanagari-OFL.txt';  Subsets = @('devanagari', 'latin') },
  @{ Name = 'Martel';                Language = 'hi'; Package = '@fontsource/martel';                Licence = 'Martel-OFL.txt';               Subsets = @('devanagari', 'latin') },
  @{ Name = 'Kalam';                 Language = 'hi'; Package = '@fontsource/kalam';                 Licence = 'Kalam-OFL.txt';                Subsets = @('devanagari', 'latin') },
  @{ Name = 'Inter';                 Language = 'en'; Package = '@fontsource/inter';                 Licence = 'Inter-OFL.txt';                Subsets = @('latin') },
  @{ Name = 'Merriweather';          Language = 'en'; Package = '@fontsource/merriweather';          Licence = 'Merriweather-OFL.txt';         Subsets = @('latin') },
  @{ Name = 'Lexend';                Language = 'en'; Package = '@fontsource/lexend';                Licence = 'Lexend-OFL.txt';               Subsets = @('latin') },
  @{ Name = 'Atkinson Hyperlegible'; Language = 'en'; Package = '@fontsource/atkinson-hyperlegible'; Licence = 'AtkinsonHyperlegible-OFL.txt'; Subsets = @('latin') },
  @{ Name = 'Caveat';                Language = 'en'; Package = '@fontsource/caveat';                Licence = 'Caveat-OFL.txt';               Subsets = @('latin') }
)

# Downloads one package and returns @{ Name; Version; Published; Dir } or $null (after printing why).
function Get-FontPackage {
  param([string]$Name, [string]$TmpRoot)

  $raw = npm view $Name time --json
  if ($LASTEXITCODE -ne 0 -or -not $raw) {
    Write-Host "Could not read the version dates of $Name from npm." -ForegroundColor Red
    return $null
  }
  $times = ($raw -join "`n") | ConvertFrom-Json
  $stable = @($times.PSObject.Properties |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
    ForEach-Object { [pscustomobject]@{ Name = $_.Name; Version = [version]$_.Name; Published = ([datetime]$_.Value).ToUniversalTime() } })
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-14)
  $pick = $stable | Where-Object { $_.Published -le $cutoff } | Sort-Object Version | Select-Object -Last 1
  if (-not $pick) {
    Write-Host "$Name has no stable version that is at least 14 days old." -ForegroundColor Red
    return $null
  }
  Write-Host ("  " + $Name + "  chosen " + $pick.Name + "  (published " + $pick.Published.ToString('yyyy-MM-dd') + ")") -ForegroundColor Green

  $dir = Join-Path $TmpRoot ($Name -replace '[@/]', '_')
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  Push-Location $dir
  npm pack ($Name + '@' + $pick.Name) | Out-Null
  $packExit = $LASTEXITCODE
  Pop-Location
  if ($packExit -ne 0) {
    Write-Host "npm pack failed for $Name." -ForegroundColor Red
    return $null
  }
  $tgz = Get-ChildItem $dir -Filter '*.tgz' | Select-Object -First 1
  if (-not $tgz) {
    Write-Host "No .tgz found after npm pack for $Name." -ForegroundColor Red
    return $null
  }
  tar -xzf $tgz.FullName -C $dir
  if ($LASTEXITCODE -ne 0) {
    Write-Host "tar could not unpack $Name." -ForegroundColor Red
    return $null
  }
  $pkgDir = Join-Path $dir 'package'
  $pkgJson = Get-Content (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json
  Write-Host ("    licence field: " + $pkgJson.license)
  if ($pkgJson.license -ne 'OFL-1.1') {
    Write-Host "Unexpected licence for $Name (expected OFL-1.1). Nothing copied." -ForegroundColor Red
    return $null
  }
  return [pscustomobject]@{ Name = $Name; Version = $pick.Name; Published = $pick.Published; Dir = $pkgDir }
}

# Reads the @font-face blocks of 400.css and 700.css and returns the ones of the wanted subsets with their unicode-range.
function Get-FaceBlocks {
  param([string]$PkgDir, [string[]]$Subsets)

  $pattern = '-(' + ($Subsets -join '|') + ')-(400|700)-normal$'
  $found = @()
  foreach ($weight in @('400', '700')) {
    $cssFile = Join-Path $PkgDir ($weight + '.css')
    if (-not (Test-Path $cssFile)) { continue }
    $text = Get-Content $cssFile -Raw
    foreach ($m in [regex]::Matches($text, '@font-face\s*\{(.*?)\}', 'Singleline')) {
      $body = $m.Groups[1].Value
      $family = [regex]::Match($body, "font-family:\s*'([^']+)'")
      $src = [regex]::Match($body, 'url\([''"]?\./files/([^)''"]+?)\.woff2[''"]?\)')
      $range = [regex]::Match($body, 'unicode-range:\s*([^;]+);')
      if (-not ($family.Success -and $src.Success -and $range.Success)) { continue }
      $fileName = $src.Groups[1].Value
      if ($fileName -notmatch $pattern) { continue }
      $found += [pscustomobject]@{
        Family = $family.Groups[1].Value
        Weight = [int]$weight
        File   = $fileName
        Range  = ($range.Groups[1].Value.Trim() -replace '\s+', ' ')
      }
    }
  }
  return $found
}

# 0. fonts.css from T11c must be there with its 12 blocks (3 families x 2 subsets x 2 weights); they are kept as they are
if (-not (Test-Path $cssPath)) {
  Write-Host "src\core\ui\fonts.css is missing. Run .\run.cmd p10-fonts.ps1 first. Nothing changed." -ForegroundColor Red
  exit 1
}
$existing = Get-Content $cssPath -Raw
$oldBlocks = @()
foreach ($m in [regex]::Matches($existing, '@font-face\s*\{.*?\}', 'Singleline')) {
  $fam = [regex]::Match($m.Value, "font-family:\s*'([^']+)'")
  if ($fam.Success -and ($oldFamilies -contains $fam.Groups[1].Value)) { $oldBlocks += $m.Value }
}
if ($oldBlocks.Count -ne 12) {
  Write-Host ("fonts.css has " + $oldBlocks.Count + " blocks of the three Gujarati families, expected 12. Nothing changed. Run .\run.cmd p10-fonts.ps1 first.") -ForegroundColor Red
  exit 1
}

if (Test-Path $tmpRoot) { Remove-Item $tmpRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tmpRoot | Out-Null
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# 1. download, check, copy (one family at a time; a failure skips only that family)
Write-Host ">>> packages (newest stable version that is at least 14 days old)" -ForegroundColor Cyan
$allFaces = @()
$copied = @()
$done = @()
$skipped = @()
$summary = @()
$infoLines = @(
  "T11p - more reader fonts, all SIL Open Font License 1.1. woff2 only, weights 400 and 700 where the package has them. Generated by scripts\p10-fonts2.ps1."
)
foreach ($fam in $families) {
  Write-Host ("--- " + $fam.Name + "  (" + $fam.Language + ")") -ForegroundColor Cyan

  $pkg = Get-FontPackage -Name $fam.Package -TmpRoot $tmpRoot
  if (-not $pkg) { $skipped += ($fam.Name + ': download or licence check failed (see the lines above)'); continue }

  $faces = @(Get-FaceBlocks -PkgDir $pkg.Dir -Subsets $fam.Subsets)
  if ($faces.Count -eq 0) {
    Write-Host ("No @font-face blocks for the subsets (" + ($fam.Subsets -join ', ') + ") in 400.css / 700.css of " + $fam.Package + ". CSS files in the package:") -ForegroundColor Red
    Get-ChildItem $pkg.Dir -Filter '*.css' | Select-Object -First 20 | ForEach-Object { Write-Host ("  " + $_.Name) }
    $skipped += ($fam.Name + ': no matching @font-face blocks')
    continue
  }

  $filesDir = Join-Path $pkg.Dir 'files'
  $missing = @($faces | Where-Object { -not (Test-Path (Join-Path $filesDir ($_.File + '.woff2'))) })
  if ($missing.Count -gt 0) {
    Write-Host ("Package file missing: " + $missing[0].File + ".woff2") -ForegroundColor Red
    $skipped += ($fam.Name + ': a woff2 file named in the CSS is not in the package')
    continue
  }
  $licence = Get-ChildItem $pkg.Dir -File | Where-Object { $_.Name -like 'LICENSE*' } | Select-Object -First 1
  if (-not $licence) {
    Write-Host ("No LICENSE file inside " + $fam.Package + ".") -ForegroundColor Red
    $skipped += ($fam.Name + ': no LICENSE file in the package')
    continue
  }

  $bytes = 0
  foreach ($f in $faces) {
    $target = Join-Path $dest ($f.File + '.woff2')
    Copy-Item (Join-Path $filesDir ($f.File + '.woff2')) $target -Force
    $copied += ($f.File + '.woff2')
    $bytes += (Get-Item $target).Length
  }
  Copy-Item $licence.FullName (Join-Path $dest $fam.Licence) -Force
  $allFaces += $faces
  $done += $fam.Name
  $weights = (($faces | ForEach-Object { $_.Weight } | Sort-Object -Unique) -join ',')
  $summary += [pscustomobject]@{ Family = $fam.Name; Language = $fam.Language; Weights = $weights; Files = $faces.Count; KB = [math]::Round($bytes / 1KB, 1) }
  $infoLines += ("T11p " + $fam.Package + " version " + $pkg.Version + " (published " + $pkg.Published.ToString('yyyy-MM-dd') + "), downloaded " + (Get-Date -Format 'yyyy-MM-dd') + ". Licence text: " + $fam.Licence)
}

if ($done.Count -eq 0) {
  if (Test-Path $tmpRoot) { Remove-Item $tmpRoot -Recurse -Force }
  Write-Host "No family could be downloaded. fonts.css and public\fonts were not changed." -ForegroundColor Red
  $skipped | ForEach-Object { Write-Host ("  SKIPPED " + $_) -ForegroundColor Red }
  exit 1
}

# 2. every file that the CSS will point at must exist
foreach ($f in $allFaces) {
  $path = Join-Path $dest ($f.File + '.woff2')
  if (-not (Test-Path $path)) {
    Write-Host ("Expected file is missing: " + $path) -ForegroundColor Red
    exit 1
  }
}

# 3. write the CSS (UTF-8 without BOM): the old blocks as they were, then the new ones
$css = New-Object System.Collections.Generic.List[string]
$css.Add('/* Reader fonts (P10 T11c + T11p, DECISIONS Q25 / Q26). GENERATED: scripts\p10-fonts.ps1 wrote the three Gujarati families, scripts\p10-fonts2.ps1 adds the others. Do not edit by hand, run the scripts again. */')
$css.Add('/* The font files are in public/fonts (licences next to them). A font file is only downloaded when a text uses it. */')
$css.Add('')
foreach ($block in $oldBlocks) {
  $css.Add($block)
  $css.Add('')
}
foreach ($f in ($allFaces | Sort-Object Family, Weight, File)) {
  $css.Add('@font-face {')
  $css.Add("  font-family: '" + $f.Family + "';")
  $css.Add('  font-style: normal;')
  $css.Add('  font-weight: ' + $f.Weight + ';')
  $css.Add('  font-display: swap;')
  $css.Add("  src: url('/fonts/" + $f.File + ".woff2') format('woff2');")
  $css.Add('  unicode-range: ' + $f.Range + ';')
  $css.Add('}')
  $css.Add('')
}
[System.IO.File]::WriteAllText($cssPath, (($css -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

# 4. the info file: keep the older lines, replace the T11p lines
$oldInfo = @()
if (Test-Path $infoPath) { $oldInfo = @(Get-Content $infoPath | Where-Object { $_ -notlike 'T11p*' }) }
Set-Content -Path $infoPath -Value ($oldInfo + $infoLines) -Encoding UTF8

# 5. clean up our own temp folder and report
Remove-Item $tmpRoot -Recurse -Force

Write-Host ""
Write-Host ">>> families downloaded: " -NoNewline -ForegroundColor Cyan
Write-Host ($done.Count.ToString() + " of " + $families.Count)
$summary | Format-Table -AutoSize | Out-String | Write-Host

Write-Host ">>> woff2 files copied to public\fonts (size)" -ForegroundColor Cyan
$total = 0
foreach ($name in ($copied | Sort-Object)) {
  $len = (Get-Item (Join-Path $dest $name)).Length
  $total += $len
  Write-Host ("  {0,-60} {1,8:N1} KB" -f $name, ($len / 1KB))
}
Write-Host ("  {0,-60} {1,8:N1} KB" -f 'TOTAL new woff2', ($total / 1KB)) -ForegroundColor Yellow
Write-Host "  (the woff2 files are NOT precached; they are downloaded the first time a text uses them and then kept by the runtime cache rule in vite.config.ts)"

Write-Host ""
Write-Host ">>> font faces in src\core\ui\fonts.css: " -NoNewline -ForegroundColor Cyan
Write-Host ($oldBlocks.Count + $allFaces.Count)
$cssBytes = (Get-Item $cssPath).Length
Write-Host ("  fonts.css size: {0:N1} KB (this file IS precached)" -f ($cssBytes / 1KB))

if ($skipped.Count -gt 0) {
  Write-Host ""
  Write-Host ">>> SKIPPED families (nothing of them was copied)" -ForegroundColor Yellow
  $skipped | ForEach-Object { Write-Host ("  SKIPPED " + $_) -ForegroundColor Yellow }
}

Write-Host ""
Write-Host ">>> package.json / package-lock.json must be unchanged (nothing printed below = unchanged)" -ForegroundColor Cyan
git status --short package.json package-lock.json

Write-Host ("FONTS2 OK: " + $done.Count + " of " + $families.Count + " families.") -ForegroundColor Green
exit 0
