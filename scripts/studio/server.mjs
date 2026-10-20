#!/usr/bin/env node
/**
 * BSD-YBM Viz Studio — a local page for the free renderer and the local FLUX engine.
 *
 *   node scripts/studio/server.mjs            (then open http://localhost:4747)
 *
 * No dependencies. Everything runs on this machine: a render is `npx tsx scripts/...` (the same scripts the terminal uses), a FLUX pass is the
 * Python script beside this file run in the FastSD environment. Jobs go through one queue, one at a time, so the renderer and the engine never
 * fight over the CPU and the GPU. Results are files under previews/studio, listed and served from there.
 *
 * Env: STUDIO_PORT (4747), STUDIO_PY (the Python with FastSD, default C:\Users\User\AI\fastsdcpu\env\Scripts\python.exe),
 *      PISGA_DXF (the Pisga drawing), FASTSD_DIR (default C:\Users\User\AI\fastsdcpu).
 */
import { spawn } from "node:child_process";
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
fs.mkdirSync(OUT, { recursive: true });

const PISGA_VIEWS = ["aerial-ne", "aerial-sw", "north-facade", "courtyard", "site", "east-side", "west-side", "roof-top", "end-e", "end-w", "north-terrace", "lobby", "hall", "design", "event-hall", "classroom", "workshop", "computers"];
const APT20_VIEWS = ["overview", "salon", "salon-wide", "kitchen", "bedroom-1", "bedroom-2", "bedroom-3", "entrance", "bathroom"];

const PROJECTS = {
  pisga: { title: "מרכז פסגה (DXF)", views: PISGA_VIEWS, qualities: { fast: "מהיר (רסטר)", traced: "מעקב קרניים 512", best: "מעקב קרניים 1024 (איטי)" } },
  apt20: { title: "דירה 20 (מדידה ידנית)", views: APT20_VIEWS, qualities: { fast: "רגיל" } },
  pdf: { title: "דירה מ-PDF של תוכנית", views: ["overview"], qualities: { fast: "רגיל" }, needs: ["pdf", "area"] },
};

const FLUX_PRESETS = {
  restyle: "Restyle this 3D render as a photograph by giving its existing surfaces realistic textures under natural daylight. Nothing is added, removed, moved or resized: every window, door, piece of furniture and fixture keeps its place, count, size and shape. Crisp focus.",
  exterior: "Restyle this 3D render of a building as a photograph by giving its existing surfaces realistic limestone, glass, paving, asphalt and soil textures under natural sunlight. Nothing is added, removed, moved or resized; every empty surface stays empty. Every colour family stays. Crisp focus across the whole picture.",
  interior: "Restyle this 3D render of a room as a photograph by giving its existing surfaces realistic plaster, glass, flooring and furniture textures under natural daylight. Nothing is added, removed, moved or resized. Light oak parquet in living areas and bedrooms, large pale porcelain tiles in kitchens and bathrooms. Crisp focus.",
};

/** @type {Array<{id:string,type:string,title:string,status:string,log:string,created:number,result?:string,params:any}>} */
const jobs = [];
const queue = [];
let running = false;

const stamp = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const safe = (s) => String(s).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60);
const rel = (p) => path.relative(OUT, p).split(path.sep).join("/");

function run(cmd, args, opts, job) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, shell: false, windowsHide: true, ...opts });
    const add = (d) => { job.log = (job.log + d.toString()).slice(-12000); };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    child.on("close", (code) => resolve(code));
    child.on("error", (e) => { add(String(e)); resolve(1); });
  });
}

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

async function doRender(job) {
  const { project, view, quality, pdf, area } = job.params;
  const dir = path.join(OUT, project);
  const tmp = path.join(dir, "_tmp", job.id);
  fs.mkdirSync(tmp, { recursive: true });
  let args, env = { ...process.env };
  if (project === "pisga") {
    args = ["tsx", "--conditions=react-server", "scripts/render-pisga.mts", "x", tmp, view];
    env.DXF = PISGA_DXF;
    env.PT = quality === "best" ? "1024" : quality === "traced" ? "512" : "0";
    env.SIZE = quality === "fast" ? "2400" : "2400";
    env.OUT = "2400";
  } else if (project === "apt20") {
    args = ["tsx", "--conditions=react-server", "scripts/_unit20-shots.mts", tmp, view === "overview" ? "overview" : view];
  } else {
    args = ["tsx", "--conditions=react-server", "scripts/render-floorplan-3d.mts", "--pdf", pdf, "--area", String(area), "--out", tmp];
  }
  job.log += `$ npx ${args.join(" ")}\n`;
  const code = await run(NPX, args, { env, shell: process.platform === "win32" }, job);
  const made = fs.readdirSync(tmp).filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (code !== 0 || made.length === 0) throw new Error(`render failed (exit ${code})`);
  const name = `${safe(view)}-free-${stamp()}.${made[0].split(".").pop()}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(path.join(tmp, made[0]), path.join(dir, name));
  fs.rmSync(tmp, { recursive: true, force: true });
  return path.join(dir, name);
}

async function doFlux(job) {
  const { src, preset, prompt, steps, width } = job.params;
  const source = path.join(OUT, src);
  if (!source.startsWith(OUT) || !fs.existsSync(source)) throw new Error("source not found");
  const base = path.basename(source).replace(/\.(jpe?g|png)$/i, "").replace(/-free-.*/, "");
  const out = path.join(path.dirname(source), `${base}-flux-${stamp()}.jpg`);
  const promptFile = path.join(OUT, "_prompt.txt");
  fs.writeFileSync(promptFile, (prompt && prompt.trim()) || FLUX_PRESETS[preset] || FLUX_PRESETS.restyle, "utf8");
  const args = [path.join(HERE, "flux_job.py"), source, out, promptFile, String(steps ?? 2), String(width ?? 1024)];
  job.log += `$ python flux_job.py ${path.basename(source)} steps=${steps ?? 2} width=${width ?? 1024}\n`;
  const code = await run(PY, args, { env: { ...process.env, FASTSD_DIR: FASTSD } }, job);
  if (code !== 0 || !fs.existsSync(out)) throw new Error(`FLUX failed (exit ${code})`);
  return out;
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    job.status = "running";
    try {
      const file = job.type === "render" ? await doRender(job) : await doFlux(job);
      job.result = rel(file);
      job.status = "done";
    } catch (e) {
      job.status = "error";
      job.log += `\n${e instanceof Error ? e.message : String(e)}`;
    }
  }
  running = false;
}

function listResults() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith("_")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jpe?g|png)$/i.test(e.name)) out.push({ path: rel(p), time: fs.statSync(p).mtimeMs });
    }
  };
  walk(OUT);
  return out.sort((a, b) => b.time - a.time);
}

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
    if (url.pathname === "/api/config") return send(res, 200, { projects: PROJECTS, presets: Object.keys(FLUX_PRESETS), presetText: FLUX_PRESETS });
    if (url.pathname === "/api/results") return send(res, 200, listResults());
    if (url.pathname === "/api/jobs" && req.method === "GET") return send(res, 200, jobs.slice(-40).map((j) => ({ ...j, log: j.log.slice(-1500) })));
    if (url.pathname === "/api/jobs" && req.method === "POST") {
      const b = await readBody(req);
      if (!["render", "flux"].includes(b.type)) return send(res, 400, { error: "type" });
      const job = { id: stamp() + Math.random().toString(36).slice(2, 6), type: b.type, title: b.type === "render" ? `${b.project} · ${b.view}` : `FLUX · ${path.basename(b.src ?? "")}`, status: "queued", log: "", created: Date.now(), params: b };
      jobs.push(job);
      queue.push(job);
      pump();
      return send(res, 200, { id: job.id });
    }
    if (url.pathname.startsWith("/files/")) {
      const f = path.join(OUT, decodeURIComponent(url.pathname.slice(7)));
      if (!f.startsWith(OUT) || !fs.existsSync(f)) return send(res, 404, "not found", "text/plain");
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] ?? "application/octet-stream");
    }
    send(res, 404, "not found", "text/plain");
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Viz Studio: http://localhost:${PORT}`));
