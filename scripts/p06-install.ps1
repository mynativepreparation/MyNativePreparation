# p06-install.ps1 - P06 T1: installs react-zoom-pan-pinch at the newest STABLE version that is at least 14 days old, pinned exactly
# (same supply-chain rule as @scure/bip39 in P04; DECISIONS Q17). Prints the newest versions with their publish dates first.
# Run:  .\run.cmd p06-install.ps1

$ErrorActionPreference = 'Continue'
$name = 'react-zoom-pan-pinch'

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
  Write-Host "No stable version is older than 14 days. Nothing installed." -ForegroundColor Red
  exit 1
}
Write-Host ("Chosen (newest that is at least 14 days old): " + $pick.Name) -ForegroundColor Green

npm install ($name + '@' + $pick.Name) --save-exact
if ($LASTEXITCODE -ne 0) {
  Write-Host "npm install failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ">>> package.json line (must be an exact version, no ^ or ~)" -ForegroundColor Cyan
Select-String -Path package.json -Pattern $name | ForEach-Object { Write-Host ("  " + $_.Line.Trim()) }
npm ls $name --depth=0
Write-Host ""
npm audit --omit=dev
Write-Host ("npm audit exit code: " + $LASTEXITCODE + " (0 = none found)")
exit 0
