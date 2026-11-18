# setup-tools.ps1 - installs ONLY what is missing (Node.js LTS, Git) using winget.
# Windows may show a permission (UAC) popup: click Yes.
# Run:  .\run.cmd setup-tools.ps1

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Has 'winget')) {
  Write-Host "winget was not found. Install 'App Installer' from the Microsoft Store, then run this again." -ForegroundColor Red
  exit 1
}

$todo = @()
if (-not (Has 'node')) { $todo += 'OpenJS.NodeJS.LTS' }
if (-not (Has 'git'))  { $todo += 'Git.Git' }

if ($todo.Count -eq 0) {
  Write-Host "Node.js and Git are already installed. Nothing to do." -ForegroundColor Green
  exit 0
}

foreach ($id in $todo) {
  Write-Host ("Installing " + $id + " ...") -ForegroundColor Cyan
  winget install -e --id $id --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("winget failed for " + $id + " (exit code " + $LASTEXITCODE + ")") -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "Installed. Now run again:  .\run.cmd check-env.ps1  (it should show all [OK])." -ForegroundColor Yellow
exit 0
