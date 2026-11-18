# run.ps1 - runs one script from the scripts folder and saves the full output to logs\last-run.txt
# so that Claude can read the result directly. Use it through run.cmd:   .\run.cmd <script-name> [args]

param(
  [Parameter(Position = 0, Mandatory = $true)][string]$Script,
  [Parameter(ValueFromRemainingArguments = $true)]$Rest
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Refresh PATH so tools installed a moment ago (Node, Git) are found without reopening the terminal.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
$log = Join-Path $root 'logs\last-run.txt'
$code = 1

Start-Transcript -Path $log -Force | Out-Null
try {
  Write-Host ("=== " + (Get-Date -Format s) + "  running: " + $Script + " ===") -ForegroundColor Cyan
  $target = Join-Path $PSScriptRoot $Script
  if (-not (Test-Path $target)) { $target = $target + '.ps1' }
  if (-not (Test-Path $target)) {
    Write-Host ("Script not found: " + $Script) -ForegroundColor Red
    $code = 2
  } else {
    & $target @Rest
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
  }
  Write-Host ("=== finished, exit code: " + $code + " ===") -ForegroundColor Cyan
} finally {
  Stop-Transcript | Out-Null
}
exit $code
