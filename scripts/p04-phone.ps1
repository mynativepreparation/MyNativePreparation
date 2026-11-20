# p04-phone.ps1 - gives the app that runs on this laptop an HTTPS link, so the owner can test the fingerprint lock on his phone (P04 T13).
# Why: WebAuthn (fingerprint) and WebCrypto only work on HTTPS or localhost; a plain http://192.168... link does not work on a phone.
# Needs: (1) p04-preview.ps1 RUNNING in another PowerShell window (the app on localhost:4173), (2) Cloudflare's free quick tunnel tool `cloudflared`.
# The link is public to anyone who has it (no account, no login) and it is NEW on every run. The app has no server; the data stays in the phone's browser.
# This script keeps running (the tunnel). Stop it with Ctrl+C; the link stops working with it.
# Run (NOT through run.cmd, because it never finishes):
#   powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\p04-phone.ps1"

$exe = $null
$found = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($found) {
  $exe = $found.Source
} else {
  foreach ($dir in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
    if ($dir) {
      $candidate = Join-Path $dir "cloudflared\cloudflared.exe"
      if (Test-Path -LiteralPath $candidate) { $exe = $candidate; break }
    }
  }
}
if (-not $exe) {
  Write-Host "cloudflared is not installed. Install it once with the line below, then CLOSE this window, open a NEW PowerShell window and run this script again:" -ForegroundColor Red
  Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
  exit 1
}

try {
  $null = Invoke-WebRequest -Uri "http://localhost:4173/" -UseBasicParsing -TimeoutSec 5
} catch {
  Write-Host "The app is not running on localhost:4173. First start p04-preview.ps1 in ANOTHER PowerShell window, wait until it prints the address, then run this script again." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Starting the tunnel. In a few seconds a line with https://<some-words>.trycloudflare.com appears below." -ForegroundColor Green
Write-Host "Type that link in your phone's browser (a NORMAL tab, not private/incognito). The phone needs a screen lock with fingerprint or face set up." -ForegroundColor Cyan
Write-Host "Keep this window open for the WHOLE test: a new run gives a NEW link and the app on a new link starts empty (data and fingerprint belong to the link)." -ForegroundColor Cyan
Write-Host "Test: Register -> Copy -> Fingerprint (turn on) -> Info -> Privacy -> Home; close the tab, open the SAME link again -> fingerprint prompt; then Settings -> Fingerprint lock card." -ForegroundColor Cyan
Write-Host "Stop with Ctrl+C." -ForegroundColor Yellow
Write-Host "This window does NOT finish by itself: it stays open while the tunnel works. Look for a box with a https://...trycloudflare.com line (can take up to 30 seconds)." -ForegroundColor Yellow
# --protocol http2: the default (QUIC over UDP) is blocked on some Wi-Fi/ISP networks and then the tunnel hangs without printing a link.
# Every cloudflared line is printed, and the link is repeated in green so it is easy to find.
& $exe tunnel --url http://localhost:4173 --http-host-header localhost:4173 --protocol http2 --no-autoupdate 2>&1 | ForEach-Object {
  $line = "$_"
  Write-Host $line
  if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    Write-Host ""
    Write-Host "OPEN THIS LINK ON YOUR PHONE:  $($Matches[0])" -ForegroundColor Green
    Write-Host ""
  }
}
