$b = 'c:\Users\User\Desktop\BSD-YBM'

$slateToGray = @('text-slate-','bg-slate-','border-slate-','ring-slate-','shadow-slate-','divide-slate-','placeholder:text-slate-','hover:bg-slate-','hover:text-slate-','hover:border-slate-','from-slate-','to-slate-')
$blueToIndigo = @('text-blue-','bg-blue-','border-blue-','ring-blue-','from-blue-','to-blue-','hover:bg-blue-','hover:text-blue-','hover:border-blue-','focus:border-blue-','focus:ring-blue-','shadow-blue-','accent-blue-')

function Apply-Colors {
  param([string]$path)
  $c = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  foreach ($p in $slateToGray) { $c = $c.Replace($p, ($p -replace 'slate','gray')) }
  foreach ($p in $blueToIndigo) { $c = $c.Replace($p, ($p -replace 'blue','indigo')) }
  [IO.File]::WriteAllText($path, $c, [Text.Encoding]::UTF8)
  Write-Host "OK: $(Split-Path $path -Leaf)"
}

# SidebarUserCard — avatar gradient: to-slate-100 -> to-indigo-50 first
$f = "$b\components\DashboardSidebarUserCard.tsx"
$c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
$c = $c.Replace('to-slate-100', 'to-indigo-50')
[IO.File]::WriteAllText($f, $c, [Text.Encoding]::UTF8)
Apply-Colors $f

# BottomDock — specific shadow before blanket
$f = "$b\components\DashboardBottomDock.tsx"
$c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
$c = $c.Replace('shadow-slate-400/35', 'shadow-indigo-900/15')
[IO.File]::WriteAllText($f, $c, [Text.Encoding]::UTF8)
Apply-Colors $f

# Simple blanket files
Apply-Colors "$b\components\DashboardGlobalSearch.tsx"
Apply-Colors "$b\components\control-center\OperatorOnboardingPanel.tsx"
Apply-Colors "$b\components\DashboardNotificationBell.tsx"
Apply-Colors "$b\app\app\trial-expired\page.tsx"
Apply-Colors "$b\components\crm\CrmClient.tsx"

# success/page — update confetti to indigo palette + blanket
$f = "$b\app\app\success\page.tsx"
$c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
$c = $c.Replace('"#3b82f6", "#60a5fa", "#e2e8f0"', '"#6366f1", "#818cf8", "#e0e7ff"')
[IO.File]::WriteAllText($f, $c, [Text.Encoding]::UTF8)
Apply-Colors $f

# PostRegisterWelcomeSheet — backdrop override then blanket
$f = "$b\components\PostRegisterWelcomeSheet.tsx"
$c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
$c = $c.Replace('bg-slate-200/55', 'bg-gray-900/30')
[IO.File]::WriteAllText($f, $c, [Text.Encoding]::UTF8)
Apply-Colors $f

# ERPDashboard — update CSS var fallback + chart hex colors + blanket
$f = "$b\components\ERPDashboard.tsx"
$c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
$c = $c.Replace('"var(--primary-color, #2563eb)"', '"var(--primary-color, #4f46e5)"')
$c = $c.Replace('fill: "#94a3b8"', 'fill: "#9ca3af"')
$c = $c.Replace('border: "1px solid #e2e8f0"', 'border: "1px solid #e5e7eb"')
[IO.File]::WriteAllText($f, $c, [Text.Encoding]::UTF8)
Apply-Colors $f

Write-Host "`nAll 10 files processed!"
