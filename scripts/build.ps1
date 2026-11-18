# build.ps1 - runs all checks, builds the web app, keeps ONLY the newest build in builds\
# Run:  .\run.cmd build.ps1

Write-Host ">>> Checks" -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) { Write-Host "Checks failed - build stopped." -ForegroundColor Red; exit 1 }

Write-Host ">>> Build" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$name = "web-" + $version + "-" + (Get-Date -Format 'yyyyMMdd-HHmm')
New-Item -ItemType Directory -Force -Path builds | Out-Null
Copy-Item dist ("builds\" + $name) -Recurse

# Rule: only the newest build is kept.
Get-ChildItem builds -Directory | Where-Object { $_.Name -ne $name } | Remove-Item -Recurse -Force

Write-Host ("Build saved: " + (Join-Path (Get-Location) ("builds\" + $name))) -ForegroundColor Green
exit 0
