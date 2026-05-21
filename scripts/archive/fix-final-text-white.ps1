
# ============================================================
# fix-final-text-white.ps1
# Fixes remaining standalone text-white on light backgrounds
# ============================================================
$enc = [System.Text.Encoding]::UTF8

function ReplaceInFile($path, $old, $new) {
  if (-not (Test-Path $path)) { Write-Host "MISSING: $path"; return }
  $c = [System.IO.File]::ReadAllText($path, $enc)
  $n = $c.Replace($old, $new)
  if ($n -ne $c) {
    [System.IO.File]::WriteAllText($path, $n, $enc)
    Write-Host "  fixed: $(Split-Path $path -Leaf)"
  }
}

$root = "C:\Users\User\Desktop\BSD-YBM"

# 1. AdminBroadcastNotifications.tsx  (bg-white card)
$f = "$root\components\admin\AdminBroadcastNotifications.tsx"
ReplaceInFile $f `
  'text-2xl font-black text-white' `
  'text-2xl font-black text-gray-900'
ReplaceInFile $f `
  'font-medium text-white outline-none ring-indigo-500/20 focus:ring-2"' `
  'font-medium text-gray-900 outline-none ring-indigo-500/20 focus:ring-2"'

# 2. PlatformPayPalOwnerCard.tsx  (bg-indigo-500/15 = very light indigo)
$f = "$root\components\admin\PlatformPayPalOwnerCard.tsx"
ReplaceInFile $f `
  'font-black text-white"' `
  'font-black text-gray-900"'
ReplaceInFile $f `
  '<span className="font-bold text-white">' `
  '<span className="font-bold text-gray-700">'

# 3. BillingOnboardingCallout.tsx  (bg-gradient emerald-50 to sky-50 = light)
$f = "$root\components\billing\BillingOnboardingCallout.tsx"
ReplaceInFile $f `
  'font-black text-white mb-2 flex items-center gap-2' `
  'font-black text-gray-900 mb-2 flex items-center gap-2'

# 4. BillingQuickPayments.tsx  (from-indigo-50 to-white = light)
$f = "$root\components\billing\BillingQuickPayments.tsx"
ReplaceInFile $f `
  'text-xl font-black text-white' `
  'text-xl font-black text-gray-900'
# preset button: bg-white text-white -> bg-white text-indigo-700
ReplaceInFile $f `
  'border-indigo-500/30 bg-white text-white hover:bg-indigo-500/15' `
  'border-indigo-500/30 bg-white text-indigo-700 hover:bg-indigo-500/15'
# input text-white
ReplaceInFile $f `
  'border border-gray-100 px-4 py-2.5 text-white font-mono text-sm' `
  'border border-gray-100 px-4 py-2.5 text-gray-900 font-mono text-sm'

# 5. BillingUnifiedTabsClient.tsx
$f = "$root\components\billing\BillingUnifiedTabsClient.tsx"
ReplaceInFile $f `
  'text-2xl font-black tracking-tight text-white sm:text-3xl' `
  'text-2xl font-black tracking-tight text-gray-900 sm:text-3xl'
# Active tab: bg-gray-100 text-white -> bg-indigo-600 text-white (keep text-white but change bg to colored)
ReplaceInFile $f `
  '"bg-gray-100 text-white shadow-sm ring-1 ring-gray-200"' `
  '"bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-200"'
# Tab label when active: text-white -> text-white is fine now since bg is indigo-600; but span label fix:
ReplaceInFile $f `
  'active ? "text-white" : "text-gray-500"' `
  'active ? "text-white" : "text-gray-600"'

# 6. help/page.tsx  (bg-white card)
$f = "$root\app\dashboard\(protected)\help\page.tsx"
ReplaceInFile $f `
  'text-2xl font-black text-white' `
  'text-2xl font-black text-gray-900'
ReplaceInFile $f `
  'text-base font-black text-white' `
  'text-base font-black text-gray-900'

# 7. success/page.tsx  (plain white page)
$f = "$root\app\dashboard\(protected)\success\page.tsx"
ReplaceInFile $f `
  'text-gray-500 hover:text-white transition-colors text-sm font-medium' `
  'text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium'

# 8. billing/page.tsx  (bg-gray-50 and bg-indigo-500/[0.07] = light)
$f = "$root\app\dashboard\billing\page.tsx"
ReplaceInFile $f `
  'mb-1 flex items-center gap-2 font-bold text-white' `
  'mb-1 flex items-center gap-2 font-bold text-gray-900'
ReplaceInFile $f `
  'mb-2 font-bold text-white' `
  'mb-2 font-bold text-gray-900'

# 9. legal/page.tsx  (bg-gray-50)
$f = "$root\app\legal\page.tsx"
ReplaceInFile $f `
  'text-4xl font-black italic text-white mb-3' `
  'text-4xl font-black italic text-gray-900 mb-3'

# 10. demo/page.tsx — white sidebar mockup (Design C)
$f = "$root\app\demo\page.tsx"
# Brand text in white sidebar
ReplaceInFile $f `
  'bg-gray-900 flex items-center justify-center text-white text-xs font-black">B</div>' + [char]10 + '                <span className="text-xs font-black text-white">BSD-YBM</span>' `
  'bg-gray-900 flex items-center justify-center text-white text-xs font-black">B</div>' + [char]10 + '                <span className="text-xs font-black text-gray-900">BSD-YBM</span>'
# Active nav item: bg-gray-50 text-white -> bg-indigo-600 text-white
ReplaceInFile $f `
  'i === 0 ? "bg-gray-50 text-white" : "text-gray-400 hover:bg-gray-50"' `
  'i === 0 ? "bg-indigo-600 text-white" : "text-gray-400 hover:bg-gray-50"'
# h2 in #fafafa panel
ReplaceInFile $f `
  'text-base font-black text-white mb-5 tracking-tight' `
  'text-base font-black text-gray-900 mb-5 tracking-tight'

Write-Host "`nAll remaining text-white fixes applied."
