# p11-merge-remote.ps1 - join the GitHub "Initial commit" (only a README.md) into OUR history. Nothing is lost and NOTHING is forced.
# Run (from the project folder):  .\run.cmd p11-merge-remote.ps1
# It stops (exit 1, nothing changed or the merge undone) if anything is not exactly as expected.
# The merge keeps OUR files; the remote Initial commit only becomes part of the history.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Stop-Here([string]$why) {
  Write-Host "STOP: $why" -ForegroundColor Red
  exit 1
}

Write-Host '=== p11-merge-remote: join the GitHub Initial commit into our history ===' -ForegroundColor Cyan

Write-Host 'Step 1: the branch is main?'
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { Stop-Here "You are on branch '$branch', not main." }
Write-Host '  OK: main' -ForegroundColor Green

Write-Host 'Step 2: the work tree is clean (NEXT.md may stay modified)?'
$dirty = @(git status --porcelain --untracked-files=no | Where-Object { $_ -notmatch '^\s*\S+\s+NEXT\.md$' })
if ($dirty.Count -gt 0) {
  $dirty | ForEach-Object { Write-Host "  $_" }
  Stop-Here 'There are uncommitted changes (listed above).'
}
Write-Host '  OK: clean' -ForegroundColor Green

Write-Host 'Step 3: fetch and check the remote is only the GitHub Initial commit with README.md'
$fetch = @(git fetch origin 2>&1)
$fetch | ForEach-Object { Write-Host "  fetch: $_" }
$tip = (git rev-parse --verify --quiet origin/main)
if (-not $tip) { Stop-Here 'origin/main was not found after the fetch.' }
$count = (git rev-list --count origin/main).Trim()
$files = @(git ls-tree -r --name-only origin/main)
if ($count -ne '1' -or $files.Count -ne 1 -or $files[0] -ne 'README.md') {
  Write-Host "  remote: $count commit(s), files: $($files -join ', ')"
  Stop-Here 'The remote is NOT just one commit with README.md. Nothing was changed. Tell Claude.'
}
Write-Host "  OK: remote = 1 commit ($tip) with README.md only" -ForegroundColor Green

$before = (git rev-parse HEAD).Trim()
Write-Host "Step 4: merge (our files win); our tip before = $before"
$merge = @(git merge origin/main --allow-unrelated-histories -X ours --no-edit -m 'Merge the GitHub initial commit (README only); our files stay' 2>&1)
$mergeCode = $LASTEXITCODE
$merge | ForEach-Object { Write-Host "  merge: $_" }
if ($mergeCode -ne 0) {
  git merge --abort 2>&1 | Out-Null
  Stop-Here 'The merge did not finish; it was undone (git merge --abort). Tell Claude.'
}

Write-Host 'Step 5: check that every file is still exactly ours'
$changed = @(git diff --name-only $before HEAD)
if ($changed.Count -gt 0) {
  $changed | ForEach-Object { Write-Host "  changed vs before: $_" }
  Write-Host 'The merge changed files (listed above). To undo: git reset --hard' $before -ForegroundColor Yellow
  Stop-Here 'Unexpected changes after the merge. Tell Claude BEFORE pushing.'
}
Write-Host '  OK: no file differs from our tip before the merge' -ForegroundColor Green

Write-Host 'Step 6: the history now'
@(git log --oneline --graph -n 6) | ForEach-Object { Write-Host "  $_" }
Write-Host 'Merged. Next: .\run.cmd p11-push.ps1' -ForegroundColor Green
exit 0
