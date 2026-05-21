
$enc = [System.Text.Encoding]::UTF8
function Fix($path, $from, $to) {
  if (-not (Test-Path $path)) { Write-Host "MISSING: $path"; return }
  $c = [System.IO.File]::ReadAllText($path, $enc)
  $n = $c.Replace($from, $to)
  if ($n -ne $c) { [System.IO.File]::WriteAllText($path, $n, $enc); Write-Host "  fixed: $(Split-Path $path -Leaf)" }
}
$root = "C:\Users\User\Desktop\BSD-YBM"
Get-ChildItem -Recurse -Include "IntelligenceHub.tsx" -Path $root | ForEach-Object { Fix $_.FullName 'font-sans text-white md:p-6' 'font-sans text-gray-900 md:p-6' }
Get-ChildItem -Recurse -Include "AdminSubscriptionControlCenter.tsx" -Path $root | ForEach-Object { Fix $_.FullName '<strong className="text-white">' '<strong className="text-gray-900">' }
Fix "$root\components\DashboardUnifiedAi.tsx" 'text-xs font-black text-white' 'text-xs font-black text-gray-900'
Fix "$root\components\Footer.tsx" 'text-white font-medium not-italic' 'text-gray-700 font-medium not-italic'
Fix "$root\components\marketing\MarketingPublicShell.tsx" 'text-xl font-black italic tracking-tighter text-white' 'text-xl font-black italic tracking-tighter text-indigo-700'
Fix "$root\components\LegalLayout.tsx" '"text-xl font-bold text-white mt-10 mb-3 scroll-mt-28"' '"text-xl font-bold text-gray-900 mt-10 mb-3 scroll-mt-28"'
Fix "$root\components\SiteTutorialShowcase.tsx" 'text-2xl font-black italic text-white' 'text-2xl font-black italic text-indigo-700'
Get-ChildItem -Recurse -Include "ValuationWidget.tsx" -Path $root | ForEach-Object { Fix $_.FullName 'text-4xl font-black italic tracking-tighter text-white' 'text-4xl font-black italic tracking-tighter text-gray-900' }
Fix "$root\components\LanguageSwitcher.tsx" 'bg-white px-3 py-2 text-sm font-medium text-white min-w-[9rem]' 'bg-white px-3 py-2 text-sm font-medium text-gray-900 min-w-[9rem]'
Fix "$root\components\SupplierPriceBoard.tsx" 'text-xs text-white space-y-1' 'text-xs text-indigo-900 space-y-1'
Write-Host "Done."
