# js-size.ps1 - prints the gzip size of every JS file in dist\assets and the total.
# Exit 1 when the total is over the budget of 250 KB gzip (DECISIONS Q14). Needs a finished build (dist\).
# Run:  .\run.cmd js-size.ps1     (build.ps1 calls it too)
# Note: measured with .NET GZip; Vite's own numbers can differ by a few percent.

$limitKb = 250
if (-not (Test-Path 'dist\assets')) {
  Write-Host "dist\assets not found - build first (.\run.cmd build.ps1)." -ForegroundColor Red
  exit 1
}

$total = 0.0
foreach ($file in Get-ChildItem 'dist\assets' -Filter '*.js') {
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $stream = New-Object System.IO.MemoryStream
  $gzip = New-Object System.IO.Compression.GZipStream($stream, [System.IO.Compression.CompressionMode]::Compress)
  $gzip.Write($bytes, 0, $bytes.Length)
  $gzip.Close()
  $kb = [math]::Round($stream.ToArray().Length / 1024, 2)
  $total += $kb
  Write-Host ("  {0,-45} {1,8:N2} KB gzip" -f $file.Name, $kb)
}

Write-Host ("JS total: {0:N2} KB gzip (budget {1} KB)" -f $total, $limitKb)
if ($total -gt $limitKb) {
  Write-Host "OVER THE BUDGET." -ForegroundColor Red
  exit 1
}
Write-Host "JS size OK." -ForegroundColor Green
exit 0
