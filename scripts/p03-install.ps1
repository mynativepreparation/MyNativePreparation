# p03-install.ps1 - phase P03 T1: installs the local database (Dexie) and its test helper, then re-runs the full check.
# Run:  .\run.cmd p03-install.ps1

function Step($label, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host (">>> " + $label) -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("FAILED: " + $label + " (exit code " + $LASTEXITCODE + ")") -ForegroundColor Red
    exit 1
  }
}

Step "Install dexie (IndexedDB wrapper, Apache-2.0)" { npm install dexie }
Step "Install fake-indexeddb (tests only, MIT)" { npm install --save-dev fake-indexeddb }

Write-Host ""
Write-Host ">>> Installed versions" -ForegroundColor Cyan
npm ls dexie fake-indexeddb

Step "Full check (types, module boundaries, lint, tests)" { npm run check }

Write-Host ""
Write-Host "P03 install + check finished OK." -ForegroundColor Green
exit 0
