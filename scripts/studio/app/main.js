// סטודיו הדמיות: the program window. It starts the studio engine (scripts/studio/server.mjs in the project), keeps it alive (restarts it if it dies;
// the engine saves its queue, so nothing is lost), and shows the page in its own window. Closing the window stops the engine; unfinished jobs resume on the next start.
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn, execFile } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const PROJECT = process.env.STUDIO_PROJECT || "C:\\Users\\User\\Desktop\\BSD-YBM-OS";
const PORT = process.env.STUDIO_PORT || "4747";
const URL = `http://localhost:${PORT}`;
const LOG = path.join(app.getPath("userData"), "studio-app.log");
const note = (m) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch { /* disk */ } };

let server = null, quitting = false, win = null;

const up = () => new Promise((r) => { const q = http.get(`${URL}/api/config`, (res) => { res.resume(); r(res.statusCode === 200); }); q.on("error", () => r(false)); q.setTimeout(1500, () => { q.destroy(); r(false); }); });

function startServer() {
  if (quitting) return;
  const script = path.join(PROJECT, "scripts", "studio", "server.mjs");
  if (!fs.existsSync(script)) { dialog.showErrorBox("סטודיו הדמיות", `לא נמצא מנוע הסטודיו:\n${script}`); app.quit(); return; }
  server = spawn("node", [script], { cwd: PROJECT, windowsHide: true, env: { ...process.env, STUDIO_PORT: PORT } });
  server.stdout.on("data", (d) => note(`server: ${d}`));
  server.stderr.on("data", (d) => note(`server err: ${d}`));
  server.on("close", (code) => { note(`server exited ${code}`); server = null; if (!quitting) setTimeout(startServer, 1500); });
}

async function waitUp() { for (let i = 0; i < 60; i++) { if (await up()) return true; await new Promise((r) => setTimeout(r, 500)); } return false; }

function stopServer() {
  quitting = true;
  if (server) { try { execFile("taskkill", ["/F", "/T", "/PID", String(server.pid)], () => {}); } catch { /* gone */ } }
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // An engine already running (started by the shortcut) is reused, not started twice.
    if (!(await up())) startServer();
    if (!(await waitUp())) { dialog.showErrorBox("סטודיו הדמיות", "המנוע לא עלה. הפרטים ב: " + LOG); app.quit(); return; }
    win = new BrowserWindow({ width: 1500, height: 950, minWidth: 900, minHeight: 600, title: "סטודיו הדמיות", backgroundColor: "#14161a", autoHideMenuBar: true });
    win.loadURL(URL);
    // A page that fails to load (engine restarting) tries again instead of staying blank.
    win.webContents.on("did-fail-load", () => setTimeout(() => win && !win.isDestroyed() && win.loadURL(URL), 1500));
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
    win.on("closed", () => { win = null; });
  });
  app.on("window-all-closed", () => { stopServer(); app.quit(); });
  app.on("before-quit", stopServer);
}
