# Opens the studio as a program window: starts its engine (if it is not already running) and shows the page in its own
# window (an Edge "app" window: no tabs, no address bar, no Chrome). Closing the window leaves the engine running so queued jobs finish;
# it ends by itself when the last job is done and no window has been open for 10 minutes... or run stop-studio from the shortcut menu.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$port = if ($env:STUDIO_PORT) { $env:STUDIO_PORT } else { "4747" }
$url = "http://localhost:$port"
function Up { try { (Invoke-WebRequest "$url/api/config" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
if (-not (Up)) {
  Start-Process -FilePath "node" -ArgumentList "scripts/studio/server.mjs" -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 40 -and -not (Up); $i++) { Start-Sleep -Milliseconds 500 }
}
$edge = @("C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "C:\Program Files\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Start-Process $url; exit }
$profile = Join-Path $env:LOCALAPPDATA "StudioHadmayot\profile"
Start-Process -FilePath $edge -ArgumentList "--app=$url", "--user-data-dir=`"$profile`"", "--window-size=1500,950", "--no-first-run", "--disable-features=msEdgeSidebarV2"
