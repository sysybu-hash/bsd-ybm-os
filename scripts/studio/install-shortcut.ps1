# Creates the "סטודיו הדמיות" icon on the desktop.  powershell -File scripts/studio/install-shortcut.ps1
# The program is Electron installed outside the project (C:\Users\User\AI\studio-app, main.js copied from scripts/studio/app/main.js).
# Without it the icon falls back to an Edge app window (launch.ps1).
$here = $PSScriptRoot
$app = "C:\Users\User\AI\studio-app"
$electron = Join-Path $app "node_modules\electron\dist\electron.exe"
$desktop = [Environment]::GetFolderPath("Desktop")
$sh = New-Object -ComObject WScript.Shell
$name = -join ([char[]](0x05E1,0x05D8,0x05D5,0x05D3,0x05D9,0x05D5,0x0020,0x05D4,0x05D3,0x05DE,0x05D9,0x05D5,0x05EA))
$lnk = $sh.CreateShortcut((Join-Path $desktop "$name.lnk"))
if (Test-Path $electron) {
  $lnk.TargetPath = $electron
  $lnk.Arguments = "`"$app`""
  $lnk.IconLocation = "$electron,0"
} else {
  $lnk.TargetPath = "powershell.exe"
  $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\launch.ps1`""
  $lnk.IconLocation = "shell32.dll,41"
}
$lnk.WorkingDirectory = $app
$lnk.Description = "Studio: free render + local FLUX"
$lnk.Save()
Write-Output "ok: $($lnk.TargetPath)"
