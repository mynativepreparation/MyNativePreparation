# p11-remote-look.ps1 - READ-ONLY look at what is already on GitHub (origin/main). It changes nothing: only "git fetch" (download), never a push or a merge.
# Run (from the project folder):  .\run.cmd p11-remote-look.ps1
# Everything is printed with Write-Host so that Claude can read it in logs\last-run.txt.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

Write-Host '=== p11-remote-look: what is on GitHub? ===' -ForegroundColor Cyan

$fetch = @(git fetch origin 2>&1)
$fetch | ForEach-Object { Write-Host "  fetch: $_" }

$tip = (git rev-parse --verify --quiet origin/main)
if (-not $tip) {
  Write-Host 'origin/main does not exist after the fetch (the remote may be empty or the fetch failed: see above).' -ForegroundColor Yellow
  exit 1
}
Write-Host "Remote main points to: $tip"

$count = (git rev-list --count origin/main)
Write-Host "Remote main has $count commit(s). Newest first (id | author | date | subject):"
@(git log origin/main -n 20 --format='%h | %an <%ae> | %ad | %s' --date=short) | ForEach-Object { Write-Host "  $_" }

$base = (git merge-base HEAD origin/main 2>$null)
if ($base) {
  Write-Host "Common history with our local main: YES (merge-base $base)." -ForegroundColor Green
} else {
  Write-Host 'Common history with our local main: NO (the remote history is separate from ours).' -ForegroundColor Yellow
}

$files = @(git ls-tree -r --name-only origin/main)
Write-Host "Files on the remote main: $($files.Count) in total. The first 40:"
$files | Select-Object -First 40 | ForEach-Object { Write-Host "  $_" }

Write-Host 'Remote branches we know of:'
@(git branch -r) | ForEach-Object { Write-Host "  $_" }

Write-Host '=== done (nothing was changed) ===' -ForegroundColor Cyan
exit 0
