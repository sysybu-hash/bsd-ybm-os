$b = 'c:\Users\User\Desktop\BSD-YBM'

$slateToGray = @(
  'text-slate-','bg-slate-','border-slate-','ring-slate-','shadow-slate-',
  'divide-slate-','placeholder:text-slate-','hover:bg-slate-','hover:text-slate-',
  'hover:border-slate-','from-slate-','to-slate-','outline-slate-',
  'caret-slate-','fill-slate-','stroke-slate-'
)
$blueToIndigo = @(
  'text-blue-','bg-blue-','border-blue-','ring-blue-','from-blue-','to-blue-',
  'hover:bg-blue-','hover:text-blue-','hover:border-blue-',
  'focus:border-blue-','focus:ring-blue-','shadow-blue-','accent-blue-',
  'placeholder:text-blue-','outline-blue-'
)

# Files to skip (PayPal + Meckano)
$skipPatterns = @('*PayPal*','*paypal*','*meckano*','*Meckano*')

$files = Get-ChildItem $b -Recurse -Filter '*.tsx' | Where-Object {
  $f = $_.FullName
  $f -notlike "*\node_modules\*" -and
  $f -notlike "*\.next\*" -and
  ($skipPatterns | Where-Object { $f -like $_ }) -eq $null
}

$count = 0
foreach ($file in $files) {
  $original = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
  $c = $original
  foreach ($p in $slateToGray) { $c = $c.Replace($p, ($p -replace 'slate','gray')) }
  foreach ($p in $blueToIndigo) { $c = $c.Replace($p, ($p -replace 'blue','indigo')) }
  if ($c -ne $original) {
    [IO.File]::WriteAllText($file.FullName, $c, [Text.Encoding]::UTF8)
    $count++
    Write-Host "Changed: $($file.Name)"
  }
}

Write-Host "`nTotal files changed: $count"
