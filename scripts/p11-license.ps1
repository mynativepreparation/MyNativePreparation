# p11-license.ps1 - P11 T10: put the Apache License 2.0 text into LICENSE (owner decision: the code licence is Apache-2.0).
# Run (from the project folder):  .\run.cmd p11-license.ps1
# It downloads the official text, checks that it really is the Apache License 2.0, keeps a copy of the old LICENSE in logs\ and replaces it.
# It changes nothing else and sends nothing anywhere.

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'LICENSE'
$url    = 'https://www.apache.org/licenses/LICENSE-2.0.txt'

function Test-ApacheText([string]$text) {
  $flat = $text -replace '\s+', ' '
  return ($flat -match 'Apache License Version 2\.0, January 2004') -and ($flat -match 'END OF TERMS AND CONDITIONS') -and ($text.Length -gt 10000)
}

Write-Host "=== p11-license: Apache License 2.0 -> LICENSE ===" -ForegroundColor Cyan

if (Test-Path -LiteralPath $target) {
  $current = [System.IO.File]::ReadAllText($target)
  if (Test-ApacheText $current) {
    Write-Host "LICENSE already holds the Apache License 2.0 text. Nothing to do." -ForegroundColor Green
    exit 0
  }
  $firstLine = ($current -split "`n" | Select-Object -First 1).Trim()
  Write-Host "Current LICENSE is NOT the Apache text (first line: '$firstLine'). It will be replaced; a copy goes to logs\LICENSE.before-apache.txt." -ForegroundColor Yellow
  $logs = Join-Path $root 'logs'
  if (-not (Test-Path -LiteralPath $logs)) { New-Item -ItemType Directory -Path $logs | Out-Null }
  Copy-Item -LiteralPath $target -Destination (Join-Path $logs 'LICENSE.before-apache.txt') -Force
} else {
  Write-Host "There is no LICENSE yet; it will be created." -ForegroundColor Yellow
}

Write-Host "Downloading $url ..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$response = Invoke-WebRequest -Uri $url -UseBasicParsing
$text = [string]$response.Content
$text = ($text -replace "`r`n", "`n").TrimEnd() + "`n"

if (-not (Test-ApacheText $text)) {
  Write-Host "The downloaded text does not look like the Apache License 2.0. LICENSE was NOT changed." -ForegroundColor Red
  exit 1
}

[System.IO.File]::WriteAllText($target, $text, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("LICENSE written: {0} bytes (Apache License 2.0)." -f (Get-Item -LiteralPath $target).Length) -ForegroundColor Green
Write-Host "done"
