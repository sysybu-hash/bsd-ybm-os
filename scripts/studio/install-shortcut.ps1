# Creates the "סטודיו הדמיות" icon on the desktop.  powershell -File scripts/studio/install-shortcut.ps1
$here = $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$sh = New-Object -ComObject WScript.Shell
$name = -join ([char[]](0x05E1,0x05D8,0x05D5,0x05D3,0x05D9,0x05D5,0x0020,0x05D4,0x05D3,0x05DE,0x05D9,0x05D5,0x05EA))
$lnk = $sh.CreateShortcut((Join-Path $desktop "$name.lnk"))
$lnk.TargetPath = "powershell.exe"
$lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\launch.ps1`""
$lnk.WorkingDirectory = $here
$lnk.IconLocation = "shell32.dll,41"
$lnk.Description = "Studio: free render + local FLUX"
$lnk.Save()
Write-Output "ok: $($lnk.FullName)"
