
# ============================================================
# fix-remaining-text-white.ps1
# Targeted fixes for standalone text-white on light backgrounds
# ============================================================
$enc  = [System.Text.Encoding]::UTF8

function Fix($path, $from, $to) {
  $c = [System.IO.File]::ReadAllText($path, $enc)
  $n = $c.Replace($from, $to)
  if ($n -ne $c) { [System.IO.File]::WriteAllText($path, $n, $enc) }
}

function FixRe($path, $pattern, $replacement) {
  $c = [System.IO.File]::ReadAllText($path, $enc)
  $n = [regex]::Replace($c, $pattern, $replacement)
  if ($n -ne $c) { [System.IO.File]::WriteAllText($path, $n, $enc) }
}

$root = "C:\Users\User\Desktop\BSD-YBM"

# ── 1. Admin page tabs: hover:text-white on gray-50 hover bg ──────────────
$adminPage = "$root\app\dashboard\(protected)\admin\page.tsx"
Fix $adminPage 'hover:bg-gray-50 hover:text-white' 'hover:bg-gray-100 hover:text-gray-900'

# ── 2. BsdYbmDashboard.tsx — all text-white on white/gray-50 cards ──────
$dash = "$root\app\components\BsdYbmDashboard.tsx"
# Headings + values + labels — no colored bg in these elements
# Use broad targeted replacement: text-white on h1/h2/h3/p elements
FixRe $dash '(<(?:h[1-6]|p|span|td)\s[^>]*className="[^"]*?)\btext-white\b([^"]*"[^>]*>)' '$1text-gray-900$2'

# ── 3. admin/page.tsx — headings and values on gray-50/white cards ───────
# After tab fix above, handle h1/h2/h3/p/td
FixRe $adminPage '(<(?:h[1-6]|p|span|td)\s[^>]*className="[^"]*?)\btext-white\b([^"]*"[^>]*>)' '$1text-gray-900$2'

# ── 4. control-center/page.tsx ───────────────────────────────────────────
$cc = "$root\app\dashboard\(protected)\control-center\page.tsx"
Fix $cc 'hover:bg-gray-50 hover:text-white' 'hover:bg-gray-100 hover:text-gray-900'
FixRe $cc '(<(?:h[1-6]|p|span|td)\s[^>]*className="[^"]*?)\btext-white\b([^"]*"[^>]*>)' '$1text-gray-900$2'
# tone fallback
Fix $cc '"text-white"' '"text-gray-900"'

# ── 5. business/page.tsx — valueClass ────────────────────────────────────
$bizPage = "$root\app\dashboard\(protected)\business\page.tsx"
Fix $bizPage 'valueClass: "text-white"' 'valueClass: "text-gray-900"'

# ── 6. ContactPageClient.tsx ──────────────────────────────────────────────
$contact = "$root\app\contact\ContactPageClient.tsx"
Fix $contact 'text-base font-medium text-white' 'text-base font-medium text-gray-700'
Fix $contact 'hover:text-white underline-offset-2' 'hover:text-indigo-600 underline-offset-2'

# ── 7. Broad: any remaining hover:text-white after hover:bg-gray-* ────────
# In ALL files
$files = Get-ChildItem -Recurse -Include "*.tsx","*.ts" -Path $root |
    Where-Object { $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "\.next" }

foreach ($f in $files) {
  $c = [System.IO.File]::ReadAllText($f.FullName, $enc)
  $orig = $c
  # Replace: hover:text-white where it follows hover:bg-gray-50
  $c = $c.Replace('hover:bg-gray-50 hover:text-white', 'hover:bg-gray-100 hover:text-gray-900')
  $c = $c.Replace('hover:bg-gray-100 hover:text-white', 'hover:bg-gray-100 hover:text-gray-900')
  if ($c -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $c, $enc)
    Write-Host "  fixed hover: $($f.Name)"
  }
}

# ── 8. Final sweep: text-white in JSX triple-class ternary strings ─────────
# Pattern: "text-gray-XXX hover:bg-gray-YYY hover:text-white"
# Already covered by step 7 above.

Write-Host "`nDone with remaining text-white fixes."
