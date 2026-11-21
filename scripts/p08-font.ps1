# p08-font.ps1 - P08 T1: copies the Noto Sans Gujarati font files (SIL OFL 1.1) into public\fonts\ for the Report PDF.
# Source: npm package @fontsource/noto-sans-gujarati, newest STABLE version that is at least 14 days old
# (same supply-chain rule as the other packages; DECISIONS Q19/Q20). The package is only DOWNLOADED with `npm pack`
# into a temp folder (no install, no scripts run) and is NOT added to package.json; only font files and the licence are copied.
# Run:  .\run.cmd p08-font.ps1

$ErrorActionPreference = 'Continue'
$name = '@fontsource/noto-sans-gujarati'
$root = (Get-Location).Path
$tmp = Join-Path $root 'logs\p08-font-tmp'
$dest = Join-Path $root 'public\fonts'

# 1. pick the version
$raw = npm view $name time --json
if ($LASTEXITCODE -ne 0 -or -not $raw) {
  Write-Host "Could not read the version dates from npm." -ForegroundColor Red
  exit 1
}
$times = ($raw -join "`n") | ConvertFrom-Json
$stable = @($times.PSObject.Properties |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
  ForEach-Object { [pscustomobject]@{ Name = $_.Name; Version = [version]$_.Name; Published = ([datetime]$_.Value).ToUniversalTime() } })

Write-Host ">>> newest stable versions of $name (UTC publish date)" -ForegroundColor Cyan
$stable | Sort-Object Version -Descending | Select-Object -First 6 | ForEach-Object {
  Write-Host ("  " + $_.Name + "   " + $_.Published.ToString('yyyy-MM-dd HH:mm'))
}
$cutoff = (Get-Date).ToUniversalTime().AddDays(-14)
$pick = $stable | Where-Object { $_.Published -le $cutoff } | Sort-Object Version | Select-Object -Last 1
if (-not $pick) {
  Write-Host "No stable version is older than 14 days. Nothing copied." -ForegroundColor Red
  exit 1
}
Write-Host ("Chosen (newest that is at least 14 days old): " + $pick.Name) -ForegroundColor Green

# 2. download the tarball into a temp folder and unpack it
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
Push-Location $tmp
npm pack ($name + '@' + $pick.Name)
$packExit = $LASTEXITCODE
Pop-Location
if ($packExit -ne 0) {
  Write-Host "npm pack failed." -ForegroundColor Red
  exit 1
}
$tgz = Get-ChildItem $tmp -Filter '*.tgz' | Select-Object -First 1
if (-not $tgz) {
  Write-Host "No .tgz found after npm pack." -ForegroundColor Red
  exit 1
}
tar -xzf $tgz.FullName -C $tmp
if ($LASTEXITCODE -ne 0) {
  Write-Host "tar could not unpack the package." -ForegroundColor Red
  exit 1
}
$pkgDir = Join-Path $tmp 'package'

# 3. licence check (the font must be OFL 1.1 and the licence text must be kept)
$pkgJson = Get-Content (Join-Path $pkgDir 'package.json') -Raw | ConvertFrom-Json
Write-Host ("Package licence field: " + $pkgJson.license)
if ($pkgJson.license -ne 'OFL-1.1') {
  Write-Host "Unexpected licence (expected OFL-1.1). Nothing copied." -ForegroundColor Red
  exit 1
}
$licenceFile = Get-ChildItem $pkgDir -File | Where-Object { $_.Name -like 'LICENSE*' } | Select-Object -First 1
if (-not $licenceFile) {
  Write-Host "No LICENSE file inside the package. Nothing copied." -ForegroundColor Red
  exit 1
}

# 4. pick the font files: gujarati + latin subsets, weights 400 and 700, woff2 + woff
$filesDir = Join-Path $pkgDir 'files'
$wanted = @(Get-ChildItem $filesDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '-(gujarati|latin)-(400|700)-normal\.(woff2|woff)$' })
if ($wanted.Count -eq 0) {
  Write-Host "No matching font files found. First 40 names in the package 'files' folder:" -ForegroundColor Red
  Get-ChildItem $filesDir -File -ErrorAction SilentlyContinue | Select-Object -First 40 | ForEach-Object { Write-Host ("  " + $_.Name) }
  exit 1
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($f in $wanted) { Copy-Item $f.FullName (Join-Path $dest $f.Name) -Force }
Copy-Item $licenceFile.FullName (Join-Path $dest 'NotoSansGujarati-OFL.txt') -Force

$info = @(
  "Noto Sans Gujarati - font files for the Report PDF (P08).",
  ("Source: npm package " + $name + " version " + $pick.Name + " (published " + $pick.Published.ToString('yyyy-MM-dd') + "), downloaded " + (Get-Date -Format 'yyyy-MM-dd') + "."),
  "Licence: SIL Open Font License 1.1, full text in NotoSansGujarati-OFL.txt (it names the copyright holders).",
  "Subsets: gujarati and latin. Weights: 400 and 700. Formats: woff2 and woff."
)
Set-Content -Path (Join-Path $dest 'FONTS.txt') -Value $info -Encoding UTF8

# 5. clean up our own temp folder and report
Remove-Item $tmp -Recurse -Force

Write-Host ""
Write-Host ">>> public\fonts now holds" -ForegroundColor Cyan
Get-ChildItem $dest -File | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-55} {1,8:N1} KB" -f $_.Name, ($_.Length / 1KB)) }

Write-Host ""
Write-Host ">>> package.json / package-lock.json must be unchanged (nothing printed below = unchanged)" -ForegroundColor Cyan
git status --short package.json package-lock.json

$guj = @(Get-ChildItem $dest -File | Where-Object { $_.Name -match '-gujarati-(400|700)-normal\.woff2$' })
if ($guj.Count -lt 2) {
  Write-Host "Expected the gujarati 400 and 700 woff2 files, found fewer." -ForegroundColor Red
  exit 1
}
Write-Host "FONT COPY OK." -ForegroundColor Green
exit 0
