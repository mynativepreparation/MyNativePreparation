# p06-npm-info.ps1 - information only (P06 T1): facts about react-zoom-pan-pinch before it is chosen. Installs nothing.
# Run:  .\run.cmd p06-npm-info.ps1

$ErrorActionPreference = 'Continue'

Write-Host ">>> react-zoom-pan-pinch (npm view)" -ForegroundColor Cyan
npm view react-zoom-pan-pinch version license dependencies peerDependencies dist.unpackedSize time.modified repository.url

Write-Host ""
Write-Host ">>> react in this project" -ForegroundColor Cyan
npm ls react --depth=0

exit 0
