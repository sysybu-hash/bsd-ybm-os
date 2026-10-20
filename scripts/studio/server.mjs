#!/usr/bin/env node
/**
 * סטודיו הדמיות — the engine behind the desktop program (and the page, if opened in any browser).
 *
 *   node scripts/studio/server.mjs            (the program starts it by itself)
 *
 * No dependencies. Everything runs on this machine: a render is `npx tsx scripts/...` (the same scripts the terminal uses), a FLUX pass is the Python script beside
 * this file run in the FastSD environment. Jobs go through one queue, one at a time, so the renderer and the engine never fight over the CPU and the GPU. A
 * "full visualization" is just every chosen view queued at once, each optionally followed by its FLUX pass. Results are files under previews/studio.
 *
 * Env: STUDIO_PORT (4747), STUDIO_PY (the Python with FastSD), FASTSD_DIR, PISGA_DXF (the default Pisga drawing).
 */
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(ROOT, "previews", "studio");
const PORT = Number(process.env.STUDIO_PORT ?? 4747);
const PY = process.env.STUDIO_PY ?? "C:\\Users\\User\\AI\\fastsdcpu\\env\\Scripts\\python.exe";
const FASTSD = process.env.FASTSD_DIR ?? "C:\\Users\\User\\AI\\fastsdcpu";
const PISGA_DXF = process.env.PISGA_DXF ?? path.join(ROOT, "מערכת הדמיות", "מרכז פסגה", "14.19.2026", "מרכז פסגה 14.09.2026 - Standard", "קבצי DXF", "מרכז פסגה 14.09.2026.dxf");
const GROUND_PHOTO = path.join(ROOT, "previews", "pisga-ground-photo.jpg");
fs.mkdirSync(OUT, { recursive: true });

const PISGA_VIEWS = ["aerial-ne", "aerial-sw", "north-facade", "courtyard", "site", "east-side", "west-side", "roof-top", "end-e", "end-w", "north-terrace", "lobby", "hall", "design", "event-hall", "classroom", "workshop", "computers"];
const APT20_VIEWS = ["overview", "salon", "salon-wide", "kitchen", "bedroom-1", "bedroom-2", "bedroom-3", "entrance", "bathroom"];

/** Hebrew names for the views and the groups: the page shows these, the scripts get the ids. */
const VIEW_LABELS = {
  "aerial-ne": "מבט-על צפון-מזרח", "aerial-sw": "מבט-על דרום-מערב", "north-facade": "חזית צפונית", courtyard: "חצר", site: "האתר והרחוב", "east-side": "צד מזרח", "west-side": "צד מערב", "roof-top": "הגג מלמעלה",
  "end-e": "קצה מזרחי", "end-w": "קצה מערבי", "north-terrace": "מרפסת צפונית", lobby: "לובי", hall: "אולם", design: "מרחב למידה", "event-hall": "אולם אירועים", classroom: "כיתה", workshop: "סדנה", computers: "חדר מחשבים",
  overview: "מבט כללי מלמעלה", salon: "סלון", "salon-wide": "סלון רחב", kitchen: "מטבח", "bedroom-1": "חדר שינה 1", "bedroom-2": "חדר שינה 2", "bedroom-3": "חדר שינה 3", entrance: "כניסה", bathroom: "אמבטיה",
};
const GROUPS = {
  pisga: { "חוץ": ["aerial-ne", "aerial-sw", "north-facade", "courtyard", "site", "east-side", "west-side", "roof-top", "end-e", "end-w", "north-terrace"], "פנים": ["lobby", "hall", "design", "event-hall", "classroom", "workshop", "computers"] },
  apt20: { "מבט כללי": ["overview"], "אזור מגורים": ["salon", "salon-wide", "kitchen", "entrance"], "חדרי שינה": ["bedroom-1", "bedroom-2", "bedroom-3"], "רטוב": ["bathroom"] },
};
const PRESET_LABELS = { restyle: "כללי: להפוך לצילום", exterior: "חוץ: אבן, זכוכית, שמש", interior: "פנים: טיח, פרקט, אריחים" };
const STYLES = ["contemporary", "luxury", "scandi", "jerusalem_stone", "developer_white", "haredi_classic", "haredi_modern"];
const STYLE_LABELS = { contemporary: "עכשווי", luxury: "יוקרה", scandi: "סקנדינבי", jerusalem_stone: "אבן ירושלמית", developer_white: "לבן יזמי", haredi_classic: "חרדי קלאסי", haredi_modern: "חרדי מודרני" };

const PROJECTS = {
  pisga: { title: "מרכז פסגה (DXF)", views: PISGA_VIEWS, groups: GROUPS.pisga, qualities: { fast: "מהיר (רסטר)", traced: "מעקב קרניים 512 (כ-2 דקות)", best: "מעקב קרניים 1024 (איטי)" }, accepts: [".dxf"], fileLabel: "קובץ DXF", defaultFile: PISGA_DXF },
  apt20: { title: "דירה 20 (מדידה ידנית)", views: APT20_VIEWS, groups: GROUPS.apt20, qualities: { fast: "רגיל" }, accepts: [] },
  pdf: { title: "דירה מקובץ PDF של תוכנית", views: ["overview"], groups: {}, qualities: { fast: "רגיל" }, accepts: [".pdf"], fileLabel: "קובץ PDF", needs: ["file", "area", "styles"] },
  image: { title: "תמונה כלשהי (FLUX בלבד)", views: ["image"], groups: {}, qualities: { none: "אין רנדר: ישר ל-FLUX" }, accepts: [".jpg", ".jpeg", ".png", ".webp"], fileLabel: "קובץ תמונה", needs: ["file"] },
};
VIEW_LABELS.image = "התמונה שנבחרה";

const FLUX_PRESETS = {
  restyle: "Restyle this 3D render as a photograph by giving its existing surfaces realistic textures under natural daylight. Nothing is added, removed, moved or resized: every window, door, piece of furniture and fixture keeps its place, count, size and shape. Crisp focus.",
  exterior: "Restyle this 3D render of a building as a photograph by giving its existing surfaces realistic limestone, glass, paving, asphalt and soil textures under natural sunlight. Nothing is added, removed, moved or resized; every empty surface stays empty. Every colour family stays. Crisp focus across the whole picture.",
  interior: "Restyle this 3D render of a room as a photograph by giving its existing surfaces realistic plaster, glass, flooring and furniture textures under natural daylight. Nothing is added, removed, moved or resized. Light oak parquet in living areas and bedrooms, large pale porcelain tiles in kitchens and bathrooms. Crisp focus.",
};
const INTERIOR_VIEWS = new Set(["lobby", "hall", "design", "event-hall", "classroom", "workshop", "computers", "salon", "salon-wide", "kitchen", "bedroom-1", "bedroom-2", "bedroom-3", "entrance", "bathroom"]);

// A clean start: results older than this run are hidden unless asked for ("show previous"), and finished jobs are not carried over.
const SINCE = Date.now();
const STATE = path.join(OUT, "_state.json");
const LOG = path.join(OUT, "_server.log");
const note = (m) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch { /* disk */ } };
// A crash in one request or job must not take the program down or lose the queue.
process.on("uncaughtException", (e) => note(`uncaught ${e instanceof Error ? e.stack : String(e)}`));
process.on("unhandledRejection", (e) => note(`unhandled ${e instanceof Error ? e.stack : String(e)}`));

/** @type {Array<any>} */
const jobs = [];
const queue = [];
let running = false;
let current = null;
let child = null;

const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const safe = (s) => String(s).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60);
const rel = (p) => path.relative(OUT, p).split(path.sep).join("/");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args, opts, job) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { cwd: ROOT, windowsHide: true, ...opts });
    child = c;
    const add = (d) => { job.log = (job.log + d.toString()).slice(-12000); };
    c.stdout.on("data", add);
    c.stderr.on("data", add);
    c.on("close", (code) => { child = null; resolve(job.cancelled ? 130 : code); });
    c.on("error", (e) => { add(String(e)); resolve(1); });
  });
}

async function doRender(job) {
  const p = job.params;
  const { project, view, quality, file, area, style } = p;
  const dir = path.join(OUT, project === "pdf" ? `pdf-${safe(path.basename(file ?? "x", ".pdf"))}` : project);
  const tmp = path.join(dir, "_tmp", job.id);
  fs.mkdirSync(tmp, { recursive: true });
  let args;
  const env = { ...process.env };
  if (project === "image") {
    // No render: the picture is the source of the FLUX pass.
    const name = `${safe(path.basename(file, path.extname(file)))}-free-${stamp()}${path.extname(file)}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, name));
    return path.join(dir, name);
  }
  const needsShell = process.platform === "win32";
  if (project === "pisga") {
    args = ["tsx", "--conditions=react-server", "scripts/render-pisga.mts", "x", tmp, view];
    env.DXF = file || PISGA_DXF;
    env.PT = quality === "best" ? "1024" : quality === "traced" ? "512" : "0";
    env.SIZE = String(p.width || 2400);
    env.OUT = String(Math.min(2400, p.width || 2400));
    if (p.people) env.PEOPLE = "1";
    if (p.groundPhoto && fs.existsSync(GROUND_PHOTO)) env.PHOTO = GROUND_PHOTO;
  } else if (project === "apt20") {
    args = ["tsx", "--conditions=react-server", "scripts/_unit20-shots.mts", tmp, view];
  } else {
    if (!file) throw new Error("לא נבחר קובץ PDF");
    if (!area) throw new Error('חסר שטח ברוטו מודפס (מ"ר): הוא קובע את קנה המידה');
    args = ["tsx", "--conditions=react-server", "scripts/render-floorplan-3d.mts", "--pdf", file, "--area", String(area), "--style", style || "haredi_classic", "--out", tmp];
  }
  job.log += `$ npx ${args.join(" ")}\n`;
  const code = await run(NPX, args, { env, shell: needsShell }, job);
  if (job.cancelled) throw new Error("בוטל");
  const made = fs.existsSync(tmp) ? fs.readdirSync(tmp).filter((f) => /\.(jpe?g|png)$/i.test(f)) : [];
  if (code !== 0 || made.length === 0) throw new Error(`הרנדר נכשל (קוד ${code}). הפרטים בלוג.`);
  const name = `${safe(project === "pdf" ? `${view}-${style || "style"}` : view)}-free-${stamp()}.${made[0].split(".").pop()}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(path.join(tmp, made[0]), path.join(dir, name));
  fs.rmSync(tmp, { recursive: true, force: true });
  return path.join(dir, name);
}

async function doFlux(job) {
  const p = job.params;
  const source = path.join(OUT, p.src);
  if (!source.startsWith(OUT) || !fs.existsSync(source)) throw new Error("קובץ המקור לא נמצא");
  const base = path.basename(source).replace(/\.(jpe?g|png|webp)$/i, "").replace(/-free-.*/, "");
  const out = path.join(path.dirname(source), `${base}-flux-${stamp()}.jpg`);
  const promptFile = path.join(OUT, `_prompt-${job.id}.txt`);
  const preset = p.preset === "auto" ? (INTERIOR_VIEWS.has(p.view) ? "interior" : "exterior") : p.preset;
  fs.writeFileSync(promptFile, (p.prompt && p.prompt.trim()) || FLUX_PRESETS[preset] || FLUX_PRESETS.restyle, "utf8");
  const args = [path.join(HERE, "flux_job.py"), source, out, promptFile, String(p.steps ?? 2), String(p.width ?? 1024), String(p.cap ?? 14), String(p.sigma ?? 30), String(p.seed ?? 0)];
  job.log += `$ python flux_job.py ${path.basename(source)} steps=${p.steps ?? 2} width=${p.width ?? 1024}\n`;
  const code = await run(PY, args, { env: { ...process.env, FASTSD_DIR: FASTSD } }, job);
  fs.rmSync(promptFile, { force: true });
  if (job.cancelled) throw new Error("בוטל");
  if (code !== 0 || !fs.existsSync(out)) throw new Error(`FLUX נכשל (קוד ${code}). הפרטים בלוג.`);
  return out;
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    if (job.cancelled) { job.status = "error"; job.log += "בוטל"; continue; }
    current = job;
    job.status = "running";
    job.started = Date.now();
    save();
    try {
      const file = job.type === "render" ? await doRender(job) : await doFlux(job);
      job.result = rel(file);
      job.status = "done";
      // A full visualization: the FLUX pass of a view follows its render.
      if (job.type === "render" && job.params.thenFlux) {
        job.fluxQueued = true;
        const next = makeJob("flux", { ...job.params.flux, src: job.result, view: job.params.view }, job.batch);
        queue.unshift(next);
      }
    } catch (e) {
      job.status = "error";
      job.log += `\n${e instanceof Error ? e.message : String(e)}`;
    }
    job.finished = Date.now();
    current = null;
    save();
  }
  running = false;
}

function makeJob(type, params, batch) {
  const fileName = params.file ? ` · ${path.basename(params.file)}` : "";
  const label = type === "render" ? `רנדר · ${PROJECTS[params.project]?.title ?? params.project}${fileName} · ${VIEW_LABELS[params.view] ?? params.view}` : `FLUX · ${VIEW_LABELS[params.view] ?? path.basename(params.src ?? "")}`;
  const job = { id: stamp() + Math.random().toString(36).slice(2, 6), type, title: label, status: "queued", log: "", created: Date.now(), params, batch: batch ?? null };
  jobs.push(job);
  save();
  return job;
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { const tmp = STATE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(jobs.slice(-300))); fs.renameSync(tmp, STATE); } catch (e) { note(`save ${String(e)}`); }
  }, 300);
}
setInterval(save, 2000);

/** After a restart: what was waiting or running goes back in the queue (a render that finished but whose FLUX pass was not yet queued gets it now). */
function resume() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return; }
  for (const j of list) {
    if (j.status === "running" || j.status === "queued") jobs.push(j);
    if (j.status === "running" || j.status === "queued") { j.status = "queued"; j.log = (j.log ?? "") + "\n[התוכנה הופעלה מחדש: העבודה חוזרת לתור]\n"; queue.push(j); }
    else if (j.status === "done" && j.type === "render" && j.params?.thenFlux && !j.fluxQueued && j.result) {
      j.fluxQueued = true;
      queue.push(makeJob("flux", { ...j.params.flux, src: j.result, view: j.params.view }, j.batch));
    }
  }
  if (queue.length) { note(`resumed ${queue.length} jobs`); setTimeout(pump, 500); }
}

function listResults(all) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("_")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jpe?g|png)$/i.test(e.name) && (all || fs.statSync(p).mtimeMs >= SINCE)) out.push({ path: rel(p), time: fs.statSync(p).mtimeMs });
    }
  };
  walk(OUT);
  return out.sort((a, b) => b.time - a.time);
}

const TYPES = {
  ".pdf": { project: "pdf", label: "תוכנית דירה (PDF)" },
  ".dxf": { project: "pisga", label: "שרטוט DXF (מסלול מרכז פסגה)" },
  ".jpg": { project: "image", label: "תמונה" }, ".jpeg": { project: "image", label: "תמונה" }, ".png": { project: "image", label: "תמונה" }, ".webp": { project: "image", label: "תמונה" },
};
const NOT_YET = { ".dwg": "DWG: יש להמיר ל-DXF בתוכנית שרטוט (AutoCAD: שמירה בשם → DXF) ואז לבחור את הקובץ.", ".dwf": "DWF: המסלול קיים רק כסקריפט בטרמינל (booklet-dwf.mts) ועדיין לא מחובר לסטודיו.", ".dwfx": "DWFX: כמו DWF, עדיין לא מחובר לסטודיו." };

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".html": "text/html; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/") return send(res, 200, fs.readFileSync(path.join(HERE, "index.html")), MIME[".html"]);
    if (url.pathname === "/api/config") {
      return send(res, 200, { projects: PROJECTS, presets: Object.keys(FLUX_PRESETS), presetText: FLUX_PRESETS, presetLabels: PRESET_LABELS, viewLabels: VIEW_LABELS, styles: STYLES, styleLabels: STYLE_LABELS, out: OUT, groundPhoto: fs.existsSync(GROUND_PHOTO) });
    }
    if (url.pathname === "/api/probe") {
      const f = url.searchParams.get("path") ?? "";
      const ext = path.extname(f).toLowerCase();
      if (!f || !fs.existsSync(f)) return send(res, 200, { ok: false, error: "הקובץ לא נמצא" });
      if (NOT_YET[ext]) return send(res, 200, { ok: false, error: NOT_YET[ext] });
      const t = TYPES[ext];
      if (!t) return send(res, 200, { ok: false, error: `סוג קובץ לא נתמך (${ext || "ללא סיומת"}). נתמכים: PDF, DXF, JPG, PNG, WEBP` });
      return send(res, 200, { ok: true, project: t.project, label: t.label, size: fs.statSync(f).size });
    }
    if (url.pathname === "/api/pick") {
      // The system's own "open file" window, so any file on the machine can be chosen (a page cannot read a real path by itself).
      const ps = "Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.OpenFileDialog; $f.Title='בחירת קבצים (אפשר כמה)'; $f.Multiselect=$true; $f.Filter='כל הקבצים הנתמכים|*.pdf;*.dxf;*.jpg;*.jpeg;*.png;*.webp|כל הקבצים|*.*'; $o=New-Object System.Windows.Forms.Form; $o.TopMost=$true; if($f.ShowDialog($o) -eq 'OK'){[Console]::OutputEncoding=[Text.Encoding]::UTF8; $f.FileNames | ForEach-Object { Write-Output $_ }}";
      const picked = await new Promise((r) => execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", ps], { encoding: "utf8", windowsHide: false }, (_e, out) => r(String(out ?? "").trim())));
      return send(res, 200, { paths: picked.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) });
    }
    if (url.pathname === "/api/results") return send(res, 200, listResults(url.searchParams.get("all") === "1"));
    if (url.pathname === "/api/delete" && req.method === "POST") {
      // Deleting attempts: chosen files, or every result (and the half-made temp folders), and the list of finished jobs.
      const b = await readBody(req);
      let n = 0;
      const rm = (p) => { try { fs.rmSync(p, { force: true }); n++; } catch { /* in use */ } };
      if (b.all) {
        for (const r of listResults(true)) rm(path.join(OUT, r.path));
        for (const d of fs.readdirSync(OUT, { withFileTypes: true })) if (d.isDirectory()) fs.rmSync(path.join(d.parentPath ?? OUT, d.name, "_tmp"), { recursive: true, force: true });
      } else for (const p of b.paths ?? []) { const f = path.join(OUT, p); if (f.startsWith(OUT) && /\.(jpe?g|png)$/i.test(f)) rm(f); }
      for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].status === "done" || jobs[i].status === "error") jobs.splice(i, 1);
      save();
      return send(res, 200, { deleted: n });
    }
    if (url.pathname === "/api/jobs" && req.method === "GET") return send(res, 200, jobs.slice(-200).map((j) => ({ id: j.id, type: j.type, title: j.title, status: j.status, batch: j.batch, result: j.result, created: j.created, started: j.started, finished: j.finished, log: j.status === "queued" ? "" : j.log.slice(-1200) })));
    if (url.pathname === "/api/jobs" && req.method === "POST") {
      const b = await readBody(req);
      // A batch: one entry per chosen view; each render may chain its FLUX pass.
      const batch = stamp() + Math.random().toString(36).slice(2, 5);
      const made = [];
      if (b.type === "batch") {
        for (const view of b.views ?? []) {
          const params = { ...b.render, project: b.project, view, thenFlux: !!b.flux, flux: b.flux ? { ...b.flux, preset: b.flux.preset } : undefined };
          const j = makeJob("render", params, batch);
          queue.push(j);
          made.push(j.id);
        }
      } else if (b.type === "flux") {
        const j = makeJob("flux", b, batch);
        queue.push(j);
        made.push(j.id);
      } else return send(res, 400, { error: "סוג עבודה לא מוכר" });
      pump();
      return send(res, 200, { ids: made, batch });
    }
    if (url.pathname === "/api/cancel" && req.method === "POST") {
      // Stop what is running and drop everything waiting.
      for (const j of queue) j.cancelled = true;
      if (current) current.cancelled = true;
      if (child) { try { execFile("taskkill", ["/F", "/T", "/PID", String(child.pid)], () => {}); } catch { /* gone */ } }
      queue.length = 0;
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/open" && req.method === "POST") {
      const b = await readBody(req);
      const target = b.path ? path.join(OUT, b.path) : OUT;
      if (!target.startsWith(OUT)) return send(res, 400, { error: "נתיב לא חוקי" });
      execFile("explorer.exe", b.path && fs.existsSync(target) && fs.statSync(target).isFile() ? ["/select,", target] : [target], () => {});
      return send(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/files/")) {
      const f = path.join(OUT, decodeURIComponent(url.pathname.slice(7)));
      if (!f.startsWith(OUT) || !fs.existsSync(f)) return send(res, 404, "לא נמצא", "text/plain");
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] ?? "application/octet-stream");
    }
    send(res, 404, "לא נמצא", "text/plain");
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}).listen(PORT, "127.0.0.1", () => { console.log(`סטודיו הדמיות: http://localhost:${PORT}`); resume(); });
