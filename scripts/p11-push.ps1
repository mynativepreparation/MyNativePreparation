# p11-push.ps1 - P11 T10: put the project on GitHub (the first push). It uses YOUR OWN git login (Git Credential Manager); it never asks for or stores a token.
# Run (from the project folder, AFTER the P11 commit of task T12):  .\run.cmd p11-push.ps1
# It refuses to push while the work tree has uncommitted changes, so nothing half-done goes online.

$ErrorActionPreference = 'Continue'
$root   = Split-Path -Parent $PSScriptRoot
$remote = 'https://github.com/mynativepreparation/MyNativePreparation.git'
Set-Location -LiteralPath $root

function Stop-Here([string]$why) {
  Write-Host "STOP: $why" -ForegroundColor Red
  exit 1
}

Write-Host "=== p11-push: push main to $remote ===" -ForegroundColor Cyan

Write-Host "Step 1: git is installed?"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Here 'git was not found. Install it: winget install Git.Git' }
Write-Host "  OK: $(git --version)" -ForegroundColor Green

Write-Host "Step 2: LICENSE is the Apache License 2.0?"
$licensePath = Join-Path $root 'LICENSE'
if (-not (Test-Path -LiteralPath $licensePath)) { Stop-Here 'LICENSE is missing. Run .\run.cmd p11-license.ps1 first.' }
$flat = ([System.IO.File]::ReadAllText($licensePath)) -replace '\s+', ' '
if ($flat -notmatch 'Apache License Version 2\.0, January 2004') { Stop-Here 'LICENSE is not the Apache License 2.0. Run .\run.cmd p11-license.ps1 first.' }
Write-Host "  OK" -ForegroundColor Green

Write-Host "Step 3: the work tree is clean (everything committed)?"
$dirty = @(git status --porcelain | Where-Object { $_ -notmatch '^\s*\S+\s+NEXT\.md$' })  # NEXT.md = the hand-off notes, never part of a release: it may stay modified
if ($dirty.Count -gt 0) {
  $dirty | ForEach-Object { Write-Host "  $_" }
  Stop-Here 'There are uncommitted changes (listed above). Commit first (task T12), then run this again.'
}
Write-Host "  OK: clean" -ForegroundColor Green

Write-Host "Step 4: the branch is main?"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -eq 'master' -and @(git branch --list main).Count -eq 0) {
  Write-Host "  The branch is called 'master'; renaming it to 'main' (the deploy workflow listens to main)." -ForegroundColor Yellow
  git branch -m master main
  if ($LASTEXITCODE -ne 0) { Stop-Here 'git branch -m master main failed.' }
  $branch = 'main'
}
if ($branch -ne 'main') { Stop-Here "You are on branch '$branch'. Switch to main first: git switch main" }
Write-Host "  OK: main" -ForegroundColor Green

Write-Host "Step 5: the remote 'origin'"
$existing = @(git remote)
if ($existing -contains 'origin') {
  $url = (git remote get-url origin).Trim()
  if ($url -ne $remote) { Stop-Here "origin already points to '$url', not to '$remote'. It was NOT changed; fix it by hand if that is a mistake." }
  Write-Host "  OK: origin = $url" -ForegroundColor Green
} else {
  git remote add origin $remote
  if ($LASTEXITCODE -ne 0) { Stop-Here 'git remote add failed.' }
  Write-Host "  added: origin = $remote" -ForegroundColor Green
}

Write-Host "Step 6: what will be pushed"
$count = (git rev-list --count HEAD).Trim()
Write-Host "  $count commit(s) on main; the newest five:"
git log --oneline -n 5 | ForEach-Object { Write-Host "    $_" }

Write-Host "Step 7: git push -u origin main (a browser or login window may open: sign in as yourself)"
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Stop-Here 'git push failed (see the lines above). If GitHub says the remote has other work, tell Claude; do NOT force-push.'
}

Write-Host ""
Write-Host "Pushed. Now, once, on GitHub: repo -> Settings -> Pages -> Source = 'GitHub Actions'." -ForegroundColor Green
Write-Host "done"
