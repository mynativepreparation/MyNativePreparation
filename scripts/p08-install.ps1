# p08-install.ps1 - P08 T3: installs the PDF stack that the T2 spike tested (DECISIONS Q21) into the MAIN package.json, pinned exactly.
# Same supply-chain rules as p06-install.ps1: exact versions (no ^ or ~), at least 14 days old, MIT licence, npm audit afterwards.
# The versions are NOT "newest": they are the versions the spike proved to shape Gujarati correctly.
# Run:  .\run.cmd p08-install.ps1

$ErrorActionPreference = 'Continue'

$wanted = @(
  @{ Name = 'pdf-lib'; Version = '1.17.1' },
  @{ Name = '@pdf-lib/fontkit'; Version = '1.1.1' },
  @{ Name = 'regenerator-runtime'; Version = '0.14.1' }
)
$cutoff = (Get-Date).ToUniversalTime().AddDays(-14)
$specs = @()

foreach ($w in $wanted) {
  $spec = $w.Name + '@' + $w.Version
  Write-Host (">>> checking " + $spec) -ForegroundColor Cyan

  $raw = npm view $w.Name time --json
  if ($LASTEXITCODE -ne 0 -or -not $raw) {
    Write-Host ("Could not read the version dates of " + $w.Name + " from npm.") -ForegroundColor Red
    exit 1
  }
  $times = ($raw -join "`n") | ConvertFrom-Json
  $stamp = $times.($w.Version)
  if (-not $stamp) {
    Write-Host ($spec + " does not exist on npm.") -ForegroundColor Red
    exit 1
  }
  $published = ([datetime]$stamp).ToUniversalTime()
  Write-Host ("  published " + $published.ToString('yyyy-MM-dd'))
  if ($published -gt $cutoff) {
    Write-Host "  younger than 14 days: NOT installed." -ForegroundColor Red
    exit 1
  }

  $licence = (npm view $spec license | Select-Object -First 1)
  Write-Host ("  licence: " + $licence)
  if ($licence -ne 'MIT') {
    Write-Host "  licence is not MIT: NOT installed (ask the owner)." -ForegroundColor Red
    exit 1
  }
  $specs += $spec
}

Write-Host ""
Write-Host (">>> npm install " + ($specs -join ' ') + " --save-exact") -ForegroundColor Cyan
npm install @specs --save-exact
if ($LASTEXITCODE -ne 0) {
  Write-Host "npm install failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ">>> package.json lines (must be exact versions, no ^ or ~)" -ForegroundColor Cyan
foreach ($w in $wanted) {
  Select-String -Path package.json -Pattern $w.Name -SimpleMatch | ForEach-Object { Write-Host ("  " + $_.Line.Trim()) }
}
npm ls pdf-lib '@pdf-lib/fontkit' regenerator-runtime --depth=0
Write-Host ""
npm audit --omit=dev
Write-Host ("npm audit exit code: " + $LASTEXITCODE + " (0 = none found)")
Write-Host ""
Write-Host "INSTALL OK." -ForegroundColor Green
exit 0
