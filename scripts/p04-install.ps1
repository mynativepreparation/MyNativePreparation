# p04-install.ps1 - phase P04 T1: installs @scure/bip39 (12-word key) at the newest stable version that is at least 14 days old,
# pinned exactly, then re-runs the full check.
# Run:  .\run.cmd p04-install.ps1

function Step($label, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host (">>> " + $label) -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("FAILED: " + $label + " (exit code " + $LASTEXITCODE + ")") -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host ">>> Pick the newest @scure/bip39 version that is at least 14 days old" -ForegroundColor Cyan
$version = (node scripts\pick-version.mjs "@scure/bip39" 14 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
  Write-Host "FAILED: could not choose a version" -ForegroundColor Red
  exit 1
}
Write-Host ("Chosen version: " + $version)

Step "Install @scure/bip39 $version (MIT, audited), exact pin" { npm install --save-exact ("@scure/bip39@" + $version) }

Write-Host ""
Write-Host ">>> Installed version" -ForegroundColor Cyan
npm ls @scure/bip39

Step "Full check (types, module boundaries, lint, tests)" { npm run check }

Write-Host ""
Write-Host "P04 install + check finished OK." -ForegroundColor Green
exit 0
