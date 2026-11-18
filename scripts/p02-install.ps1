# p02-install.ps1 - phase P02 T1: installs the icon library and re-runs the full check.
# Run:  .\run.cmd p02-install.ps1

function Step($label, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host (">>> " + $label) -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("FAILED: " + $label + " (exit code " + $LASTEXITCODE + ")") -ForegroundColor Red
    exit 1
  }
}

Step "Install lucide-react (icons, ISC license)" { npm install lucide-react }

Write-Host ""
Write-Host ">>> Installed version" -ForegroundColor Cyan
npm ls lucide-react react

Step "Full check (types, module boundaries, lint, tests)" { npm run check }

Write-Host ""
Write-Host "P02 install + check finished OK." -ForegroundColor Green
exit 0
