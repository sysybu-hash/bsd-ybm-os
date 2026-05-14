
# ============================================================
# fix-broad-text-white.ps1
# Replaces text-white → text-gray-900 in heading/paragraph/input
# elements where the element's own className has no bg- class.
# This covers elements that inherit a light background from parents.
# Excludes intentionally dark pages (demo, wizard mockups, etc.)
# ============================================================
$enc = [System.Text.Encoding]::UTF8
$root = "C:\Users\User\Desktop\BSD-YBM"

# Excluded files (intentionally dark, e.g. design previews)
$excludeNames = @(
  "demo\page.tsx",
  "sign\page.tsx",
  "settings-mockup.html",
  "wizard\page.tsx"
)

$files = Get-ChildItem -Recurse -Include "*.tsx","*.ts" -Path $root |
  Where-Object {
    $rel = $_.FullName.Replace($root, "").TrimStart("\")
    $_.FullName -notmatch "node_modules" -and
    $_.FullName -notmatch "\.next" -and
    (-not ($excludeNames | Where-Object { $rel -like "*$_*" }))
  }

# ---- Evaluator 1: <h1-h6|p|span|td|div> className without bg- --------
$coloredBgRx = [regex]'bg-(?:indigo|red|emerald|blue|violet|cyan|amber|orange|purple|rose|green|teal|sky|lime|yellow|fuchsia|pink|slate|zinc|neutral|stone|black|gray-[0-9]|gradient|white)\b|bg-\['
$anyBgRx     = [regex]'\bbg-'
$textWhiteRx = [regex]'\btext-white\b(?!/)'

$headingEval = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $cls = $m.Groups[2].Value
  # Skip if any bg- in same className, OR if text-white not present
  if (-not $textWhiteRx.IsMatch($cls)) { return $m.Value }
  if ($anyBgRx.IsMatch($cls)) { return $m.Value }
  # Replace text-white with text-gray-900
  $newCls = $textWhiteRx.Replace($cls, 'text-gray-900')
  return $m.Groups[1].Value + $newCls + '"'
}

$headingPattern = [regex]'(<(?:h[1-6]|p|span|td|th|label|li)\b(?:[^>]*?)className=")([^"]*)"'

# ---- Evaluator 2: <input|textarea> className without bg- → text-gray-900
$inputEval = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $cls = $m.Groups[2].Value
  if (-not $textWhiteRx.IsMatch($cls)) { return $m.Value }
  # Allow if bg is a real color (indigo/etc) but still fix if only plain bg-white or no bg
  if ($coloredBgRx.IsMatch($cls)) { return $m.Value }
  $newCls = $textWhiteRx.Replace($cls, 'text-gray-900')
  return $m.Groups[1].Value + $newCls + '"'
}

$inputPattern = [regex]'(<(?:input|textarea|select)\b(?:[^>]*?)className=")([^"]*)"'

# ---- Direct replacements for const/string patterns -------------------
$constFixes = @(
  # Const inputCls strings
  @(' text-white outline-none', ' text-gray-900 outline-none'),
  @(' text-white focus:ring-', ' text-gray-900 focus:ring-'),
  # Data object valueClass
  @('valueClass: "text-white"', 'valueClass: "text-gray-900"'),
  # Hover-only text-white on light hover bg (remaining in ternary strings)
  @('"text-gray-500 hover:bg-gray-50 hover:text-white"', '"text-gray-500 hover:bg-gray-100 hover:text-gray-900"'),
  @('"text-gray-400 hover:bg-gray-50 hover:text-white"', '"text-gray-400 hover:bg-gray-100 hover:text-gray-900"'),
  @('"text-gray-600 hover:bg-gray-50 hover:text-white"', '"text-gray-600 hover:bg-gray-100 hover:text-gray-900"')
)

$changed = 0

foreach ($f in $files) {
  $c    = [System.IO.File]::ReadAllText($f.FullName, $enc)
  $orig = $c

  # Pass A: Direct const replacements
  foreach ($pair in $constFixes) {
    $c = $c.Replace($pair[0], $pair[1])
  }

  # Pass B: Heading/paragraph/td/span tags without own bg-
  $c = $headingPattern.Replace($c, $headingEval)

  # Pass C: Input/textarea tags without colored bg-
  $c = $inputPattern.Replace($c, $inputEval)

  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c, $enc)
    $changed++
    Write-Host "  fixed: $($f.Name)"
  }
}

Write-Host "`nDone - $changed files updated."
