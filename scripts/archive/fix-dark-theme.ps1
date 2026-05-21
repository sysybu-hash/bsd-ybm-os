
# ============================================================
# fix-dark-theme.ps1
# Replaces ALL dark-mode opacity classes with light theme equivalents
# across every .tsx / .ts file in the project
# ============================================================
$enc  = [System.Text.Encoding]::UTF8
$root = "C:\Users\User\Desktop\BSD-YBM"

$files = Get-ChildItem -Recurse -Include "*.tsx","*.ts" -Path $root |
    Where-Object { $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "\.next" }

# ---- Straight string replacement map ----
$pairs = @(
  # bg-white/[0.XX]
  'bg-white/[0.02]','bg-gray-50',
  'bg-white/[0.03]','bg-gray-50',
  'bg-white/[0.04]','bg-gray-50',
  'bg-white/[0.05]','bg-gray-50',
  'bg-white/[0.06]','bg-gray-50',
  'bg-white/[0.07]','bg-gray-50',
  'bg-white/[0.08]','bg-gray-100',
  'bg-white/[0.09]','bg-gray-100',
  'bg-white/[0.10]','bg-gray-100',
  'bg-white/[0.11]','bg-gray-100',
  'bg-white/[0.12]','bg-gray-100',
  'bg-white/[0.13]','bg-gray-100',
  'bg-white/[0.14]','bg-gray-100',
  'bg-white/[0.15]','bg-gray-100',
  'bg-white/[0.20]','bg-gray-200',
  'bg-white/[0.25]','bg-gray-200',
  'bg-white/[0.30]','bg-gray-200',
  # bg-white/N (no brackets)
  'bg-white/5', 'bg-gray-50',
  # border-white/[0.XX]
  'border-white/[0.04]','border-gray-100',
  'border-white/[0.05]','border-gray-100',
  'border-white/[0.06]','border-gray-100',
  'border-white/[0.07]','border-gray-100',
  'border-white/[0.08]','border-gray-200',
  'border-white/[0.10]','border-gray-200',
  'border-white/[0.11]','border-gray-200',
  'border-white/[0.12]','border-gray-200',
  'border-white/[0.15]','border-gray-300',
  'border-white/[0.20]','border-gray-300',
  # border-white/N (no brackets)
  'border-white/10','border-gray-200',
  'border-white/15','border-gray-200',
  'border-white/20','border-gray-300',
  # text-white/XX (opacity variants → gray)
  'text-white/10','text-gray-200',
  'text-white/15','text-gray-300',
  'text-white/20','text-gray-300',
  'text-white/25','text-gray-400',
  'text-white/30','text-gray-400',
  'text-white/35','text-gray-400',
  'text-white/40','text-gray-400',
  'text-white/45','text-gray-500',
  'text-white/50','text-gray-500',
  'text-white/55','text-gray-500',
  'text-white/60','text-gray-500',
  'text-white/65','text-gray-600',
  'text-white/70','text-gray-600',
  'text-white/75','text-gray-600',
  'text-white/80','text-gray-700',
  'text-white/85','text-gray-700',
  'text-white/90','text-gray-800',
  'text-white/95','text-gray-800',
  # placeholder:text-white/XX
  'placeholder:text-white/20','placeholder:text-gray-400',
  'placeholder:text-white/30','placeholder:text-gray-400',
  'placeholder:text-white/40','placeholder:text-gray-400',
  'placeholder:text-white/50','placeholder:text-gray-400',
  # hover:bg-white/[0.XX]
  'hover:bg-white/[0.03]','hover:bg-gray-50',
  'hover:bg-white/[0.04]','hover:bg-gray-50',
  'hover:bg-white/[0.05]','hover:bg-gray-50',
  'hover:bg-white/[0.06]','hover:bg-gray-50',
  'hover:bg-white/[0.07]','hover:bg-gray-50',
  'hover:bg-white/[0.08]','hover:bg-gray-100',
  'hover:bg-white/[0.09]','hover:bg-gray-100',
  'hover:bg-white/[0.10]','hover:bg-gray-100',
  'hover:bg-white/[0.12]','hover:bg-gray-100',
  'hover:bg-white/[0.15]','hover:bg-gray-200',
  # hover:text-white/XX
  'hover:text-white/65','hover:text-gray-600',
  'hover:text-white/70','hover:text-gray-700',
  # ring-white
  'ring-white/10','ring-gray-200',
  'ring-white/15','ring-gray-200',
  'ring-white/20','ring-gray-200',
  'ring-white/[0.07]','ring-gray-200',
  'ring-white/[0.10]','ring-gray-300',
  'ring-white/[0.15]','ring-gray-300',
  'ring-white/[0.20]','ring-gray-300',
  # divide
  'divide-white/[0.07]','divide-gray-100',
  'divide-white/[0.10]','divide-gray-200',
  # gradient from/to
  'from-white/[0.05]','from-gray-50',
  'from-white/[0.08]','from-gray-100',
  'to-white/[0.05]','to-gray-50',
  'to-white/[0.08]','to-gray-100'
)

# ---- MatchEvaluator: fix standalone text-white on gray/white backgrounds ----
# Applied to className="..." double-quoted strings only
$coloredBgRx = [regex]'bg-(?:indigo|red|emerald|blue|violet|cyan|amber|orange|purple|rose|green|teal|sky|lime|yellow|fuchsia|pink|slate)-'
$lightBgRx   = [regex]'bg-(?:gray-(?:50|100|200|300|400)|white)\b(?!/)'
$textWhiteRx  = [regex]'\btext-white\b(?!/)'

$evaluator = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $cls = $m.Groups[1].Value
  if ($lightBgRx.IsMatch($cls) -and $textWhiteRx.IsMatch($cls) -and (-not $coloredBgRx.IsMatch($cls))) {
    return 'className="' + $textWhiteRx.Replace($cls, 'text-gray-900') + '"'
  }
  return $m.Value
}

# Also fix hover:text-white on hover:bg-gray-* in same class string
$hoverLightBgRx  = [regex]'hover:bg-gray-'
$hoverTextWhiteRx = [regex]'\bhover:text-white\b(?!/)'

$hoverEvaluator = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $cls = $m.Groups[1].Value
  if ($hoverLightBgRx.IsMatch($cls) -and $hoverTextWhiteRx.IsMatch($cls) -and (-not $coloredBgRx.IsMatch($cls))) {
    return 'className="' + $hoverTextWhiteRx.Replace($cls, 'hover:text-gray-900') + '"'
  }
  return $m.Value
}

$classNameRx = [regex]'className="([^"]*)"'

$changed = 0
foreach ($f in $files) {
  $c    = [System.IO.File]::ReadAllText($f.FullName, $enc)
  $orig = $c

  # Pass 1 – direct replacements (iterate pairs in chunks of 2)
  for ($i = 0; $i -lt $pairs.Count; $i += 2) {
    $c = $c.Replace($pairs[$i], $pairs[$i+1])
  }

  # Pass 2 – fix remaining text-white on now-light backgrounds
  $c = $classNameRx.Replace($c, $evaluator)
  $c = $classNameRx.Replace($c, $hoverEvaluator)

  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c, $enc)
    $changed++
    Write-Host "  fixed: $($f.Name)"
  }
}

Write-Host "`nDone - $changed files updated."
