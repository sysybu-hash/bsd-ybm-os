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
 * Env: STUDIO_PORT (4747), STUDIO_PY (the Python with FastSD), FASTSD_DIR,.
 */
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChat } from "./agent.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(ROOT, "previews", "studio");
const PORT = Number(process.env.STUDIO_PORT ?? 4747);
const PY = process.env.STUDIO_PY ?? "C:\\Users\\User\\AI\\fastsdcpu\\env\\Scripts\\python.exe";
const FASTSD = process.env.FASTSD_DIR ?? "C:\\Users\\User\\AI\\fastsdcpu";
/** Hebrew names for the few views a kind offers: the page shows these, the scripts get the ids. */
const VIEW_LABELS = { overview: "מבט כללי מלמעלה", dollhouse: "בית בובות (חתך קומות)", image: "התמונה שנבחרה" };
const PRESET_LABELS = { restyle: "כללי: להפוך לצילום", exterior: "חוץ: אבן, זכוכית, שמש", interior: "פנים: טיח, פרקט, אריחים" };
const STYLES = ["contemporary", "luxury", "scandi", "jerusalem_stone", "developer_white", "haredi_classic", "haredi_modern"];
const STYLE_LABELS = { contemporary: "עכשווי", luxury: "יוקרה", scandi: "סקנדינבי", jerusalem_stone: "אבן ירושלמית", developer_white: "לבן יזמי", haredi_classic: "חרדי קלאסי", haredi_modern: "חרדי מודרני" };

/**
 * What the program can build, by the kind of input. No project is built in: the architect hands over files, each kind says what it needs. The routes behind
 * them are the platform's own general ones (lib/projects/building): house sheets, a permit strip, one flat from a strip, one flat from a plan PDF; a picture goes
 * straight to the local FLUX.
 */
const KINDS = {
  house: { title: "בית או בניין משרטוטי קומות וחזיתות", note: "כל קובץ מקבל תפקיד (קרקע, קומה 1…, חזיתות). יוצאת חוברת עם הדמיות", accepts: [".dxf", ".dwf"], group: true, views: [] },
  permit: { title: "בניין ממערכת היתר (DWF)", note: "גרמושקה שלמה: מודל הבניין, חזיתות ודירות, חוברת PDF", accepts: [".dwf"], needs: ["name"], views: [] },
  unit: { title: "דירה אחת ממערכת היתר (DWF)", note: "הדירה לפי המספר שלה בגרמושקה", accepts: [".dwf"], needs: ["unit", "style"], views: ["overview", "dollhouse"] },
  pdf: { title: "דירה מתוכנית PDF", note: "תוכנית של דירה אחת. שטח ברוטו מודפס קובע את קנה המידה", accepts: [".pdf"], needs: ["area", "style"], views: ["overview"] },
  image: { title: "תמונה (רק FLUX)", note: "תמונה קיימת, בלי רנדר: מנוע FLUX מעבד אותה", accepts: [".jpg", ".jpeg", ".png", ".webp"], views: ["image"] },
};
/** Which kinds an extension can be: the first is the default for a single file. */
const EXT_KINDS = { ".dxf": ["house"], ".dwf": ["permit", "unit", "house"], ".pdf": ["pdf"], ".jpg": ["image"], ".jpeg": ["image"], ".png": ["image"], ".webp": ["image"] };
const NOT_SUPPORTED = {
  ".dwg": "DWG: צריך להמיר ל-DXF (בתוכנת השרטוט: שמירה בשם → DXF) ואז לבחור את הקובץ שוב.",
  ".dwfx": "DWFX: פורמט שונה מ-DWF. יש לייצא מחדש כ-DWF, או להמיר ל-DXF.",
  ".rvt": "Revit: יש לייצא ל-DXF או ל-DWF.",
  ".ifc": "IFC: עדיין לא נתמך. יש לייצא ל-DXF או ל-DWF.",
  ".skp": "SketchUp: עדיין לא נתמך. יש לייצא ל-DXF.",
};

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

/** What a failed build most often means, in the architect's words (the log keeps the original). */
const KNOWN_ERRORS = [
  [/no floor sheet with a level mark/, "בשרטוטי הקומות לא נמצאו סימוני מפלס (למשל ±0.00 או +3.00), ובלעדיהם הקורא הכללי לא יודע איזו קומה היא איזו. בדקו שהתפקידים של הקבצים נכונים, או שהשרטוט כולל סימוני מפלס."],
  [/אי אפשר לבנות בית מהקבצים/, "המערכת לא הצליחה לזהות קומות וחזיתות. סמנו תפקיד לכל קובץ (קרקע, קומה 1, חזיתות)."],
  [/cannot read|לא ניתן לקרוא/i, "אי אפשר לקרוא את אחד הקבצים. ייתכן שהקובץ פגום או בפורמט שאינו נתמך."],
];

const roleName = (r) => (r === "ground" ? "ground" : r === "facades" ? "facades" : /^floor\d+$/.test(r) ? r : null);

/** Runs one tsx script and moves what it made into the results folder. Pictures first, then the booklet. */
async function collect(job, tmp, dir, label) {
  const made = fs.existsSync(tmp) ? fs.readdirSync(tmp).filter((f) => /\.(jpe?g|png|pdf)$/i.test(f)) : [];
  if (!made.length) throw new Error("לא נוצרו קבצים. הפרטים בלוג.");
  fs.mkdirSync(dir, { recursive: true });
  const t = stamp();
  const out = [];
  for (const f of made) {
    const ext = path.extname(f);
    const name = `${safe(label)}-${safe(path.basename(f, ext))}-free-${t}${ext}`;
    fs.renameSync(path.join(tmp, f), path.join(dir, name));
    out.push(path.join(dir, name));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return out.find((f) => /\.(jpe?g|png)$/i.test(f)) ?? out[0];
}

async function doRender(job) {
  const p = job.params;
  const { project: kind, quality, file, area, style } = p;
  const view = p.view || "overview";
  const label = p.name ? safe(p.name) : file ? safe(path.basename(file, path.extname(file))) : kind;
  const dir = path.join(OUT, `${kind}-${label}`);
  const tmp = path.join(dir, "_tmp", job.id);
  fs.mkdirSync(tmp, { recursive: true });
  const shell = process.platform === "win32";
  const env = { ...process.env };
  let args;
  if (kind === "image") {
    // No render: the picture is the source of the FLUX pass.
    const name = `${label}-free-${stamp()}${path.extname(file)}`;
    fs.rmSync(path.join(dir, "_tmp"), { recursive: true, force: true });
    fs.copyFileSync(file, path.join(dir, name));
    return path.join(dir, name);
  }
  if (kind === "house") {
    // Each file under the name the house reader looks its role up by: "<model>-<role>.<ext>" (a DXF with several layout tabs keeps its own name).
    const inDir = path.join(tmp, "_in");
    fs.mkdirSync(inDir, { recursive: true });
    const copies = [];
    for (const f of p.files ?? []) {
      if (f.role === "skip") continue;
      const ext = path.extname(f.path);
      const rn = roleName(f.role);
      const to = path.join(inDir, rn ? `${safe(f.model || "A")}-${rn}${ext}` : safe(path.basename(f.path, ext)) + ext);
      fs.copyFileSync(f.path, to);
      copies.push(to);
    }
    if (!copies.length) throw new Error("לא נבחרו קבצים לבנייה");
    args = ["tsx", "--conditions=react-server", "scripts/studio/run-house.mts", tmp, p.name || "בית", ...copies];
  } else if (kind === "permit") {
    if (!file) throw new Error("לא נבחר קובץ DWF");
    args = ["tsx", "--conditions=react-server", "scripts/booklet-dwf.mts", "--dwf", file, "--name", p.name || path.basename(file, path.extname(file)), "--out", path.join(tmp, "booklet.pdf")];
    if (quality === "traced") args.push("--trace", "128");
  } else if (kind === "unit") {
    if (!file) throw new Error("לא נבחר קובץ DWF");
    if (!p.unit) throw new Error("חסר מספר דירה");
    args = ["tsx", "--conditions=react-server", "scripts/render-dwf-flat.mts", "--dwf", file, "--unit", String(p.unit), "--view", view, "--style", style || "haredi_classic", "--out", tmp];
  } else if (kind === "pdf") {
    if (!file) throw new Error("לא נבחר קובץ PDF");
    if (!area) throw new Error('חסר שטח ברוטו מודפס (מ"ר): הוא קובע את קנה המידה');
    args = ["tsx", "--conditions=react-server", "scripts/render-floorplan-3d.mts", "--pdf", file, "--area", String(area), "--style", style || "haredi_classic", "--out", tmp];
  } else throw new Error(`סוג עבודה לא מוכר: ${kind}`);
  job.log += `$ npx ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}\n`;
  // cmd.exe splits on spaces: anything with one is quoted for it.
  const code = await run(NPX, shell ? args.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : args, { env, shell }, job);
  if (job.cancelled) throw new Error("בוטל");
  if (code !== 0) {
    const known = KNOWN_ERRORS.find(([re]) => re.test(job.log));
    throw new Error(`הבנייה נכשלה (קוד ${code}). ${known ? known[1] : "הפרטים בלוג."}`);
  }
  return collect(job, tmp, dir, kind === "house" ? "house" : view);
}

async function doFlux(job) {
  const p = job.params;
  const source = path.join(OUT, p.src);
  if (!source.startsWith(OUT) || !fs.existsSync(source)) throw new Error("קובץ המקור לא נמצא");
  const base = path.basename(source).replace(/\.(jpe?g|png|webp)$/i, "").replace(/-free-.*/, "");
  const out = path.join(path.dirname(source), `${base}-flux-${stamp()}.jpg`);
  const promptFile = path.join(OUT, `_prompt-${job.id}.txt`);
  const preset = p.preset === "auto" ? (INTERIOR_VIEWS.has(p.view) || /room|salon|kitchen|bed|bath|interior|flat|apart|plan|unit|pdf/i.test(p.src ?? "") ? "interior" : "exterior") : p.preset;
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
    if (job.cancelled) { job.status = "cancelled"; continue; }
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
      job.status = job.cancelled ? "cancelled" : "error";
      job.log += `\n${e instanceof Error ? e.message : String(e)}`;
    }
    job.finished = Date.now();
    current = null;
    save();
  }
  running = false;
}

function makeJob(type, params, batch) {
  const fileName = params.name ? ` · ${params.name}` : params.file ? ` · ${path.basename(params.file)}` : "";
  const label = type === "render" ? `בנייה · ${KINDS[params.project]?.title ?? params.project}${fileName}${params.view && KINDS[params.project]?.views?.length > 1 ? ` · ${VIEW_LABELS[params.view] ?? params.view}` : ""}` : `FLUX · ${VIEW_LABELS[params.view] ?? path.basename(params.src ?? "")}`;
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
      else if (/\.(jpe?g|png|pdf)$/i.test(e.name) && (all || fs.statSync(p).mtimeMs >= SINCE)) out.push({ path: rel(p), time: fs.statSync(p).mtimeMs });
    }
  };
  walk(OUT);
  return out.sort((a, b) => b.time - a.time);
}

/** One job per item (a house is one item made of several files); FLUX follows the single-picture kinds when asked. */
function enqueueBuild(items, flux, batch = stamp()) {
  const ids = [];
  for (const it of items) {
    const single = it.project !== "house" && it.project !== "permit";
    const j = makeJob("render", { ...it, thenFlux: !!flux && single, flux: flux ?? undefined }, batch);
    queue.push(j);
    ids.push(j.id);
  }
  pump();
  return ids;
}
const fluxDefaults = () => ({ preset: "auto", steps: 2, width: 1024, cap: 14, sigma: 30, seed: 0 });
const probeHouse = (paths) => new Promise((r) => {
  const c = spawn(NPX, ["tsx", "--conditions=react-server", "scripts/studio/probe-files.mts", ...paths].map((x) => (process.platform === "win32" && /\s/.test(x) ? `"${x}"` : x)), { cwd: ROOT, windowsHide: true, shell: process.platform === "win32" });
  let o = "";
  c.stdout.on("data", (d) => (o += d));
  c.stderr.on("data", (d) => (o += d));
  c.on("close", () => { const line = o.split("\n").find((l) => l.startsWith("PROBE ")); r(line ? JSON.parse(line.slice(6)) : { ok: false, problems: ["הבדיקה נכשלה: " + o.slice(-300)], models: [] }); });
  c.on("error", () => r({ ok: false, problems: ["הבדיקה לא הופעלה"], models: [] }));
});
const chatDeps = {
  ROOT, KINDS, EXT_KINDS, NOT_SUPPORTED, probeHouse, fluxDefaults,
  startBuild: enqueueBuild,
  status: () => ({ counts: jobs.reduce((a, j) => ((a[j.status] = (a[j.status] ?? 0) + 1), a), {}), jobs: jobs.slice(-15).map((j) => ({ id: j.id, title: j.title, status: j.status, result: j.result })), results: listResults(false).slice(0, 25).map((r) => r.path) }),
  jobLog: (id) => { const j = jobs.find((x) => x.id === id); return j ? { status: j.status, log: j.log.slice(-1800) } : null; },
  cancel: (ids) => { const set = ids?.length ? new Set(ids) : null; let n = 0; for (const j of jobs) if ((!set || set.has(j.id)) && (j.status === "queued" || j.status === "running")) { j.cancelled = true; if (j.status === "queued") { j.status = "cancelled"; const i = queue.indexOf(j); if (i >= 0) queue.splice(i, 1); } else if (child) execFile("taskkill", ["/F", "/T", "/PID", String(child.pid)], () => {}); n++; } save(); return { cancelled: n }; },
  runFlux: (p) => { const src = String(p.src ?? ""); if (!fs.existsSync(path.join(OUT, src))) return { error: "תמונת המקור לא נמצאה" }; const j = makeJob("flux", { ...fluxDefaults(), ...p, src, view: "" }); queue.push(j); pump(); return { queued: j.id }; },
};

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
const MIME = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".html": "text/html; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/") return send(res, 200, fs.readFileSync(path.join(HERE, "index.html")), MIME[".html"]);
    if (url.pathname === "/api/config") {
      return send(res, 200, { kinds: KINDS, extKinds: EXT_KINDS, presets: Object.keys(FLUX_PRESETS), presetText: FLUX_PRESETS, presetLabels: PRESET_LABELS, viewLabels: VIEW_LABELS, styles: STYLES, styleLabels: STYLE_LABELS, out: OUT });
    }
    if (url.pathname === "/api/probe") {
      const f = url.searchParams.get("path") ?? "";
      const ext = path.extname(f).toLowerCase();
      if (!f || !fs.existsSync(f)) return send(res, 200, { ok: false, error: "הקובץ לא נמצא" });
      if (NOT_SUPPORTED[ext]) return send(res, 200, { ok: false, error: NOT_SUPPORTED[ext] });
      const kinds = EXT_KINDS[ext];
      if (!kinds) return send(res, 200, { ok: false, error: `סוג קובץ לא נתמך (${ext || "ללא סיומת"}). נתמכים: DXF, DWF, PDF, JPG, PNG, WEBP` });
      return send(res, 200, { ok: true, kinds, size: fs.statSync(f).size });
    }
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const b = await readBody(req);
      return send(res, 200, await runChat({ messages: b.messages ?? [], ui: b.ui, deps: chatDeps }));
    }
    if (url.pathname === "/api/probe-house" && req.method === "POST") {
      // What the platform's house reader makes of these files (models, floors, facades, what is missing), without building anything.
      const b = await readBody(req);
      const out = await new Promise((r) => {
        const c = spawn(NPX, ["tsx", "--conditions=react-server", "scripts/studio/probe-files.mts", ...(b.paths ?? [])].map((x) => (process.platform === "win32" && /\s/.test(x) ? `"${x}"` : x)), { cwd: ROOT, windowsHide: true, shell: process.platform === "win32" });
        let s = "";
        c.stdout.on("data", (d) => (s += d));
        c.stderr.on("data", (d) => (s += d));
        c.on("close", () => r(s));
        c.on("error", () => r(""));
      });
      const line = out.split("\n").find((l) => l.startsWith("PROBE "));
      return send(res, 200, line ? JSON.parse(line.slice(6)) : { ok: false, problems: ["הבדיקה נכשלה: " + out.slice(-300)], models: [] });
    }
    if (url.pathname === "/api/pick") {
      // The system's own "open file" window, so any file on the machine can be chosen (a page cannot read a real path by itself).
      const ps = "Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.OpenFileDialog; $f.Title='בחירת קבצים (אפשר כמה)'; $f.Multiselect=$true; $f.Filter='כל הקבצים הנתמכים|*.dxf;*.dwf;*.pdf;*.jpg;*.jpeg;*.png;*.webp|כל הקבצים|*.*'; $o=New-Object System.Windows.Forms.Form; $o.TopMost=$true; if($f.ShowDialog($o) -eq 'OK'){[Console]::OutputEncoding=[Text.Encoding]::UTF8; $f.FileNames | ForEach-Object { Write-Output $_ }}";
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
      } else for (const p of b.paths ?? []) { const f = path.join(OUT, p); if (f.startsWith(OUT) && /\.(jpe?g|png|pdf)$/i.test(f)) rm(f); }
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
      if (b.type === "build") {
        made.push(...enqueueBuild(b.items ?? [], b.flux ?? null, batch));
      } else if (b.type === "batch") {
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
      // With an id: that one job (waiting: out of the queue; running: stopped, the next one starts). Without: everything.
      const b = await readBody(req);
      const killRunning = () => { if (child) { try { execFile("taskkill", ["/F", "/T", "/PID", String(child.pid)], () => {}); } catch { /* gone */ } } };
      const stop = (j) => { j.cancelled = true; if (j.status === "queued") { j.status = "cancelled"; j.finished = Date.now(); const i = queue.indexOf(j); if (i >= 0) queue.splice(i, 1); } };
      const ids = b.ids ?? (b.id ? [b.id] : null);
      if (ids) {
        const set = new Set(ids);
        for (const j of jobs.filter((x) => set.has(x.id))) { stop(j); if (j === current) killRunning(); }
      } else {
        for (const j of [...queue]) stop(j);
        if (current) { current.cancelled = true; killRunning(); }
      }
      save();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/job-remove" && req.method === "POST") {
      // Takes finished, failed and cancelled jobs off the list (a running or waiting one must be cancelled first).
      const b = await readBody(req);
      for (let i = jobs.length - 1; i >= 0; i--) if ((b.ids ? b.ids.includes(jobs[i].id) : b.id ? jobs[i].id === b.id : true) && !["queued", "running"].includes(jobs[i].status)) jobs.splice(i, 1);
      save();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/open" && req.method === "POST") {
      const b = await readBody(req);
      const target = b.path ? path.join(OUT, b.path) : OUT;
      if (!target.startsWith(OUT)) return send(res, 400, { error: "נתיב לא חוקי" });
      if (b.run && b.path && fs.existsSync(target)) { execFile("cmd.exe", ["/c", "start", "", target], { windowsHide: true }, () => {}); return send(res, 200, { ok: true }); }
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
