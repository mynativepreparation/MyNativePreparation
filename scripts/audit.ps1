# audit.ps1 - READ-ONLY project audit. It changes nothing; it only reads.
# Run:  .\run.cmd audit.ps1      (about 1 minute; internet is needed only for the npm audit line)
# Writes a compact report to logs\audit.txt (and prints it). ASCII only on purpose.

$ErrorActionPreference = 'Continue'
$script:out = New-Object System.Collections.Generic.List[string]
function Say([string]$s) { Write-Host $s; $script:out.Add($s) }
function Section([string]$s) { Say ''; Say ('== ' + $s) }
function Cut([string]$s, [int]$n = 110) { if ($s.Length -gt $n) { return $s.Substring(0, $n) + '...' } else { return $s } }
function Rel([string]$p) { return $p.Replace((Get-Location).Path + '\', '') }

# ---------- 1. git ----------
Section '1. git (what is committed, what is not)'
if (Test-Path '.git') {
  Say ('branch: ' + (git rev-parse --abbrev-ref HEAD))
  git log --oneline -3 | ForEach-Object { Say ('  last commit: ' + $_) }
  $st = @(git -c core.quotepath=off status --short)
  Say ('changed or untracked entries: ' + $st.Count)
  $st | Select-Object -First 45 | ForEach-Object { Say ('  ' + $_) }
  if ($st.Count -gt 45) { Say ('  ... and ' + ($st.Count - 45) + ' more') }
} else {
  Say '  no .git folder'
}

# ---------- 2. unfinished tasks in phase files ----------
Section '2. phase files: open / done tasks (open tasks of finished phases are listed)'
Get-ChildItem 'docs\phases\*.md' | ForEach-Object {
  $open = @(Select-String -Path $_.FullName -Pattern '^\s*- \[ \]' -Encoding utf8)
  $done = @(Select-String -Path $_.FullName -Pattern '^\s*- \[x\]' -Encoding utf8)
  Say ('  ' + $_.Name + ': open ' + $open.Count + ', done ' + $done.Count)
  if ($_.Name -notlike 'P09*') {
    $open | Select-Object -First 6 | ForEach-Object { Say ('    OPEN: ' + (Cut $_.Line.Trim() 120)) }
  }
}

# ---------- 3-6. code scans ----------
$code = @(Get-ChildItem -Path 'src', 'scripts' -Recurse -File -Include *.ts, *.tsx, *.css, *.mjs, *.ps1 | Where-Object { $_.Name -ne 'audit.ps1' })
$nonTest = @($code | Where-Object { $_.Name -notmatch '\.test\.' })
$nonTestTs = @($nonTest | Where-Object { $_.Extension -in '.ts', '.tsx' })
$testFiles = @($code | Where-Object { $_.Name -match '\.test\.' })

function Scan([string]$title, [string]$pattern, $files, [int]$max = 15) {
  Section $title
  $hits = @($files | Select-String -Pattern $pattern -Encoding utf8)
  Say ('  matches: ' + $hits.Count)
  $hits | Select-Object -First $max | ForEach-Object {
    Say ('  ' + (Rel $_.Path) + ':' + $_.LineNumber + '  ' + (Cut $_.Line.Trim() 90))
  }
}
Scan '3. TODO / FIXME / HACK / XXX markers' '\b(TODO|FIXME|HACK|XXX)\b' $code
Scan '4. leftover console.log / debugger in non-test code' 'console\.(log|debug)\(|\bdebugger\b' $nonTestTs
Scan '5. skipped or focused tests' '\b(it|test|describe)\.(only|skip|todo)\b|\b(xit|xdescribe|fit|fdescribe)\(' $testFiles
Scan '6. type-safety escapes in non-test code (ts-ignore, any, eslint-disable)' '@ts-ignore|@ts-expect-error|eslint-disable|\bas any\b|:\s*any\b' $nonTestTs

# ---------- 7-9. files known to git (ignored folders are skipped) ----------
$files = @(git -c core.quotepath=off ls-files --cached --others --exclude-standard)
$items = @($files | ForEach-Object { Get-Item -LiteralPath $_ -ErrorAction SilentlyContinue } | Where-Object { $_ -and -not $_.PSIsContainer })

Section '7. biggest files (not ignored by git)'
Say ('  files counted: ' + $items.Count)
$items | Sort-Object Length -Descending | Select-Object -First 8 | ForEach-Object {
  Say ('  ' + [math]::Round($_.Length / 1KB, 1) + ' KB  ' + (Rel $_.FullName))
}

Section '8. secrets scan (file names only; content is never printed)'
$skipExt = '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.ttf', '.otf', '.woff', '.woff2', '.zip'
$scan = @($items | Where-Object { $skipExt -notcontains $_.Extension -and $_.Name -ne 'package-lock.json' -and $_.Name -ne 'audit.ps1' })
$secretHits = @($scan | Select-String -Pattern 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}' -List -Encoding utf8)
Say ('  files with a possible secret: ' + $secretHits.Count)
$secretHits | ForEach-Object { Say ('  ' + (Rel $_.Path)) }
$gi = @(Get-Content '.gitignore' -ErrorAction SilentlyContinue)
foreach ($need in 'node_modules', 'dist', 'builds', 'logs', '.env', '.keystore', '.jks', '.pem') {
  if (@($gi | Where-Object { $_ -like ('*' + $need + '*') }).Count -eq 0) { Say ('  .gitignore has no rule for: ' + $need) }
}

Section '9. source files with no test file next to them (informational; type-only files are fine)'
$noTest = @($files | Where-Object { $_ -match '^src/.*\.(ts|tsx)$' -and $_ -notmatch '\.test\.' -and $_ -notmatch '\.d\.ts$' } | Where-Object {
    $base = $_ -replace '\.(ts|tsx)$', ''
    (-not (Test-Path -LiteralPath ($base + '.test.ts'))) -and (-not (Test-Path -LiteralPath ($base + '.test.tsx')))
  })
Say ('  count: ' + $noTest.Count)
$noTest | Select-Object -First 40 | ForEach-Object { Say ('  ' + $_) }

# ---------- 10. i18n ----------
Section '10. en.json keys not found in non-test code (informational; dynamic keys can look unused; never delete automatically)'
try {
  $en = Get-Content 'src\core\i18n\en.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  $keys = @($en.PSObject.Properties.Name)
  $srcText = (($nonTestTs | Where-Object { $_.FullName -notmatch '\\i18n\\' }) | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n"
  $maybe = @($keys | Where-Object { -not $srcText.Contains($_) })
  Say ('  keys in en.json: ' + $keys.Count + ', not found in code: ' + $maybe.Count)
  $maybe | Select-Object -First 30 | ForEach-Object { Say ('  ' + $_) }
} catch {
  Say ('  skipped: ' + $_.Exception.Message)
}

# ---------- 11. dependencies ----------
Section '11. runtime dependencies and npm audit'
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
Say ('  app version: ' + $pkg.version)
Say ('  runtime deps: ' + (($pkg.dependencies.PSObject.Properties | ForEach-Object { $_.Name + ' ' + $_.Value }) -join ', '))
npm audit --omit=dev 2>&1 | Select-Object -Last 4 | ForEach-Object { Say ('  ' + $_) }

# ---------- 12. builds ----------
Section '12. builds and dist'
if (Test-Path 'builds') {
  $b = @(Get-ChildItem 'builds' -Directory)
  Say ('  builds folders: ' + $b.Count + '  ' + (($b | ForEach-Object { $_.Name }) -join ', '))
} else {
  Say '  no builds folder'
}
if (Test-Path 'dist') { Say ('  dist last written: ' + (Get-Item 'dist').LastWriteTime) }

New-Item -ItemType Directory -Force -Path 'logs' | Out-Null
$script:out | Set-Content -Path 'logs\audit.txt' -Encoding UTF8
Say ''
Say 'AUDIT DONE (report also saved in logs\audit.txt). Nothing was changed.'
exit 0
