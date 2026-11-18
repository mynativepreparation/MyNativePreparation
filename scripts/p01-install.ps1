# p01-install.ps1 - phase P01: installs the npm packages, makes placeholder icons, runs git init and the full check.
# Run:  .\run.cmd p01-install.ps1
# Needs Node.js + Git (see check-env.ps1). Takes a few minutes the first time.

function Step($label, [scriptblock]$cmd) {
  Write-Host ""
  Write-Host (">>> " + $label) -ForegroundColor Cyan
  & $cmd
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("FAILED: " + $label + " (exit code " + $LASTEXITCODE + ")") -ForegroundColor Red
    exit 1
  }
}

foreach ($tool in @('node', 'npm', 'git')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Host ("Missing tool: " + $tool + ". Run  .\run.cmd setup-tools.ps1  first.") -ForegroundColor Red
    exit 1
  }
}

Write-Host ("Node " + (node --version) + ", npm " + (npm --version) + ", " + (git --version))

Step "Install runtime packages" { npm install react react-dom react-router-dom zustand dexie }

Step "Install build, test and lint tools" {
  npm install -D typescript vite @vitejs/plugin-react vite-plugin-pwa vitest jsdom `
    @testing-library/react @testing-library/jest-dom @types/react @types/react-dom @types/node `
    eslint @eslint/js typescript-eslint globals prettier
}

Step "Create placeholder app icons" { npm run icons }

if (-not (Test-Path '.git')) {
  Step "git init" { git init }
}

Step "Full check (types, module boundaries, lint, tests)" { npm run check }

Write-Host ""
Write-Host "P01 install + check finished OK." -ForegroundColor Green
exit 0
