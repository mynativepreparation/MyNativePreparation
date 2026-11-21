# p08-measure.ps1 - P08 T3: measures the gzip size of the PDF chunk (adapter + pdf-lib + fontkit + regenerator-runtime) on its own.
# The normal js-size.ps1 cannot see it yet: nothing imports the adapter until the Report screen exists (T7).
# Budget: 800 KB gzip for ALL JS (DECISIONS Q22, same number as scripts\js-size.ps1). Base = the last full build before P08 (183.61 KB, P07 close).
# Run:  .\run.cmd p08-measure.ps1   (after p08-install.ps1)

$ErrorActionPreference = 'Continue'
$baseKb = 183.61
$limitKb = 800

npx vite build --config scripts/p08-measure.config.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "The measuring build failed (see above)." -ForegroundColor Red
  exit 1
}

$files = @(Get-ChildItem -Path 'logs\p08-size' -Filter '*.js' -File)
if ($files.Count -eq 0) {
  Write-Host "No .js file in logs\p08-size." -ForegroundColor Red
  exit 1
}

$totalGz = 0.0
foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  $ms = New-Object System.IO.MemoryStream
  $gz = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionLevel]::Optimal)
  $gz.Write($bytes, 0, $bytes.Length)
  $gz.Close()
  # ToArray() still works after the GZipStream closed the MemoryStream; $ms.Length would silently give nothing (a 0 KB result)
  $gzLen = $ms.ToArray().Length
  if ($gzLen -le 0) {
    Write-Host "Could not measure the gzip size of $($f.Name)." -ForegroundColor Red
    exit 1
  }
  $gzKb = [math]::Round($gzLen / 1KB, 2)
  $rawKb = [math]::Round($bytes.Length / 1KB, 2)
  $totalGz += $gzKb
  Write-Host ("  " + $f.Name + "  raw " + $rawKb + " KB   gzip " + $gzKb + " KB")
}

$total = [math]::Round($baseKb + $totalGz, 2)
Write-Host ""
Write-Host ("PDF chunk gzip: " + $totalGz + " KB;  base " + $baseKb + " KB;  estimated total JS: " + $total + " KB;  budget " + $limitKb + " KB")
if ($total -le $limitKb) { Write-Host "MEASURE OK: inside the budget." -ForegroundColor Green }
else { Write-Host "MEASURE OVER BUDGET: Claude must ask the owner (raise the number or slim the chunk)." -ForegroundColor Yellow }
exit 0
