# check-env.ps1 - READ-ONLY environment check. It installs NOTHING.
# Run:  powershell -ExecutionPolicy Bypass -File "D:\My Native Preperation\scripts\check-env.ps1"
# It prints what is installed, what is missing, and the exact command to install it.

Write-Host ""
Write-Host "=== My Native Preparation: environment check (installs nothing) ===" -ForegroundColor Cyan
Write-Host ""

$items = @(
  @{ Name = 'winget';   Cmd = 'winget'; Arg = '--version'; Need = 'helper for installs';            Fix = 'Install "App Installer" from the Microsoft Store' },
  @{ Name = 'Node.js';  Cmd = 'node';   Arg = '--version'; Need = 'NOW (phase P01)';                 Fix = 'winget install OpenJS.NodeJS.LTS' },
  @{ Name = 'npm';      Cmd = 'npm';    Arg = '--version'; Need = 'NOW (phase P01)';                 Fix = 'comes with Node.js' },
  @{ Name = 'Git';      Cmd = 'git';    Arg = '--version'; Need = 'NOW (phase P01)';                 Fix = 'winget install Git.Git' },
  @{ Name = 'Java JDK'; Cmd = 'java';   Arg = '--version'; Need = 'LATER (phase P13, Android APK)';  Fix = 'winget install EclipseAdoptium.Temurin.17.JDK' }
)

$missingNow = 0
foreach ($i in $items) {
  $c = Get-Command $i.Cmd -ErrorAction SilentlyContinue
  if ($c) {
    $v = (& $i.Cmd $i.Arg 2>&1 | Select-Object -First 1)
    Write-Host ("[OK]      {0,-10} {1}" -f $i.Name, $v) -ForegroundColor Green
  } else {
    Write-Host ("[MISSING] {0,-10} needed: {1}   install: {2}" -f $i.Name, $i.Need, $i.Fix) -ForegroundColor Yellow
    if ($i.Need -like 'NOW*') { $missingNow++ }
  }
}

if ($env:ANDROID_HOME -or $env:ANDROID_SDK_ROOT) {
  Write-Host "[OK]      Android SDK  found (needed only at phase P13)" -ForegroundColor Green
} else {
  Write-Host "[MISSING] Android SDK  needed: LATER (phase P13, Android APK). Ignore for now." -ForegroundColor DarkYellow
}

Write-Host ""
if ($missingNow -eq 0) {
  Write-Host "Everything needed for phase P01 is installed." -ForegroundColor Green
} else {
  Write-Host "$missingNow tool(s) needed for P01 are missing. Run the install commands above," -ForegroundColor Yellow
  Write-Host "then run this check again." -ForegroundColor Yellow
}
Write-Host ""
exit 0
