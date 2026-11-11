/**
 * Factory (Delicatess, Kiryat Arba) — the visualization booklet of both proposals, in the system's own design (buildProjectBookletHtml,
 * A3 landscape: the factory's pictures are wide), like the flats' booklets: a cover with the comparison table; per proposal its opening
 * page with its data, a site plan with its legend and the place of every outside picture, a plan of each storey with its spaces
 * numbered, then each picture with a small map of where it was taken; and a closing chapter setting the two proposals side by side.
 * Plan labels are numbers only (Chromium mixes Hebrew and numbers in an SVG shown as an image); the names stand in the tables.
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/_factory/booklet.mts "<מודל dir>" <out.pdf>
 * Per proposal it reads report.json, model.json, views.json, the free renders ("סט הדמיות - פיתוח וכניסה") and the chosen paintings
 * ("צבועות/נבחרות/<view>.jpg"; a view with no painting chosen shows its render).
 */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const [modelsArg, outPdf] = process.argv.slice(2) as [string, string];
const { buildProjectBookletHtml, BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");
const { withLogo } = await import("../_unit14-logo.mts");
type BookletImage = import("@/lib/projects/building/booklet-html").BookletImage;
type P2 = [number, number];
type Cam = { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fovDeg: number };
type Tally = Record<string, { read: number; built: number; merged: number; dropped: number; why: string[] }>;
type Room = { name: string; areaM2: number; ring: P2[] };
type Prim = { type: string; tag?: string; ring?: P2[]; centre?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number }; rotY?: number; at?: { x: number; y: number; z: number }; crown?: number; photo?: { src: string; pw: number; ph: number; s: number; cu: number; cv: number; cx: number; cz: number } };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = (n: number) => n.toFixed(1);
const f0 = (n: number) => Math.round(n).toLocaleString("en-US");
const img = async (buf: Buffer, mime = "image/jpeg"): Promise<BookletImage> => { const m = await sharp(buf).metadata(); return { mimeType: mime, base64: buf.toString("base64"), width: m.width, height: m.height }; };
const svgImage = (svg: string, width: number, height: number): BookletImage => ({ mimeType: "image/svg+xml", base64: Buffer.from(svg).toString("base64"), width, height });
const area = (r: P2[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const centroid = (r: P2[]): P2 => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const num = (s: string | undefined, re: RegExp) => Number(s?.match(re)?.[1] ?? NaN);

// ---- the two proposals ------------------------------------------------------------------------------------------------
type Opt = Awaited<ReturnType<typeof load>>;
async function load(n: 1 | 2) {
  const dir = path.join(modelsArg, `הצעה ${n}`);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8"));
  const model = JSON.parse(fs.readFileSync(path.join(dir, "model.json"), "utf8")) as { primitives: Prim[] };
  const cams = new Map((JSON.parse(fs.readFileSync(path.join(dir, "views.json"), "utf8")) as Array<{ id: string; camera: Cam }>).map((v) => [v.id, v.camera]));
  const renders = ["סט הדמיות - דלתות פריקה וחלונות", "סט הדמיות - תלת מימד ומדרגות", "סט הדמיות - מתוקן", "סט הדמיות - רמפה מתוקנת", "סט הדמיות - פיתוח וכניסה"].map((n) => path.join(dir, n)).find((p) => fs.existsSync(p))!, chosen = path.join(dir, "צבועות", "נבחרות");
  const picture = (id: string) => { const p = path.join(chosen, `${id}.jpg`); return fs.existsSync(p) ? { file: p, painted: true } : { file: path.join(renders, `${id}.jpg`), painted: false }; };
  const named = (st: "ground" | "first"): Room[] => (report[`${st}Rooms`] as Array<Room>).map((r, i) => ({ ...r, name: r.name || report[`${st}Equipment`][i]?.name || "חלל" }));
  return { n, dir, renders, report, tally: report.tally as Tally, model, cams, picture, rooms: { ground: named("ground"), first: named("first") } };
}
const opts = [await load(1), await load(2)] as const;

// ---- plans: the site from above (the ground's own photo, everything built drawn over it) and each storey ----------------
const VIOLET = "#6d28d9", INK = "#1e1b4b";
function frameOf(o: Opt, pad: number) {
  const pts: P2[] = [...o.rooms.ground, ...o.rooms.first].flatMap((r) => r.ring);
  for (const p of o.model.primitives) if (p.type === "prism" && /^sheet:truck/.test(p.tag ?? "")) pts.push(...p.ring!);
  for (const p of o.model.primitives) if (p.type === "box" && /^survey:(wall|gate)$|^site:proposal:drive-kerb/.test(p.tag ?? "")) pts.push([p.centre!.x, p.centre!.z]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - pad, z0: Math.min(...zs) - pad, x1: Math.max(...xs) + pad, z1: Math.max(...zs) + pad };
}
// one frame for both proposals' site plans, so they compare at one scale and place
const SITE = (() => { const a = frameOf(opts[0], 10), b = frameOf(opts[1], 10); return { x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) }; })();
const boxPoly = (p: Prim): P2[] => {
  const c = p.centre!, s = p.size!, r = p.rotY ?? 0, cs = Math.cos(r), sn = Math.sin(r);
  // the renderer turns a box by rotY about y: local x → (cos, −sin) in plan (x, z)
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as P2[]).map(([u, v]) => [c.x + (u * s.x) / 2 * cs + (v * s.z) / 2 * sn, c.z - (u * s.x) / 2 * sn + (v * s.z) / 2 * cs]);
};
const carPoly = (p: Prim): P2[] => boxPoly({ ...p, centre: p.at, size: { x: 1.85, y: 1, z: 4.6 } });
function cone(cam: Cam, X: (x: number) => number, Z: (z: number) => number, pxPerM: number, n: number, lenM: number, strong: boolean, box?: { x0: number; y0: number; x1: number; y1: number }) {
  const t = { x: X(cam.target.x), y: Z(cam.target.z) }, e = { x: X(cam.position.x), y: Z(cam.position.z) };
  if (box) { let k = 1; for (const [v, lo, hi, tv] of [[e.x, box.x0, box.x1, t.x], [e.y, box.y0, box.y1, t.y]] as const) { if (v < lo) k = Math.min(k, (lo - tv) / (v - tv)); if (v > hi) k = Math.min(k, (hi - tv) / (v - tv)); } e.x = t.x + (e.x - t.x) * k; e.y = t.y + (e.y - t.y) * k; }
  const dir = Math.atan2(t.y - e.y, t.x - e.x), half = Math.atan(Math.tan((cam.fovDeg * Math.PI) / 360) * 1.6), r = lenM * pxPerM;
  const at = (a: number) => `${(e.x + Math.cos(a) * r).toFixed(1)},${(e.y + Math.sin(a) * r).toFixed(1)}`;
  const dot = strong ? 26 : 20;
  return `<path d="M${e.x.toFixed(1)},${e.y.toFixed(1)} L${at(dir - half)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${at(dir + half)} Z" fill="${VIOLET}" fill-opacity="${strong ? 0.3 : 0.18}" stroke="${VIOLET}" stroke-width="${strong ? 4 : 2.5}"/>
<circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="${dot}" fill="${VIOLET}" stroke="#fff" stroke-width="4"/><text x="${e.x.toFixed(1)}" y="${(e.y + dot * 0.37).toFixed(1)}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="${dot}" fill="#fff">${n}</text>`;
}
const poly = (r: P2[], X: (x: number) => number, Z: (z: number) => number, attrs: string) => `<polygon points="${r.map((p) => `${X(p[0]).toFixed(1)},${Z(p[1]).toFixed(1)}`).join(" ")}" ${attrs}/>`;
const legendRow = (x: number, y: number, swatch: string, label: string) => `<g transform="translate(${x},${y})">${swatch}<text x="64" y="21" font-family="Arial" font-size="20" fill="#3f3a36">${label}</text></g>`;
const SWATCH = {
  building: `<rect width="50" height="28" fill="#f6f3ec" stroke="#24211f" stroke-width="3"/>`,
  route: `<rect width="50" height="28" fill="url(#route)" stroke="#3a3c40" stroke-width="2"/>`,
  wall: `<rect y="10" width="50" height="8" fill="#9b8b6e" stroke="#5c5141"/>`,
  gate: `<line x1="0" y1="14" x2="50" y2="14" stroke="#24211f" stroke-width="4" stroke-dasharray="3 3"/>`,
  fence: `<line x1="0" y1="14" x2="50" y2="14" stroke="#3f7a3a" stroke-width="3" stroke-dasharray="8 4"/>`,
  tree: `<circle cx="14" cy="14" r="12" fill="#5d8f3c" stroke="#2f5a1d"/><circle cx="40" cy="14" r="6" fill="#7aa64f" stroke="#2f5a1d"/>`,
  car: `<rect x="4" y="6" width="40" height="16" rx="4" fill="#cfd5db" stroke="#24211f"/>`,
  truck: `<rect x="2" y="5" width="34" height="18" fill="#eef1f4" stroke="#24211f"/><rect x="37" y="7" width="12" height="14" fill="#3a3f46"/>`,
  existing: `<rect width="50" height="28" fill="url(#exist)" stroke="#6b625b"/>`,
  cam: `<path d="M8,14 L48,2 L48,26 Z" fill="${VIOLET}" fill-opacity="0.3" stroke="${VIOLET}" stroke-width="2"/><circle cx="8" cy="14" r="8" fill="${VIOLET}"/>`,
  pole: `<circle cx="14" cy="14" r="6" fill="#24211f"/>`,
};
const DEFS = `<defs><pattern id="route" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#7d8186"/><line x1="0" y1="0" x2="0" y2="12" stroke="#a5a9ae" stroke-width="3"/></pattern><pattern id="exist" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="10" height="10" fill="#e7e2d8"/><line x1="0" y1="0" x2="0" y2="10" stroke="#a89f92" stroke-width="2"/></pattern></defs>`;

async function sitePlan(o: Opt, only?: string): Promise<BookletImage> {
  const PX = 13, LEG = only ? 0 : 430;
  const W = Math.round((SITE.x1 - SITE.x0) * PX) + LEG, H = Math.round((SITE.z1 - SITE.z0) * PX);
  const X = (x: number) => (x - SITE.x0) * PX + LEG, Z = (z: number) => (z - SITE.z0) * PX;
  const terr = o.model.primitives.find((p) => p.type === "terrain" && p.photo)!.photo!;
  const u0 = Math.round((SITE.x0 - terr.cx) / terr.s + terr.cu), v0 = Math.round((SITE.z0 - terr.cz) / terr.s + terr.cv);
  const uw = Math.round((SITE.x1 - SITE.x0) / terr.s), vh = Math.round((SITE.z1 - SITE.z0) / terr.s);
  const photo = await sharp(Buffer.from(terr.src.split(",")[1]!, "base64")).extract({ left: Math.max(0, u0), top: Math.max(0, v0), width: Math.min(uw, terr.pw - Math.max(0, u0)), height: Math.min(vh, terr.ph - Math.max(0, v0)) }).resize(W - LEG, H, { fit: "fill" }).modulate({ saturation: 0.75, brightness: 1.06 }).jpeg({ quality: only ? 70 : 85 }).toBuffer();
  const parts: string[] = [`<image href="data:image/jpeg;base64,${photo.toString("base64")}" x="${LEG}" y="0" width="${W - LEG}" height="${H}"/>`];
  const P = o.model.primitives;
  for (const p of P) if (p.type === "prism" && p.tag === "survey:building") parts.push(poly(p.ring!, X, Z, `fill="url(#exist)" stroke="#6b625b" stroke-width="2"`));
  for (const p of P) if (p.type === "prism" && /^sheet:truck-(ramp-up|ramp-down|deck):top$/.test(p.tag ?? "")) parts.push(poly(p.ring!, X, Z, `fill="url(#route)" stroke="none"`));
  const slab = P.find((p) => p.type === "prism" && p.tag === "ground:slab");
  if (slab) parts.push(poly(slab.ring!, X, Z, `fill="#f6f3ec" stroke="#24211f" stroke-width="4"`));
  for (const p of P) if (p.type === "box" && p.tag === "survey:wall") parts.push(poly(boxPoly({ ...p, size: { ...p.size!, z: 0.6 } }), X, Z, `fill="#9b8b6e" stroke="#5c5141" stroke-width="1"`));
  for (const p of P) if (p.type === "box" && p.tag === "survey:fence-mesh") { const r = boxPoly(p); parts.push(`<line x1="${X((r[0]![0] + r[3]![0]) / 2)}" y1="${Z((r[0]![1] + r[3]![1]) / 2)}" x2="${X((r[1]![0] + r[2]![0]) / 2)}" y2="${Z((r[1]![1] + r[2]![1]) / 2)}" stroke="#3f7a3a" stroke-width="3" stroke-dasharray="8 4"/>`); }
  for (const p of P) if (p.type === "box" && p.tag === "survey:gate" && p.size!.x > 2) { const r = boxPoly(p); parts.push(`<line x1="${X((r[0]![0] + r[3]![0]) / 2)}" y1="${Z((r[0]![1] + r[3]![1]) / 2)}" x2="${X((r[1]![0] + r[2]![0]) / 2)}" y2="${Z((r[1]![1] + r[2]![1]) / 2)}" stroke="#24211f" stroke-width="5" stroke-dasharray="3 3"/>`); }
  for (const p of P) if (p.type === "box" && /^site:proposal:truck/.test(p.tag ?? "") && p.centre!.y < 9 && p.size!.x * p.size!.z > 4) parts.push(poly(boxPoly(p), X, Z, `fill="#eef1f4" stroke="#24211f" stroke-width="1.5"`));
  for (const p of P) if (p.type === "car") parts.push(poly(carPoly(p), X, Z, `fill="#cfd5db" stroke="#24211f" stroke-width="1.5"`));
  for (const p of P) if (p.type === "tree") parts.push(`<circle cx="${X(p.at!.x).toFixed(1)}" cy="${Z(p.at!.z).toFixed(1)}" r="${(p.crown! * PX).toFixed(1)}" fill="${p.tag === "site:proposal:shrub" ? "#7aa64f" : "#5d8f3c"}" fill-opacity="0.85" stroke="#2f5a1d"/>`);
  for (const p of P) if (p.type === "cylinder" && p.tag === "survey:pole") parts.push(`<circle cx="${X(p.centre!.x).toFixed(1)}" cy="${Z(p.centre!.z).toFixed(1)}" r="6" fill="#24211f"/>`);
  const outs = [...o.cams.keys()].filter((id) => /^out-/.test(id) && (!only || id === only));
  const shots = shotsOf(o);
  for (const id of outs) { const k = shots.findIndex((s) => s.id === id); if (k >= 0 || only) parts.push(cone(o.cams.get(id)!, X, Z, PX, k + 1, only ? 22 : 14, !!only, { x0: LEG + 40, y0: 40, x1: W - 40, y1: H - 40 })); }
  // north (the survey's grid: up) and a scale bar
  const nx = W - 70, ny = 80;
  parts.push(`<g font-family="Arial" font-weight="700"><path d="M${nx},${ny - 44} L${nx + 18},${ny + 10} L${nx},${ny} L${nx - 18},${ny + 10} Z" fill="${INK}"/><text x="${nx}" y="${ny + 40}" text-anchor="middle" font-size="26" fill="${INK}">N</text></g>`);
  const bx = LEG + 30, by = H - 40;
  parts.push(`<g font-family="Arial" font-size="20" fill="#24211f">${[0, 1, 2, 3, 4].map((k) => `<rect x="${bx + k * 5 * PX}" y="${by}" width="${5 * PX}" height="12" fill="${k % 2 ? "#fff" : "#24211f"}" stroke="#24211f"/>`).join("")}<text x="${bx}" y="${by - 8}" text-anchor="middle">0</text><text x="${bx + 25 * PX}" y="${by - 8}" text-anchor="middle">25</text></g>`);
  if (!only) {
    const rows: Array<[string, string]> = [["building", "המבנה החדש"], ["route", "מסלול משאיות מוגבה ורמפות"], ["truck", "משאית"], ["car", "רכב עובדים"], ["wall", "חומת אבן קיימת"], ["gate", "שער"], ["fence", "גדר"], ["tree", "עץ / שיח"], ["existing", "מבנה קיים שנשאר"], ["pole", "עמוד חשמל"], ["cam", "מקום צילום וכיוון"]];
    parts.push(`<rect x="0" y="0" width="${LEG - 20}" height="${H}" fill="#fff"/><text x="30" y="56" font-family="Arial" font-size="30" font-weight="700" fill="${INK}">מקרא</text>`);
    rows.forEach(([k, label], i) => parts.push(legendRow(30, 90 + i * 46, SWATCH[k as keyof typeof SWATCH], label)));
    const y = 90 + rows.length * 46 + 30;
    parts.push(`<g font-family="Arial" font-size="19" fill="#3f3a36"><text x="30" y="${y}" font-weight="700">בצבע הקרקע</text>${[["#5f6267", "אספלט: כביש, חצר, כניסה"], ["#ccc7bc", "ריצוף ומדרכה"], ["#687c48", "רצועת שתילה / שצ\"פ"], ["#b2a080", "קרקע טבעית"]].map(([c, t], i) => `<rect x="30" y="${y + 16 + i * 38}" width="50" height="26" fill="${c}"/><text x="94" y="${y + 36 + i * 38}">${t}</text>`).join("")}</g>`);
  }
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="#fff"/>${parts.join("\n")}</svg>`, W, H);
}

// a storey's spaces, one number per kind of space (its rooms all carry it), with the interior pictures taken on it
const keyOf = (o: Opt, st: "ground" | "first") => { const names = [...new Set(o.rooms[st].map((r) => r.name))]; return names.map((name, i) => ({ n: i + 1, name, rooms: o.rooms[st].filter((r) => r.name === name) })); };
// A storey's frame: its rooms ± 4 m — the same frame views.mts renders its top view ("top-<storey>") in.
const storeyFrame = (o: Opt, st: "ground" | "first") => {
  const all = o.rooms[st].flatMap((r) => r.ring);
  return { x0: Math.min(...all.map((p) => p[0])) - 4, x1: Math.max(...all.map((p) => p[0])) + 4, z0: Math.min(...all.map((p) => p[1])) - 4, z1: Math.max(...all.map((p) => p[1])) + 4 };
};
const TINT: Record<string, string> = { ייצור: "#fde7d6", קצביה: "#fbd9d3", הפשרה: "#dceefb", קירור: "#d8ecf7", הקפאה: "#cfe3f5", פריסה: "#fdf0cf", אריזה: "#f4f0c9", מהתנור: "#f9dfc3", מחסן: "#e8e2f3", הנהלה: "#e2f0dc", משרד: "#e2f0dc", קפה: "#e6f3e1", הלבשה: "#ece9f6", מבואה: "#f1efe9" };
const tint = (name: string) => Object.entries(TINT).find(([k]) => name.includes(k))?.[1] ?? "#f8f6f1";
const topCache = new Map<string, string>();
const topImage = (o: Opt, st: "ground" | "first", quality: number) => {
  const k = `${o.n}:${st}:${quality}`;
  if (!topCache.has(k)) { const f = path.join(o.renders, `top-${st}.jpg`); if (!fs.existsSync(f)) throw new Error(`no top view: ${f} (render it with views.mts)`); topCache.set(k, fs.readFileSync(f).toString("base64")); }
  return topCache.get(k)!;
};
// The storey as the dollhouse shows it, straight from above (the free render "top-<storey>": walls charcoal, the equipment in its
// colours), each room tinted by its kind and numbered, with the interior cameras — not flat squares (the user, 2026-11-10).
function storeyPlan(o: Opt, st: "ground" | "first", only?: string): BookletImage {
  const { x0, x1, z0, z1 } = storeyFrame(o, st);
  // the top view is the dollhouse in 3D (views.mts: a parallel camera from the south, TOP_TILT_DEG down, 3 m of room over the north
  // edge for the walls): a floor point (x, z) sits at ((x − x0), (z − z0)·sin + 3·cos) in metres from the picture's top left
  const TILT = (55 * Math.PI) / 180, sA = Math.sin(TILT), cA = Math.cos(TILT);
  const PX = 22, W = Math.round((x1 - x0) * PX), H = Math.round(((z1 - z0) * sA + 3 * cA) * PX);
  const X = (x: number) => (x - x0) * PX, Z = (z: number) => ((z - z0) * sA + 3 * cA) * PX;
  const parts: string[] = [`<image href="data:image/jpeg;base64,${topImage(o, st, 0)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`];
  const key = keyOf(o, st);
  for (const k of key) for (const r of k.rooms) parts.push(poly(r.ring, X, Z, `fill="${tint(k.name)}" fill-opacity="0.45" style="mix-blend-mode:multiply" stroke="none"`));
  for (const k of key) for (const r of k.rooms) { const [cx, cz] = centroid(r.ring); parts.push(`<circle cx="${X(cx).toFixed(1)}" cy="${Z(cz).toFixed(1)}" r="17" fill="${INK}" stroke="#fff" stroke-width="3"/><text x="${X(cx).toFixed(1)}" y="${(Z(cz) + 6.5).toFixed(1)}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="18" fill="#fff">${k.n}</text>`); }
  const shots = shotsOf(o);
  const ins = [...o.cams.keys()].filter((id) => id.startsWith(`in-${st}-`) && (!only || id === only));
  for (const id of ins) { const k = shots.findIndex((s) => s.id === id); if (k >= 0 || only) parts.push(cone(o.cams.get(id)!, X, Z, PX, k + 1, only ? 9 : 6, !!only)); }
  const nx = W - 50;
  parts.push(`<g font-family="Arial" font-weight="700"><path d="M${nx},26 L${nx + 15},70 L${nx},62 L${nx - 15},70 Z" fill="${INK}"/><text x="${nx}" y="96" text-anchor="middle" font-size="22" fill="${INK}">N</text></g>`);
  parts.push(`<g font-family="Arial" font-size="18" font-weight="700" fill="#24211f"><rect x="16" y="${H - 66}" width="${10 * PX + 30}" height="54" rx="6" fill="#fff" fill-opacity="0.85"/>${[0, 1].map((k) => `<rect x="${30 + k * 5 * PX}" y="${H - 34}" width="${5 * PX}" height="10" fill="${k % 2 ? "#fff" : "#24211f"}" stroke="#24211f"/>`).join("")}<text x="30" y="${H - 42}" text-anchor="middle">0</text><text x="${30 + 10 * PX}" y="${H - 42}" text-anchor="middle">10</text></g>`);
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join("\n")}</svg>`, W, H);
}

// ---- the architectural drawing of a storey, furnished with what was put in its rooms ----------------------------------------
// Walls solid charcoal, rooms in pale tints by kind, every piece of equipment drawn to its size in plan (tables, racks, ovens,
// cutters, slicers, belts, lockers, desks and chairs, pallets), doors and truck doors, windows, overall dimensions, numbers and
// areas (the user, 2026-11-10: "an architectural drawing fitted to what you put in the rooms, visual and beautiful").
const EQUIP: Array<[RegExp, string, string]> = [
  [/:(table-top|counter-top)$/, "#eef1f4", "#6b7684"], [/:(shelf)$/, "#f4f6f8", "#7d8794"], [/:(desk)$/, "#e3c79a", "#8a6a3c"],
  [/:(chair-seat)$/, "#5b6b7a", "#2f3a45"], [/:(dining-top|bench-seat)$/, "#d7a96a", "#8a6a3c"], [/:(locker)$/, "#ece8df", "#8b8579"],
  [/:(cooler|fridge|sink)$/, "#d9e1e7", "#6b7684"], [/:(cutter-body|slicer-base|trolley-frame)$/, "#c3cbd3", "#56606b"],
  [/:(conveyor-side|belt)$/, "#3a3f46", "#1f2328"], [/:(pallet)$/, "#d6b98a", "#8a6a3c"], [/:(upright)$/, "#2f5fa8", "#1d3d6e"], [/:(beam)$/, "#e58a2e", "#a65a12"],
];
function archPlan(o: Opt, st: "ground" | "first"): BookletImage {
  const { x0, x1, z0, z1 } = storeyFrame(o, st);
  const PX = 26, W = Math.round((x1 - x0) * PX), H = Math.round((z1 - z0) * PX);
  const X = (x: number) => (x - x0) * PX, Z = (z: number) => (z - z0) * PX;
  const P = o.model.primitives, parts: string[] = [];
  const pre = `${st}:`;
  const floor = P.find((p) => p.type === "prism" && p.tag === `${st}:floor`) ?? P.find((p) => p.type === "prism" && p.tag === `${st}:slab`);
  if (floor) parts.push(poly(floor.ring!, X, Z, `fill="#fbfaf7" stroke="none"`));
  const terrace = st === "first" ? P.find((p) => p.type === "prism" && /terrace/.test(p.tag ?? "") && p.ring) : undefined;
  const key = keyOf(o, st);
  for (const k of key) for (const r of k.rooms) parts.push(poly(r.ring, X, Z, `fill="${tint(k.name)}" stroke="none"`));
  // stairs and lifts: their outline and treads
  for (const p of P) if (p.type === "prism" && (/^(stair|stair-landing)(:[0-9]+)?$/.test((p.tag ?? "").slice(st.length + 1)) && (p.tag ?? "").startsWith(`${st}:`) || p.tag === `${st}:elevator`)) parts.push(poly(p.ring!, X, Z, `fill="#fff" stroke="#6b625b" stroke-width="1.2"`));
  // each U stair's walking line: up the first flight, across the landing, up the second, an arrowhead at the top
  const cenOf = (r: Array<[number, number]>): [number, number] => [r.reduce((a, v) => a + v[0], 0) / r.length, r.reduce((a, v) => a + v[1], 0) / r.length];
  for (const L of P.filter((p) => p.type === "prism" && (p.tag ?? "").startsWith(`${st}:stair-landing`))) {
    const lc = cenOf(L.ring as Array<[number, number]>);
    const tr = P.filter((p) => p.type === "prism" && p.tag === L.tag!.replace(":stair-landing", ":stair")).sort((a, b) => (a.y1 ?? 0) - (b.y1 ?? 0));
    if (tr.length < 4) continue;
    const low = tr.filter((p) => (p.y1 ?? 0) < (L.y1 ?? 0)), high = tr.filter((p) => (p.y1 ?? 0) > (L.y1 ?? 0));
    if (!low.length || !high.length) continue;
    const c = (p: typeof L) => cenOf(p.ring as Array<[number, number]>);
    const a0 = c(low[0]!), a1 = c(low[low.length - 1]!), b0 = c(high[0]!), b1 = c(high[high.length - 1]!);
    const m1: [number, number] = [a1[0] + (lc[0] - a1[0]) * 0.6, a1[1] + (lc[1] - a1[1]) * 0.6], m2: [number, number] = [b0[0] + (lc[0] - b0[0]) * 0.6, b0[1] + (lc[1] - b0[1]) * 0.6];
    const pts = [a0, a1, m1, m2, b0, b1];
    parts.push(`<polyline points="${pts.map((q) => `${X(q[0]).toFixed(1)},${Z(q[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="#25242a" stroke-width="1.6"/>`);
    parts.push(`<circle cx="${X(a0[0]).toFixed(1)}" cy="${Z(a0[1]).toFixed(1)}" r="4" fill="#25242a"/>`);
    const d = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) || 1, u = [(b1[0] - b0[0]) / d, (b1[1] - b0[1]) / d], n = [-u[1]!, u[0]!], h = 0.45;
    const tip = [X(b1[0]), Z(b1[1])], bl = [X(b1[0] - u[0]! * h + n[0]! * h * 0.5), Z(b1[1] - u[1]! * h + n[1]! * h * 0.5)], br = [X(b1[0] - u[0]! * h - n[0]! * h * 0.5), Z(b1[1] - u[1]! * h - n[1]! * h * 0.5)];
    parts.push(`<path d="M${tip.join(",")} L${bl.join(",")} L${br.join(",")} Z" fill="#25242a"/>`);
  }
  // equipment, once per footprint (a rack's shelves stand one over the other)
  const seen = new Set<string>();
  for (const p of P) {
    if (p.type !== "box" || !(p.tag ?? "").startsWith(`${pre}proposal:equip:`)) continue;
    const kind = EQUIP.find(([re]) => re.test(p.tag!)); if (!kind) continue;
    const k = `${p.tag}|${p.centre!.x.toFixed(2)}|${p.centre!.z.toFixed(2)}`; if (seen.has(k)) continue; seen.add(k);
    parts.push(poly(boxPoly(p), X, Z, `fill="${kind[1]}" stroke="${kind[2]}" stroke-width="1"`));
  }
  if (st === "ground") for (const p of P) if (p.type === "prism" && p.tag === "ground:oven") parts.push(poly(p.ring!, X, Z, `fill="#4a4f57" stroke="#1f2328" stroke-width="1.2"`));
  // a door's swing: the leaf stands open; the quarter arc from its tip to where it shuts (in the opening under its lintel)
  const lintels = P.filter((p) => p.type === "box" && new RegExp(`^${st}:room:lintel$`).test(p.tag ?? ""));
  const swing = (d: (typeof P)[number]) => {
    const c = [d.centre!.x, d.centre!.z], r = d.rotY ?? 0, u = [Math.cos(r), -Math.sin(r)], w = d.size!.x;
    const L = lintels.map((l) => ({ l, k: Math.hypot(l.centre!.x - c[0]!, l.centre!.z - c[1]!) })).sort((a, b) => a.k - b.k)[0];
    if (!L || L.k > w * 1.5) return "";
    const lc = [L.l.centre!.x, L.l.centre!.z];
    const e = [[c[0]! - u[0]! * w / 2, c[1]! - u[1]! * w / 2], [c[0]! + u[0]! * w / 2, c[1]! + u[1]! * w / 2]].sort((a, b) => Math.hypot(a[0]! - lc[0]!, a[1]! - lc[1]!) - Math.hypot(b[0]! - lc[0]!, b[1]! - lc[1]!));
    const hg = e[0]!, tip = e[1]!, k = Math.hypot(lc[0]! - hg[0]!, lc[1]! - hg[1]!) || 1, shut = [hg[0]! + ((lc[0]! - hg[0]!) / k) * w, hg[1]! + ((lc[1]! - hg[1]!) / k) * w];
    const cross = (tip[0]! - hg[0]!) * (shut[1]! - hg[1]!) - (tip[1]! - hg[1]!) * (shut[0]! - hg[0]!);
    return `<path d="M${X(tip[0]!).toFixed(1)},${Z(tip[1]!).toFixed(1)} A${(w * PX).toFixed(1)},${(w * PX).toFixed(1)} 0 0 ${cross > 0 ? 1 : 0} ${X(shut[0]!).toFixed(1)},${Z(shut[1]!).toFixed(1)}" fill="none" stroke="#25242a" stroke-width="1" stroke-dasharray="4 3"/>`;
  };
  // walls (cut): charcoal; doors: the leaf; truck doors dashed; windows: a pale blue pane
  for (const p of P) {
    if (p.type !== "box" || !(p.tag ?? "").startsWith(pre)) continue;
    const t = p.tag!;
    if (/:(shell|room|corridor-wall)(:base)?$/.test(t) || /:(terrace-parapet)$/.test(t)) parts.push(poly(boxPoly(p), X, Z, `fill="#25242a" stroke="#25242a" stroke-width="0.6"`));
    else if (/:door$/.test(t)) { parts.push(poly(boxPoly(p), X, Z, `fill="#fff" stroke="#25242a" stroke-width="1.6"`)); if (/:room:door$/.test(t)) parts.push(swing(p)); }
    else if (/truck-door$/.test(t) && p.size!.y > 1) parts.push(poly(boxPoly({ ...p, size: { ...p.size!, z: 0.5 } }), X, Z, `fill="none" stroke="#c2410c" stroke-width="2.5" stroke-dasharray="7 4"`));
    else if (/:proposal:window$/.test(t)) parts.push(poly(boxPoly({ ...p, size: { ...p.size!, z: Math.max(0.12, p.size!.z) } }), X, Z, `fill="#bfe0f2" stroke="#2b6c8f" stroke-width="1.2"`));
  }
  if (terrace) parts.push(poly(terrace.ring!, X, Z, `fill="none" stroke="#25242a" stroke-width="1.5" stroke-dasharray="10 6"`));
  // overall dimensions: each outer wall of the shell, 2.4 m out, with its length
  const shell = P.find((p) => p.type === "prism" && p.tag === `${st}:slab`)?.ring ?? floor?.ring ?? [];
  const sgn = Math.sign(shell.reduce((a, p, i) => { const q = shell[(i + 1) % shell.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) || 1;
  shell.forEach((a, i) => {
    const b = shell[(i + 1) % shell.length]!, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 4) return;
    const u: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [u[1] * sgn, -u[0] * sgn], off = 2.4;
    const A: P2 = [a[0] + n[0] * off, a[1] + n[1] * off], B: P2 = [b[0] + n[0] * off, b[1] + n[1] * off];
    const tick = (q: P2) => `<line x1="${X(q[0] - (u[0] + n[0]) * 0.35)}" y1="${Z(q[1] - (u[1] + n[1]) * 0.35)}" x2="${X(q[0] + (u[0] + n[0]) * 0.35)}" y2="${Z(q[1] + (u[1] + n[1]) * 0.35)}" stroke="#25242a" stroke-width="2"/>`;
    const m: P2 = [(A[0] + B[0]) / 2 + n[0] * 0.7, (A[1] + B[1]) / 2 + n[1] * 0.7];
    let ang = (Math.atan2(Z(B[1]) - Z(A[1]), X(B[0]) - X(A[0])) * 180) / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    parts.push(`<line x1="${X(A[0])}" y1="${Z(A[1])}" x2="${X(B[0])}" y2="${Z(B[1])}" stroke="#25242a" stroke-width="1.2"/>${tick(A)}${tick(B)}<line x1="${X(a[0] + n[0] * 0.6)}" y1="${Z(a[1] + n[1] * 0.6)}" x2="${X(A[0] + n[0] * 0.4)}" y2="${Z(A[1] + n[1] * 0.4)}" stroke="#8b8579" stroke-width="0.8"/><line x1="${X(b[0] + n[0] * 0.6)}" y1="${Z(b[1] + n[1] * 0.6)}" x2="${X(B[0] + n[0] * 0.4)}" y2="${Z(B[1] + n[1] * 0.4)}" stroke="#8b8579" stroke-width="0.8"/><text transform="translate(${X(m[0]).toFixed(1)},${Z(m[1]).toFixed(1)}) rotate(${ang.toFixed(1)})" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="17" fill="#25242a">${L.toFixed(2)}</text>`);
  });
  // numbers and areas
  for (const k of key) for (const r of k.rooms) {
    const [cx, cz] = centroid(r.ring);
    parts.push(`<circle cx="${X(cx).toFixed(1)}" cy="${Z(cz).toFixed(1)}" r="15" fill="${INK}"/><text x="${X(cx).toFixed(1)}" y="${(Z(cz) + 6).toFixed(1)}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="16" fill="#fff">${k.n}</text><text x="${X(cx).toFixed(1)}" y="${(Z(cz) + 34).toFixed(1)}" text-anchor="middle" font-family="Arial" font-size="14" fill="#3f3a36">${r.areaM2.toFixed(1)}</text>`);
  }
  const nx = W - 50;
  parts.push(`<g font-family="Arial" font-weight="700"><path d="M${nx},26 L${nx + 15},70 L${nx},62 L${nx - 15},70 Z" fill="${INK}"/><text x="${nx}" y="96" text-anchor="middle" font-size="22" fill="${INK}">N</text></g>`);
  parts.push(`<g font-family="Arial" font-size="18" fill="#24211f">${[0, 1].map((k) => `<rect x="${30 + k * 5 * PX}" y="${H - 34}" width="${5 * PX}" height="10" fill="${k % 2 ? "#fff" : "#24211f"}" stroke="#24211f"/>`).join("")}<text x="30" y="${H - 42}" text-anchor="middle">0</text><text x="${30 + 10 * PX}" y="${H - 42}" text-anchor="middle">10</text></g>`);
  return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${parts.join("\n")}</svg>`, W, H);
}

// ---- the pictures: what each shows ------------------------------------------------------------------------------------
type Shot = { title: string; caption: string };
const TEXT: Record<string, (o: Opt) => Shot> = {
  "out-aerial-nw": (o) => ({ title: "מבט אוויר מצפון־מערב", caption: o.n === 1 ? "חזית הכניסה: השער הראשי ודרך הכניסה החדשה מהכביש, חניות העובדים בתוך החומה, ומשמאל הרמפה היורדת ממסלול המשאיות אל הכביש הצפוני." : "חזית הכניסה: השער הראשי ודרך הכניסה מהכביש, חצר המשאיות מול שתי דלתות המשאיות המצוירות בתשריט, ומשמאל חניות העובדים." }),
  "out-aerial-se": (o) => ({ title: "מבט אוויר מדרום־מזרח", caption: o.n === 1 ? "הצד האחורי: מסלול המשאיות המוגבה לאורך המרפסת של קומה א׳, והמשאיות בפריקה מול דלתות המרפסת." : "הצד האחורי של המבנה, רצועת השתילה לאורך גבול המגרש והמבנה הקיים שנשאר." }),
  "out-eye-nw": (o) => ({ title: "מגובה העיניים, מצפון־מערב", caption: o.n === 1 ? "מהכביש אל השער: החומה הקיימת, השער ההזזה והכניסה." : "מהכביש אל השער: המשאיות בחצר, השער ההזזה ודרך הכניסה." }),
  "out-hero": () => ({ title: "מבט ראשי", caption: "המבנה בהיקפו, מעל הכביש." }),
  "doll-ground-nw": (o) => ({ title: "בית בובות — קומת קרקע", caption: `קומת הייצור חתוכה בגובה 2.9 מ׳: קו התנורים במרכז, צד חומר הגלם (ייצור, הפשרה, קצביה) מצד אחד וצד המוצר המוגמר (פריסה, אריזה) מהצד השני${o.n === 2 ? ", והחצר עם המשאיות מול דלתות המשאיות" : ""}.` }),
  "doll-first-se": () => ({ title: "בית בובות — קומה א׳", caption: "קומת האחסון וההנהלה חתוכה: חדרי קירור והקפאה, מחסן מזון יבש ומשרדי הנהלה, והמרפסת עם המשאיות." }),
  "in-ground-oven-exit": () => ({ title: "יציאה מהתנור", caption: "עגלות הנקניקים יוצאות מהתנורים העוברים אל צד המוצר המוגמר." }),
  "in-ground-production": () => ({ title: "אולם ייצור", caption: "קוטר (Bowl cutter) על הרצפה, שולחנות נירוסטה וארגזים, עובדים בלבוש היגייני." }),
  "in-ground-packing": () => ({ title: "אולם אריזה", caption: "מסוע אריזה, שולחנות נירוסטה וארגזי מוצר מוגמר." }),
  "in-ground-butchery": () => ({ title: "קצביה", caption: "שולחנות עבודה מנירוסטה וארגזים, בצד חומר הגלם." }),
  "in-first-offices": () => ({ title: "משרדי הנהלה", caption: "עמדות עבודה בקומה א׳." }),
};
function shotsOf(o: Opt) {
  const dir = path.join(o.dir, "נבחרות לצביעה");
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, ""));
  const rank = (id: string) => (id.startsWith("out-") ? 0 : id.startsWith("doll-") ? 1 : 2);
  return ids.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((id) => ({ id, ...(TEXT[id]?.(o) ?? { title: id, caption: "" }) }));
}
const stamped = async (file: string) => img(await withLogo(fs.readFileSync(file), { corner: "right", colour: true }));

// ---- the numbers each proposal is compared by ---------------------------------------------------------------------------
function facts(o: Opt) {
  const t = o.tally, r = o.report;
  const g = Number(r.shell.groundAreaM2), f = Number(r.shell.firstAreaM2);
  const kits = (st: "ground" | "first") => (r[`${st}Equipment`] as Array<{ name: string }>);
  const count = (re: RegExp) => [...o.rooms.ground, ...o.rooms.first].filter((x) => re.test(x.name)).reduce((s, x) => s + x.areaM2, 0);
  return {
    g, f, total: g + f,
    ovens: r.ovenRow?.ovens ?? 0,
    cars: t["proposal: car"]?.built ?? 0,
    apron: num(t["proposal: building apron"]?.why[0], /: (\d+) m²/),
    planting: num(t["proposal: planting strip"]?.why[0], /: (\d+) m²/),
    yard: num(t["sheet: truck yard (AR-SAND hatch)"]?.why[0], /: (\d+) m²/),
    route: r.truckRoute as undefined | { landingM?: number; rampUp: { fromM: number; toM: number; lengthM: number }; deckM2: number; rampDown: { fromM: number; toM: number; lengthM: number } },
    production: count(/ייצור|קצביה|הפשרה/), finished: count(/פריסה|אריזה|מהתנור/), cold: count(/קירור|הקפאה/), store: count(/מחסן/), office: count(/משרד|הנהלה/), staff: count(/הלבשה|קפה|מבואה/),
    groundRooms: kits("ground").length, firstRooms: kits("first").length,
    demolished: (t["survey: building / shed (M2200)"]?.dropped ?? 0),
  };
}
const F = opts.map(facts) as [ReturnType<typeof facts>, ReturnType<typeof facts>];
const truckWay = (k: 0 | 1) => F[k].route ? `רמפה עולה ${f0(F[k].route!.rampUp.lengthM)} מ׳ אל קומה א׳ (+${F[k].route!.rampUp.toM.toFixed(2)}), מסלול מוגבה ${f0(F[k].route!.deckM2)} מ״ר על עמודים, ירידה ${f0(F[k].route!.rampDown.lengthM)} מ׳ לכביש הצפוני` : `חצר משאיות בקומת הקרקע, ${f0(F[k].yard)} מ״ר, מול השער`;
const truckDoors = (k: 0 | 1) => (k === 0 ? "2 דלתות משאית במרפסת קומה א׳ (הצעה שלנו — אינן מצוירות בתשריט)" : "2 דלתות משאית בקרקע, מצוירות בתשריט: כניסת חומרי גלם ויציאת תצ״ג");
const COMPARE = {
  title: "השוואה בין ההצעות",
  head: ["נושא", "הצעה 1", "הצעה 2"],
  rows: [
    ["שטח קומת קרקע (מ״ר)", f1(F[0].g), f1(F[1].g)],
    ["שטח קומה א׳ (מ״ר)", f1(F[0].f), f1(F[1].f)],
    ["סה״כ בנוי (מ״ר)", f1(F[0].total), f1(F[1].total)],
    ["גישת משאיות", "רמפה לקומה א׳ ומסלול מוגבה", `חצר בקרקע, ${f0(F[1].yard)} מ״ר`],
    ["דלתות משאית", "2 במרפסת קומה א׳ (הצעה)", "2 בקרקע (מהתשריט)"],
    ["ייצור וחומר גלם — ייצור, הפשרה, קצביה (מ״ר)", f0(F[0].production), f0(F[1].production)],
    ["מוצר מוגמר — פריסה, אריזה, יציאה מהתנור (מ״ר)", f0(F[0].finished), f0(F[1].finished)],
    ["קירור והקפאה (מ״ר)", f0(F[0].cold), f0(F[1].cold)],
    ["מחסן מזון יבש (מ״ר)", f0(F[0].store), f0(F[1].store)],
    ["הנהלה ומשרדים (מ״ר)", f0(F[0].office), f0(F[1].office)],
    ["רווחת עובדים — מבואה, הלבשה, פינת קפה (מ״ר)", f0(F[0].staff), f0(F[1].staff)],
    ["תנורים עוברים", String(F[0].ovens), String(F[1].ovens)],
    ["חניות עובדים בתוך המגרש", String(F[0].cars), String(F[1].cars)],
    ["ריצוף סביב המבנה / רצועת שתילה (מ״ר)", `${f0(F[0].apron)} / ${f0(F[0].planting)}`, `${f0(F[1].apron)} / ${f0(F[1].planting)}`],
  ],
};
const BASIS = "<b>בסיס ומגבלות:</b> המבנה, החדרים, הדלתות, התנורים, המדרגות ומסלול המשאיות נקראו מקבצי ה־DXF של האדריכל (קומת קרקע, קומה א׳, צירים), והאתר — הקרקע, החומות, השערים, הגדר, אבני השפה, העצים ועמודי החשמל — ממפת המדידה. גובה הקומות (5.0 ו־4.0 מ׳) אושר; גובה 0.00 ומפלסי הרמפות משוערים, כי אין חתכים ומפלסים בגיליונות. הציוד, העובדים, הרכבים, הצמחייה, השילוט והגמרים — להמחשה בלבד.";

// ---- chapters ---------------------------------------------------------------------------------------------------------
async function chapter(o: Opt, k: 0 | 1) {
  const shots = shotsOf(o);
  const hero = shots.find((s) => s.id === "out-aerial-nw") ?? shots[0]!;
  const tableOf = (st: "ground" | "first", title: string) => ({ title, head: ["מס׳", "חלל", "חדרים", "שטח (מ״ר)"], rows: keyOf(o, st).map((x) => [String(x.n), esc(x.name), String(x.rooms.length), f1(x.rooms.reduce((s, r) => s + r.areaM2, 0))]), foot: ["", "סה״כ", String(o.rooms[st].length), f1(o.rooms[st].reduce((s, r) => s + r.areaM2, 0))] });
  const plates = [
    { kicker: "תוכנית אתר", title: "האתר והפיתוח", caption: "מבט מלמעלה על המגרש: המבנה, דרכי המשאיות, החניות, החומות והשערים הקיימים והצמחייה. הצבעים בקרקע — לפי המקרא. הסגולים — מקום כל הדמיית חוץ וכיוונה.", image: await sitePlan(o) },
    { kicker: "תוכנית · מבט עליון", title: "קומת קרקע", caption: "הקומה חתוכה בגובה 2.9 מ׳ ונראית מלמעלה, כמו בית הבובות: הקירות, הציוד והתנורים. כל חלל צבוע לפי סוגו וממוספר לפי המקרא שבעמוד הנתונים. הסגולים — מקום הדמיות הפנים.", image: storeyPlan(o, "ground") },
    { kicker: "שרטוט אדריכלי", title: "קומת קרקע — תוכנית מרוהטת", caption: "קירות, דלתות וחלונות, וכל הציוד שהוצב בחדרים במידותיו: שולחנות ומדפי נירוסטה, קו התנורים, קוטרים, מכונות פריסה, מסועים, לוקרים, שולחנות אוכל ועמדות משרד. מידות חוץ במטרים; מתחת לכל מספר — שטח החדר במ״ר. דלתות המשאית — בקו מקווקו כתום.", image: archPlan(o, "ground") },
    { kicker: "תוכנית · מבט עליון", title: "קומה א׳", caption: "קומת האחסון וההנהלה מלמעלה, חתוכה בגובה 2.9 מ׳, ממוספרת לפי המקרא שבעמוד הנתונים.", image: storeyPlan(o, "first") },
    { kicker: "שרטוט אדריכלי", title: "קומה א׳ — תוכנית מרוהטת", caption: `מדפי קירור והקפאה, מערכות מדפי משטחים במחסן, עמדות משרד, קירות ודלתות; מידות חוץ במטרים ושטח כל חדר במ״ר.${o.n === 1 ? " המרפסת — בקו מקווקו." : ""}`, image: archPlan(o, "first") },
    ...(await Promise.all(shots.map(async (s, i) => {
      const pic = o.picture(s.id), st = s.id.startsWith("in-first") ? "first" : "ground";
      return {
        kicker: `הדמיה ${i + 1}${pic.painted ? "" : " · רינדור"}`,
        title: s.title,
        caption: s.caption,
        image: await stamped(pic.file),
        locator: s.id.startsWith("in-") ? storeyPlan(o, st, s.id) : s.id.startsWith("out-") ? await sitePlan(o, s.id) : undefined,
      };
    }))),
  ];
  return {
    name: `הצעה ${o.n}`,
    hero: await stamped(o.picture(hero.id).file),
    kpis: [
      { label: "קומת קרקע", value: `${f0(F[k].g)} מ״ר` },
      { label: "קומה א׳", value: `${f0(F[k].f)} מ״ר` },
      { label: "חניות עובדים", value: String(F[k].cars) },
      { label: "הדמיות", value: String(shots.length) },
    ],
    paragraphs: [
      k === 0
        ? "<b>הצעה 1 — המשאיות בקומה א׳.</b> בתשריט מסלול המשאיות כולו בגובה הקומה הראשונה: רמפה עולה לאורך הצד הדרום־מערבי מ״כניסת משאיות״, מסלול מוגבה לאורך המרפסת, וירידה אל הכביש הצפוני ב״יציאת משאיות״. הפריקה והטעינה במרפסת, ישירות לחדרי הקירור, ההקפאה והמחסן שבקומה א׳. קומת הקרקע כולה לייצור ולרווחת העובדים."
        : "<b>הצעה 2 — המשאיות בקרקע.</b> חצר משאיות באספלט מול השער הצפון־מערבי הקיים, ושתי דלתות משאית המצוירות בתשריט: ״כניסת חומרי גלם״ בצד חומר הגלם ו״יציאת תצ״ג״ בצד המוצר המוגמר. אין רמפה; המבנה מלבני וקומה א׳ בשטח מלא מעל הקרקע.",
      `<b>גישת משאיות:</b> ${truckWay(k)}. <b>דלתות:</b> ${truckDoors(k)}.`,
      "<b>כניסות עובדים:</b> שתיים, כמו בתשריט — ״כניסה מחלקת ייצור״ ו״כניסה מחלקת תצ״ג״, כל אחת אל מבואה, הלבשה ושירותים ופינת קפה. חניות העובדים מסומנות מולן, בתוך החומה.",
      BASIS,
    ],
    rooms: [],
    tables: [tableOf("ground", "מקרא — קומת קרקע"), tableOf("first", "מקרא — קומה א׳")],
    sheets: [],
    plates,
    report: [
      `גובה 0.00 = ${o.report.zero.absolute} (קרקע המדידה ליד כניסת הייצור) — משוער.`,
      ...(F[k].route ? [`מפלסי הרמפות: מ־${F[k].route!.rampUp.fromM} עד +${F[k].route!.rampUp.toM} ובחזרה ל־${F[k].route!.rampDown.toM} — משוערים, אין מפלסים בגיליונות.`] : []),
      `מעקה גג 1.0 מ׳ — משוער.`,
      "דלתות משאית, חלונות, ציוד, רכבים, ריצוף, שתילה ודרך הכניסה — הצעה, אינם מצוירים בתשריט.",
    ],
  };
}
// the closing chapter: the same views of both proposals, one over the other
async function pair(id: string, label: string) {
  const a = opts[0].picture(id).file, b = opts[1].picture(id).file;
  const W = 1600, h = async (f: string) => sharp(f).resize(W).jpeg({ quality: 88 }).toBuffer();
  const [ia, ib] = [await h(a), await h(b)];
  const ha = (await sharp(ia).metadata()).height!, hb = (await sharp(ib).metadata()).height!;
  const tag = (t: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56"><rect width="200" height="56" rx="8" fill="#1e1b4b" fill-opacity="0.85"/><text x="100" y="38" text-anchor="middle" font-family="Arial" font-weight="700" font-size="28" fill="#fff">${t}</text></svg>`);
  const buf = await sharp({ create: { width: W * 2 + 16, height: Math.max(ha, hb), channels: 3, background: "#ffffff" } })
    .composite([{ input: ib, left: 0, top: 0 }, { input: ia, left: W + 16, top: 0 }, { input: await sharp(tag("הצעה 2")).png().toBuffer(), left: 20, top: 20 }, { input: await sharp(tag("הצעה 1")).png().toBuffer(), left: W + 36, top: 20 }])
    .jpeg({ quality: 88 }).toBuffer();
  return { kicker: "השוואה", title: label, caption: "מימין — הצעה 1, משמאל — הצעה 2, מאותה נקודת מבט.", image: await img(buf) };
}
async function pairSvg(a: BookletImage, b: BookletImage, label: string, caption: string) {
  const ra = Buffer.from(a.base64, "base64"), rb = Buffer.from(b.base64, "base64");
  const pa = await sharp(ra, { density: 110 }).flatten({ background: "#fff" }).jpeg({ quality: 88 }).toBuffer(), pb = await sharp(rb, { density: 110 }).flatten({ background: "#fff" }).jpeg({ quality: 88 }).toBuffer();
  const ma = await sharp(pa).metadata(), mb = await sharp(pb).metadata();
  const buf = await sharp({ create: { width: ma.width! + mb.width! + 16, height: Math.max(ma.height!, mb.height!), channels: 3, background: "#ffffff" } }).composite([{ input: pb, left: 0, top: 0 }, { input: pa, left: mb.width! + 16, top: 0 }]).jpeg({ quality: 88 }).toBuffer();
  return { kicker: "השוואה", title: label, caption, image: await img(buf) };
}

// PLANS_ONLY=<dir>: write the storey plans and the architectural drawings as PNGs there, and stop (to look at them)
if (process.env.PLANS_ONLY) {
  fs.mkdirSync(process.env.PLANS_ONLY, { recursive: true });
  for (const o of opts) for (const st of ["ground", "first"] as const) for (const [nm, im] of [["top", storeyPlan(o, st)], ["arch", archPlan(o, st)]] as const) {
    await sharp(Buffer.from(im.base64, "base64"), { density: 96 }).flatten({ background: "#fff" }).png().toFile(path.join(process.env.PLANS_ONLY, `${o.n}-${st}-${nm}.png`));
  }
  console.log("plans →", process.env.PLANS_ONLY); process.exit(0);
}
const chapters = [await chapter(opts[0], 0), await chapter(opts[1], 1)];
const both = (await Promise.all([["out-aerial-nw", "מבט אוויר מצפון־מערב"], ["doll-ground-nw", "קומת הקרקע"]].filter(([id]) => fs.existsSync(opts[0].picture(id!).file) && fs.existsSync(opts[1].picture(id!).file)).map(([id, l]) => pair(id!, l!))));
const sideBySite = await pairSvg(await sitePlan(opts[0], "none"), await sitePlan(opts[1], "none"), "תוכניות האתר", "מימין — הצעה 1, משמאל — הצעה 2, באותו קנה מידה ובאותו מקום: המבנה, מסלול המשאיות או החצר, החניות והפיתוח.");
chapters.push({
  name: "השוואה",
  hero: await stamped(opts[0].picture("out-aerial-nw").file),
  kpis: [
    { label: "סה״כ בנוי — הצעה 1", value: `${f0(F[0].total)} מ״ר` },
    { label: "סה״כ בנוי — הצעה 2", value: `${f0(F[1].total)} מ״ר` },
    { label: "חניות — 1 / 2", value: `${F[0].cars} / ${F[1].cars}` },
  ],
  paragraphs: [
    `<b>ההבדל העיקרי — היכן נפרקות המשאיות.</b> בהצעה 1 המשאיות עולות ברמפה ופורקות בקומה א׳, ישר אל הקירור והמחסן; החצר שבקרקע פנויה לעובדים ולחניה, אבל נדרשים רמפה של כ־${f0(F[0].route?.rampUp.lengthM ?? 0)} מ׳ בשיפוע ${f0(((F[0].route?.rampUp.toM ?? 0) - (F[0].route?.rampUp.fromM ?? 0)) / (F[0].route?.rampUp.lengthM || 1) * 100)}% ומסלול מוגבה על עמודים; שתי הרמפות מתחילות ונגמרות בתוך גדר המגרש, על משטח ישר של ${f0(F[0].route?.landingM ?? 6)} מ׳ ליד החנייה; המשאיות נכנסות ויוצאות דרך החצר והשער — אין יציאה מהרמפה ישר לכביש. בהצעה 2 המשאיות פורקות בקרקע, בחצר מול השער, דרך הדלתות המצוירות בתשריט; אין רמפה, אבל החצר תופסת את חזית המגרש ונשארות מעט חניות.`,
    `<b>שטחים:</b> הצעה 1 — ${f0(F[0].g)} מ״ר בקרקע ו־${f0(F[0].f)} בקומה א׳ (קומה א׳ קטנה מהקרקע, והמרפסת לאורכה). הצעה 2 — ${f0(F[1].g)} מ״ר בכל קומה, מבנה מלבני אחד.`,
    "<b>זרימת הייצור</b> זהה בשתיהן: קו של 15 תנורים עוברים מפריד בין צד חומר הגלם (ייצור, הפשרה, קצביה) לצד המוצר המוגמר (יציאה מהתנור, פריסה, אריזה).",
  ],
  rooms: [],
  tables: [COMPARE],
  sheets: [],
  plates: [sideBySite, ...both],
  report: [],
});

const coverPick = opts[1].picture("out-aerial-nw").file;
const html = buildProjectBookletHtml({
  projectName: "מפעל דליקטס · קריית ארבע",
  subtitle: "חוברת הדמיה · שתי הצעות תכנון · גוטליב אדריכלים",
  hero: await stamped(coverPick),
  kpis: [
    { label: "הצעות", value: "2" },
    { label: "בנוי — הצעה 1", value: `${f0(F[0].total)} מ״ר` },
    { label: "בנוי — הצעה 2", value: `${f0(F[1].total)} מ״ר` },
    { label: "תנורים עוברים", value: String(F[0].ovens) },
  ],
  paragraphs: [
    "מפעל לייצור נקניקים ומוצרי בשר באזור התעשייה של קריית ארבע, בשתי קומות: קומת קרקע לייצור ולרווחת העובדים, וקומה א׳ לקירור, הקפאה, מחסן והנהלה. החוברת מציגה את שתי ההצעות של האדריכל — כל אחת עם תוכנית האתר, תוכניות הקומות עם מקרא, והדמיות מבחוץ ומבפנים — ובסופה השוואה.",
    BASIS,
  ],
  chapters,
});
fs.mkdirSync(path.dirname(path.resolve(outPdf)), { recursive: true });
// the shared data page's line speaks of a house read from labelled sheets and elevations; this factory's areas are measured from its model
const pageHtml = html.split("המידות והשטחים כפי שנכתבו בתוויות החדרים בתוכניות האדריכל; המפלסים מהחזיתות.").join("השטחים נמדדו מהמודל שנבנה מקבצי ה־DXF של האדריכל; המפלסים משוערים — אין חתכים בגיליונות.");
const pdf = await renderHtmlSectionsPdf(pageHtml, { waitForImages: true, timeoutMs: 300_000, jpegQuality: 90, sheet: BUILDING_BOOKLET_PAGE });
fs.writeFileSync(outPdf, pdf);
console.log(`${outPdf}: ${(pdf.length / 1e6).toFixed(1)} MB`);
