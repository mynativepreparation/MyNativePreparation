# p10-fonts.ps1 - P10 T11c: font files for the three reader font types (DECISIONS Q25), all SIL Open Font License 1.1.
#   sans      = Noto Sans Gujarati   (files already in public\fonts from P08; this script only reads its CSS for the unicode ranges)
#   serif     = Noto Serif Gujarati  (NEW: woff2 files copied)
#   humanist  = Hind Vadodara        (NEW: woff2 files copied)
# Source: the @fontsource npm packages, newest STABLE version that is at least 14 days old (same supply-chain rule as p08-font.ps1).
# The packages are only DOWNLOADED with `npm pack` into logs\p10-fonts-tmp (no install, no scripts run) and are NOT added to package.json.
# Copies: gujarati + latin subsets, weights 400 and 700, woff2 only, into public\fonts\, with the licence texts.
# Writes:  src\core\ui\fonts.css  (@font-face rules with font-display: swap and the unicode-range of each subset, read from the package CSS)
# Needs internet. Run:  .\run.cmd p10-fonts.ps1

$ErrorActionPreference = 'Continue'
$root = (Get-Location).Path
$tmpRoot = Join-Path $root 'logs\p10-fonts-tmp'
$dest = Join-Path $root 'public\fonts'
$cssOut = Join-Path $root 'src\core\ui\fonts.css'

$families = @(
  @{ Package = '@fontsource/noto-sans-gujarati';  Licence = $null;                       Copy = $false; Ext = 'woff'  },
  @{ Package = '@fontsource/noto-serif-gujarati'; Licence = 'NotoSerifGujarati-OFL.txt'; Copy = $true;  Ext = 'woff2' },
  @{ Package = '@fontsource/hind-vadodara';       Licence = 'HindVadodara-OFL.txt';      Copy = $true;  Ext = 'woff2' }
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

# Reads the @font-face blocks of 400.css and 700.css and returns the gujarati / latin ones with their unicode-range.
function Get-FaceBlocks {
  param([string]$PkgDir)

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
      if ($fileName -notmatch '-(gujarati|latin)-(400|700)-normal$') { continue }
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

if (Test-Path $tmpRoot) { Remove-Item $tmpRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tmpRoot | Out-Null
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# 0. the sans files from P08 must be there (the reader uses the same .woff files that are already cached for the PDF)
foreach ($need in @('noto-sans-gujarati-gujarati-400-normal.woff', 'noto-sans-gujarati-gujarati-700-normal.woff', 'noto-sans-gujarati-latin-400-normal.woff', 'noto-sans-gujarati-latin-700-normal.woff')) {
  if (-not (Test-Path (Join-Path $dest $need))) {
    Write-Host "Missing $need in public\fonts (P08 font files). Nothing changed." -ForegroundColor Red
    exit 1
  }
}

# 1. download, check, parse
Write-Host ">>> packages (newest stable version that is at least 14 days old)" -ForegroundColor Cyan
$allFaces = @()
$infoLines = @(
  "Reader fonts (P10 T11c) - three font types for text blocks. All SIL Open Font License 1.1.",
  "Noto Sans Gujarati: files from P08, see FONTS.txt (the reader uses the .woff files).",
  "The other two: woff2 only, gujarati + latin subsets, weights 400 and 700. src\core\ui\fonts.css is generated by scripts\p10-fonts.ps1."
)
$copied = @()
foreach ($fam in $families) {
  $pkg = Get-FontPackage -Name $fam.Package -TmpRoot $tmpRoot
  if (-not $pkg) { exit 1 }

  $faces = @(Get-FaceBlocks -PkgDir $pkg.Dir)
  if ($faces.Count -eq 0) {
    Write-Host ("No gujarati / latin @font-face blocks found in 400.css / 700.css of " + $fam.Package + ". CSS files in the package:") -ForegroundColor Red
    Get-ChildItem $pkg.Dir -Filter '*.css' | Select-Object -First 30 | ForEach-Object { Write-Host ("  " + $_.Name) }
    exit 1
  }
  foreach ($f in $faces) { $f | Add-Member -NotePropertyName Ext -NotePropertyValue $fam.Ext }
  $allFaces += $faces

  if ($fam.Copy) {
    $filesDir = Join-Path $pkg.Dir 'files'
    foreach ($f in $faces) {
      $src = Join-Path $filesDir ($f.File + '.woff2')
      if (-not (Test-Path $src)) {
        Write-Host ("Package file missing: " + $f.File + ".woff2") -ForegroundColor Red
        exit 1
      }
      Copy-Item $src (Join-Path $dest ($f.File + '.woff2')) -Force
      $copied += ($f.File + '.woff2')
    }
    $licence = Get-ChildItem $pkg.Dir -File | Where-Object { $_.Name -like 'LICENSE*' } | Select-Object -First 1
    if (-not $licence) {
      Write-Host ("No LICENSE file inside " + $fam.Package + ". Stopping.") -ForegroundColor Red
      exit 1
    }
    Copy-Item $licence.FullName (Join-Path $dest $fam.Licence) -Force
    $infoLines += ($fam.Package + " version " + $pkg.Version + " (published " + $pkg.Published.ToString('yyyy-MM-dd') + "), downloaded " + (Get-Date -Format 'yyyy-MM-dd') + ". Licence text: " + $fam.Licence)
  }
}
Set-Content -Path (Join-Path $dest 'FONTS-reader.txt') -Value $infoLines -Encoding UTF8

# 2. every file that the CSS will point at must exist
foreach ($f in $allFaces) {
  $path = Join-Path $dest ($f.File + '.' + $f.Ext)
  if (-not (Test-Path $path)) {
    Write-Host ("Expected file is missing: " + $path) -ForegroundColor Red
    exit 1
  }
}

# 3. write the CSS (UTF-8 without BOM)
$css = New-Object System.Collections.Generic.List[string]
$css.Add('/* Reader fonts (P10 T11c, DECISIONS Q25). GENERATED by scripts\p10-fonts.ps1: do not edit by hand, run the script again. */')
$css.Add('/* The font files are in public/fonts (licences next to them). A font file is only downloaded when a text uses it. */')
$css.Add('')
foreach ($f in ($allFaces | Sort-Object Family, Weight, File)) {
  $css.Add('@font-face {')
  $css.Add("  font-family: '" + $f.Family + "';")
  $css.Add('  font-style: normal;')
  $css.Add('  font-weight: ' + $f.Weight + ';')
  $css.Add('  font-display: swap;')
  $css.Add("  src: url('/fonts/" + $f.File + '.' + $f.Ext + "') format('" + $f.Ext + "');")
  $css.Add('  unicode-range: ' + $f.Range + ';')
  $css.Add('}')
  $css.Add('')
}
[System.IO.File]::WriteAllText($cssOut, (($css -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

# 4. clean up our own temp folder and report
Remove-Item $tmpRoot -Recurse -Force

Write-Host ""
Write-Host ">>> NEW font files (woff2) and their size" -ForegroundColor Cyan
$total = 0
foreach ($name in ($copied | Sort-Object)) {
  $len = (Get-Item (Join-Path $dest $name)).Length
  $total += $len
  Write-Host ("  {0,-55} {1,8:N1} KB" -f $name, ($len / 1KB))
}
Write-Host ("  {0,-55} {1,8:N1} KB" -f 'TOTAL new woff2', ($total / 1KB)) -ForegroundColor Yellow
Write-Host ""
Write-Host ">>> font faces written to src\core\ui\fonts.css: " -NoNewline -ForegroundColor Cyan
Write-Host $allFaces.Count
$allFaces | Sort-Object Family, Weight, File | ForEach-Object { Write-Host ("  {0,-22} {1}  {2}.{3}" -f $_.Family, $_.Weight, $_.File, $_.Ext) }

Write-Host ""
Write-Host ">>> package.json / package-lock.json must be unchanged (nothing printed below = unchanged)" -ForegroundColor Cyan
git status --short package.json package-lock.json

Write-Host "FONTS OK." -ForegroundColor Green
exit 0
