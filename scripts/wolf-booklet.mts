#!/usr/bin/env npx tsx
/**
 * בי"ס וולף בני ברק — the visualisation booklet, from the model wolf-model.mts built.
 *
 *   npx tsx --conditions=react-server scripts/wolf-booklet.mts <wolf-model out dir> <out dir> [--no-pdf]
 *
 * Free: every picture is rasterised by the system's own engine, every drawing is the
 * architect's DXF linework laid in the frame its render shares. Floor plans (render, DXF, comparison),
 * the four elevations, views from outside and from inside. Nothing here calls an image model.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
const { buildBuildingBookletHtml, BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");
type Payload = import("@/lib/projects/building/render-page").BuildingRenderPayload;
type BookletImage = import("@/lib/projects/building/booklet-html").BookletImage;
type Sheet = import("@/lib/projects/building/booklet-html").BuildingBookletSheet;
type Plate = import("@/lib/projects/building/booklet-html").BuildingBookletPlate;

const [inDir, outDir, ...flags] = process.argv.slice(2);
if (!inDir || !outDir) throw new Error("usage: <model dir> <out dir> [--no-pdf]");
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const load = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(inDir, name), "utf8")) as T;
const model = load<Payload["model"]>("model.json");
type RoomRow = { floor: string; level: number; name: string; kind: string; printed: number | null; areaM2: number; x: number; y: number; bounds: { x: number; y: number; w: number; h: number } };
const rooms = load<RoomRow[]>("rooms.json");
const drawing = load<Record<string, { segs: number[][]; win: number[][] }>>("drawing.json");
type PlanData = {
  level: number;
  outlines: Array<Array<[number, number]>>;
  rooms: Array<{ name: string; kind: string; printed: number | null; areaM2: number; x: number; y: number; rects: Array<{ x: number; y: number; w: number; h: number }>; real: number }>;
  walls: Array<{ o: string; x: number; y: number; w: number; h: number }>;
  openings: Array<{ o: string; x: number; y: number; w: number; h: number; kind: string; exterior: boolean; door: boolean; full: boolean }>;
  items: Array<{ kind: string; x: number; y: number; lu?: number; lv?: number; angle?: number; top?: number; ring?: Array<[number, number]> }>;
  polys?: Array<Array<[number, number]>>;
  diag?: Array<[number, number, number, number]>;
};
const plans = load<Record<string, PlanData>>("plans.json");
const elevs = load<Record<string, { lines: Array<Array<[number, number]>>; u0: number; u1: number; v0: number; v1: number; rightIsPlus: boolean; lo: number; hi: number }>>("elevations.json");

/** The printed body (38.30 × 48.35 m), plan metres from the frame's corner. */
const BODY = { x0: 13.4, x1: 51.7, z0: 13.07, z1: 61.42 };
const H = 3.36;
const FLOORS = [
  { id: "floor-0", label: "קומת קרקע", level: 0 },
  { id: "floor-1", label: "קומה א'", level: H },
  { id: "floor-2", label: "קומה ב' (תוספת)", level: 2 * H },
  { id: "floor-3", label: "קומה ג' (תוספת)", level: 3 * H },
] as const;
const F = { x0: BODY.x0 - 1.6, x1: BODY.x1 + 1.6, z0: BODY.z0 - 1.8, z1: BODY.z1 + 1.8 };
const W = 2400;
const jpeg = async (buf: Buffer, width = 2600): Promise<BookletImage> => {
  const out = await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { mimeType: "image/jpeg", base64: out.data.toString("base64"), width: out.info.width, height: out.info.height };
};
const frame = async (p: Omit<Payload, "model">, opts?: { width?: number }) => (await renderBuildingFrames([{ ...p, model } as Payload], { outputWidthPx: opts?.width ?? 99999 }))[0]!;

// ---- Floor plans: a colour plan drawn from the rooms the model read, each room in the colour of its use with its own furniture in it.
const planH = Math.round((W * (F.z1 - F.z0)) / (F.x1 - F.x0));
const k = W / (F.x1 - F.x0);
const px = (x: number) => ((x - F.x0) * k).toFixed(1);
const pz = (z: number) => ((z - F.z0) * k).toFixed(1);
const sheets: Sheet[] = [];
const plates: Plate[] = [];
const dxfImage = async (id: string): Promise<BookletImage> => {
  const d = drawing[id]!;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${planH}"><rect width="100%" height="100%" fill="#fff"/>`;
  for (const [ax, ay, bx, by] of d.win) svg += `<line x1="${px(ax!)}" y1="${pz(ay!)}" x2="${px(bx!)}" y2="${pz(by!)}" stroke="#c9a000" stroke-width="1.1"/>`;
  for (const [ax, ay, bx, by] of d.segs) svg += `<line x1="${px(ax!)}" y1="${pz(ay!)}" x2="${px(bx!)}" y2="${pz(by!)}" stroke="#111" stroke-width="1.5"/>`;
  svg += "</svg>";
  return jpeg(await sharp(Buffer.from(svg)).png().toBuffer());
};

type Use = "classroom" | "therapy" | "lab" | "library" | "teachers" | "admin" | "hall" | "wc" | "kitchen" | "store" | "safe" | "stair" | "other";
const USE: Record<Use, { color: string; he: string }> = {
  classroom: { color: "#FFD23F", he: "כיתות לימוד" },
  therapy: { color: "#FF9F45", he: "חדרי טיפול ועבודה פרטנית" },
  lab: { color: "#3FA9F5", he: "מעבדות ומחשבים" },
  library: { color: "#2ECC71", he: "ספרייה" },
  teachers: { color: "#7C4DFF", he: "חדר מורים" },
  admin: { color: "#FF6B9D", he: "הנהלה, ייעוץ ושירות" },
  hall: { color: "#FF4D4D", he: "אולם" },
  wc: { color: "#19C3C3", he: "שירותים" },
  kitchen: { color: "#E040FB", he: "מטבח" },
  store: { color: "#90A4AE", he: "מחסנים" },
  safe: { color: "#D84315", he: 'ממ"ד' },
  stair: { color: "#5C6BC0", he: "מדרגות ומעלית" },
  other: { color: "#A3E635", he: "מבואה ואחר" },
};
const roomUseOf = (name: string, kind: string): Use => {
  if (/טכנולוגיה|מחשב/.test(name) || kind === "computers") return "lab";
  if (/ספריה|משחקים/.test(name)) return "library";
  if (/מורים/.test(name)) return "teachers";
  if (/טיפול|עבודה פרטנית|הקבצה|התרגעות|תקשורת|תעסוקה|מוזיקה|חדר עזר/.test(name)) return "therapy";
  if (/מנהל|סגן|מזכירות|יועץ|פסיכולוג|אחות|רופא|צוות|הנהלה|פינת/.test(name)) return "admin";
  if (/כיתה|כתה/.test(name) || kind === "classroom") return "classroom";
  if (/אולם/.test(name) || kind === "hall") return "hall";
  if (/שירותים|שירותי/.test(name) || kind === "wc") return "wc";
  if (/מטבח/.test(name) || kind === "kitchen") return "kitchen";
  if (/מחסן|שרת/.test(name) || kind === "store") return "store";
  if (/ממ"|מ\.מ\.מ/.test(name) || kind === "mmd") return "safe";
  if (/מדרגות|מעלית/.test(name) || kind === "stair" || kind === "lift") return "stair";
  return "other";
};
const ITEM_STYLE: Record<string, string> = {
  desk: 'fill="#FFF3D6" stroke="#7A3E00" stroke-width="1.6"',
  teacherDesk: 'fill="#FFD9A0" stroke="#7A3E00" stroke-width="2"',
  table: 'fill="#FFEBC2" stroke="#7A3E00" stroke-width="2"',
  shelf: 'fill="#37474F" stroke="#0B1217" stroke-width="1.2"',
  locker: 'fill="#37474F" stroke="#0B1217" stroke-width="1.2"',
  cabinet: 'fill="#455A64" stroke="#0B1217" stroke-width="1.2"',
  counter: 'fill="#546E7A" stroke="#0B1217" stroke-width="1.5"',
  monitor: 'fill="#0288D1" stroke="#01579B" stroke-width="1"',
  sofa: 'fill="#FFFFFF" stroke="#311B92" stroke-width="2"',
  bench: 'fill="#FFFFFF" stroke="#37474F" stroke-width="1.6"',
  mat: 'fill="#FFFFFF" fill-opacity="0.55" stroke="#37474F" stroke-width="1.2" stroke-dasharray="6 4"',
  board: 'fill="#FFFFFF" stroke="#0B1217" stroke-width="3.5"',
  stall: 'fill="#0B1217" stroke="#0B1217" stroke-width="2"',
  real: 'fill="none" stroke="#1B1B1B" stroke-width="1.3"',
};
const CW = 3050, CH = 2700, PAD = 60;
const kk = (CH - 2 * PAD) / (F.z1 - F.z0);
const PX = (x: number) => (PAD + (x - F.x0) * kk).toFixed(1);
const PZ = (z: number) => (PAD + (z - F.z0) * kk).toFixed(1);
const PANEL_X1 = CW - PAD; // the key's right edge
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
/** The part of a room worth colouring: a label standing in an open lobby claims a region far bigger than its room, so only the area it prints is painted, nearest its label. */
const budgetOf = (r: PlanData["rooms"][number]): number => {
  const small = /מטבח|מחסן|מנהל|סגן|מזכירות|יועץ|אחות|רופא|ח\.שרת|תקשורת|שירותים|שירותי/.test(r.name);
  const wc = /שירותים|שירותי/.test(r.name);
  return r.printed ? (r.areaM2 > r.printed * 1.35 ? r.printed * 1.1 : Infinity) : small && r.areaM2 > (wc ? 14 : 30) ? (wc ? 12 : 25) : r.areaM2 > 90 ? 60 : Infinity;
};
/** The area a room is shown with: the printed one, else its own, never more than the part of the open region it is painted over. */
const shownArea = (r: PlanData["rooms"][number]): number => r.printed ?? Math.round(Math.min(r.areaM2, budgetOf(r)));
const visibleRects = (r: PlanData["rooms"][number]) => {
  // A room with no printed area that claims more than 30 m² (a label standing in an open lobby) is painted only to the size its kind has: 25 m² for a kitchen, store or office.
  const budget = budgetOf(r);
  if (!Number.isFinite(budget)) return r.rects;
  const sorted = [...r.rects].sort((a, b) => Math.hypot(a.x + a.w / 2 - r.x, a.y + a.h / 2 - r.y) - Math.hypot(b.x + b.w / 2 - r.x, b.y + b.h / 2 - r.y));
  const out: typeof r.rects = [];
  const sum = r.rects.reduce((a, q) => a + q.w * q.h, 0) || 1;
  const k2 = r.areaM2 / sum;
  let acc = 0;
  for (const q of sorted) { out.push(q); acc += q.w * q.h * k2; if (acc >= budget) break; }
  return out;
};
const usedUses = (pd: PlanData) => [...new Set(pd.rooms.filter((r) => r.areaM2 >= 4.5).map((r) => roomUseOf(r.name, r.kind)))] as Use[];
const planSvg = (id: string, floorLabel: string, level: number): string => {
  const pd = plans[id]!;
  const FONT = 'font-family="Arial, Segoe UI, sans-serif"';
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}"><rect width="100%" height="100%" fill="#FFFFFF"/>`;
  for (const ring of pd.outlines) svg += `<polygon points="${ring.map(([x, y]) => `${PX(x)},${PZ(y)}`).join(" ")}" fill="#DCE3EC" stroke="#DCE3EC" stroke-width="2"/>`;
  for (const r of pd.rooms) {
    const c = USE[roomUseOf(r.name, r.kind)].color;
    for (const q of visibleRects(r)) svg += `<rect x="${PX(q.x)}" y="${PZ(q.y)}" width="${(q.w * kk + 0.8).toFixed(1)}" height="${(q.h * kk + 0.8).toFixed(1)}" fill="${c}" stroke="${c}" stroke-width="0.6"/>`;
  }
  for (const it of pd.items) {
    if (it.kind === "tower") continue;
    if (it.kind === "stairs") {
      // The stair: a frame, its tread lines, an arrow up the first flight and the word.
      const x0 = it.x - (it.lu ?? 3.3) / 2, z0 = it.y - (it.lv ?? 4.5) / 2;
      svg += `<rect x="${PX(x0)}" y="${PZ(z0)}" width="${((it.lu ?? 3.3) * kk).toFixed(1)}" height="${((it.lv ?? 4.5) * kk).toFixed(1)}" fill="#EDE9FE" stroke="#4C1D95" stroke-width="5"/>`;
      for (let i = 0; i <= 10; i++) { const z = 36.92 + i * 0.29; for (const [xa, xb] of [[37.8, 39.4], [39.5, 41.1]] as const) svg += `<line x1="${PX(xa)}" y1="${PZ(z)}" x2="${PX(xb)}" y2="${PZ(z)}" stroke="#4C1D95" stroke-width="2.5"/>`; }
      svg += `<line x1="${PX(38.6)}" y1="${PZ(39.6)}" x2="${PX(38.6)}" y2="${PZ(37.2)}" stroke="#4C1D95" stroke-width="7"/><polygon points="${PX(38.6)},${PZ(36.8)} ${(Number(PX(38.6)) - 16).toFixed(1)},${(Number(PZ(37.5))).toFixed(1)} ${(Number(PX(38.6)) + 16).toFixed(1)},${(Number(PZ(37.5))).toFixed(1)}" fill="#4C1D95"/>`;
      svg += `<text x="${PX(40.3)}" y="${PZ(35.9)}" text-anchor="middle" ${FONT} font-size="34" font-weight="700" fill="#4C1D95" stroke="#FFFFFF" stroke-width="7" paint-order="stroke">מדרגות</text>`;
      continue;
    }
    if (it.kind === "chair") { svg += `<circle cx="${PX(it.x)}" cy="${PZ(it.y)}" r="${(0.2 * kk).toFixed(1)}" fill="#263238" stroke="#FFFFFF" stroke-width="1"/>`; continue; }
    if (it.kind === "plant") { svg += `<circle cx="${PX(it.x)}" cy="${PZ(it.y)}" r="${(0.28 * kk).toFixed(1)}" fill="#1B5E20"/>`; continue; }
    if (it.kind === "toilet") { svg += `<ellipse cx="${PX(it.x)}" cy="${PZ(it.y)}" rx="${(0.2 * kk).toFixed(1)}" ry="${(0.3 * kk).toFixed(1)}" fill="#FFFFFF" stroke="#0B1217" stroke-width="1.6" transform="rotate(${(((it.angle ?? 0) * 180) / Math.PI + 90).toFixed(1)} ${PX(it.x)} ${PZ(it.y)})"/>`; continue; }
    if (it.kind === "basin") { svg += `<circle cx="${PX(it.x)}" cy="${PZ(it.y)}" r="${(0.2 * kk).toFixed(1)}" fill="#FFFFFF" stroke="#0B1217" stroke-width="1.6"/>`; continue; }
    if (!it.lu || !it.lv) continue;
    const st = ITEM_STYLE[it.kind] ?? ITEM_STYLE.real!;
    svg += `<rect x="${(-(it.lu * kk) / 2).toFixed(1)}" y="${(-(it.lv * kk) / 2).toFixed(1)}" width="${(it.lu * kk).toFixed(1)}" height="${(it.lv * kk).toFixed(1)}" ${st} transform="translate(${PX(it.x)} ${PZ(it.y)}) rotate(${(((it.angle ?? 0) * 180) / Math.PI).toFixed(1)})"/>`;
  }
  for (const q of pd.walls) svg += `<rect x="${PX(q.x)}" y="${PZ(q.y)}" width="${(q.w * kk).toFixed(1)}" height="${(q.h * kk).toFixed(1)}" fill="#1E293B"/>`;
  for (const [ax, az, bx, bz] of pd.diag ?? []) svg += `<line x1="${PX(ax)}" y1="${PZ(az)}" x2="${PX(bx)}" y2="${PZ(bz)}" stroke="#1E293B" stroke-width="7" stroke-linecap="round"/>`;
  // Glazing at an angle (the curved lobby wall): a light-blue band with a dark edge.
  for (const poly of pd.polys ?? []) { const pts = poly.map(([x, z]) => `${PX(x)},${PZ(z)}`).join(" "); svg += `<polyline points="${pts}" fill="none" stroke="#0369A1" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="#7DD3FC" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`; }
  for (const q of pd.openings) {
    const win = q.kind !== "doorway" || q.exterior;
    svg += `<rect x="${PX(q.x)}" y="${PZ(q.y)}" width="${(q.w * kk).toFixed(1)}" height="${(q.h * kk).toFixed(1)}" fill="${win ? "#7DD3FC" : "#FFFFFF"}" stroke="${win ? "#0369A1" : "#F59E0B"}" stroke-width="${win ? 1.8 : 2.6}"/>`;
  }
  // The room's name and area written in it.
  for (const r of pd.rooms) {
    if (r.areaM2 < 4.5) continue;
    const name = r.name.replace(/^חדר\s+/, "").replace(/q/g, " ").replace(/\s+/g, " ").trim();
    const fs = Math.max(24, Math.min(46, Math.sqrt(r.areaM2) * 6.0));
    const x = PX(r.x), y = Number(PZ(r.y));
    const area = `${shownArea(r)} מ"ר`;
    const halo = `stroke="#FFFFFF" stroke-width="${(fs / 4.5).toFixed(1)}" paint-order="stroke" stroke-linejoin="round"`;
    svg += `<text x="${x}" y="${(y - fs * 0.1).toFixed(1)}" text-anchor="middle" ${FONT} font-size="${fs.toFixed(0)}" font-weight="700" fill="#0B1217" ${halo}>${esc(name)}</text>`;
    svg += `<text x="${x}" y="${(y + fs * 1.05).toFixed(1)}" text-anchor="middle" ${FONT} font-size="${(fs * 0.9).toFixed(0)}" font-weight="700" fill="#0B1217" ${halo}>${esc(area)}</text>`;
  }
  // North arrow.
  const [ax, ay] = [Number(PX(F.x0 + 1.4)), Number(PZ(F.z0 + 1.6))];
  svg += `<g stroke="#0B1217" fill="#0B1217" stroke-width="6"><line x1="${ax}" y1="${ay + 70}" x2="${ax}" y2="${ay - 10}"/><polygon points="${ax},${ay - 62} ${ax - 20},${ay - 6} ${ax + 20},${ay - 6}"/></g><text x="${ax}" y="${ay - 76}" text-anchor="middle" ${FONT} font-size="40" font-weight="700" fill="#0B1217">N</text>`;
  // The key, on the right: the floor, each use with its rooms and area, then the symbols.
  const rx = PANEL_X1;
  svg += `<text x="${rx}" y="170" text-anchor="start" direction="rtl" ${FONT} font-size="108" font-weight="700" fill="#0B1217">${esc(floorLabel)}</text>`;
  svg += `<text x="${rx}" y="250" text-anchor="start" direction="rtl" ${FONT} font-size="52" fill="#334155">מפלס ${level === 0 ? "±0.00" : "+" + level.toFixed(2)}</text>`;
  svg += `<text x="${rx}" y="380" text-anchor="start" direction="rtl" ${FONT} font-size="64" font-weight="700" fill="#0B1217">מקרא החללים</text>`;
  let y = 450;
  for (const u of usedUses(pd)) {
    const rs = pd.rooms.filter((r) => r.areaM2 >= 4.5 && roomUseOf(r.name, r.kind) === u);
    const total = Math.round(rs.reduce((a, r) => a + shownArea(r), 0));
    svg += `<rect x="${rx - 90}" y="${y}" width="90" height="56" rx="8" fill="${USE[u].color}" stroke="#0B1217" stroke-width="3"/>`;
    svg += `<text x="${rx - 112}" y="${y + 40}" text-anchor="start" direction="rtl" ${FONT} font-size="46" font-weight="700" fill="#0B1217">${esc(USE[u].he)}</text>`;
    svg += `<text x="${rx - 112}" y="${y + 92}" text-anchor="start" direction="rtl" ${FONT} font-size="36" fill="#334155">${rs.length} חללים · ${total} מ"ר</text>`;
    y += 120;
  }
  y += 40;
  svg += `<text x="${rx}" y="${y}" text-anchor="start" direction="rtl" ${FONT} font-size="54" font-weight="700" fill="#0B1217">סימונים</text>`;
  y += 40;
  const sym: Array<[string, string]> = [
    [`<rect x="${rx - 90}" y="${y + 6}" width="90" height="44" fill="#1E293B"/>`, "קיר"],
    [`<rect x="${rx - 90}" y="${y + 6}" width="90" height="44" fill="#7DD3FC" stroke="#0369A1" stroke-width="3"/>`, "חלון"],
    [`<rect x="${rx - 90}" y="${y + 6}" width="90" height="44" fill="#FFFFFF" stroke="#F59E0B" stroke-width="4"/>`, "פתח או דלת"],
    [`<rect x="${rx - 90}" y="${y + 6}" width="90" height="44" fill="#FFF3D6" stroke="#7A3E00" stroke-width="3"/>`, "שולחן או שולחן עבודה"],
    [`<circle cx="${rx - 45}" cy="${y + 28}" r="22" fill="#263238"/>`, "כיסא"],
    [`<rect x="${rx - 90}" y="${y + 20}" width="90" height="12" fill="#FFFFFF" stroke="#0B1217" stroke-width="5"/>`, "לוח"],
    [`<rect x="${rx - 90}" y="${y + 6}" width="90" height="44" fill="#455A64" stroke="#0B1217" stroke-width="3"/>`, "ארון או מדף"],
    [`<rect x="${rx - 90}" y="${y + 6}" width="90" height="44" fill="#EDE9FE" stroke="#4C1D95" stroke-width="4"/>`, "גרם מדרגות"],
  ];
  let yy = y;
  for (const [shape, label] of sym) {
    svg += shape.replace(new RegExp(`y="${y + 6}"`, "g"), `y="${yy + 6}"`).replace(new RegExp(`y="${y + 20}"`, "g"), `y="${yy + 20}"`).replace(new RegExp(`cy="${y + 28}"`, "g"), `cy="${yy + 28}"`);
    svg += `<text x="${rx - 112}" y="${yy + 42}" text-anchor="start" direction="rtl" ${FONT} font-size="40" fill="#0B1217">${label}</text>`;
    yy += 70;
  }
  svg += `<text x="${rx}" y="${CH - 90}" text-anchor="start" direction="rtl" ${FONT} font-size="34" fill="#64748B">ריהוט כפי שסומן בתוכניות; בחללים שלא סומנו בהם — לפי ייעוד החלל.</text>`;
  return svg + "</svg>";
};
let no = 0;
for (const f of FLOORS) {
  const render = await jpeg(await sharp(Buffer.from(planSvg(f.id, f.label, f.level))).png().toBuffer(), 3000);
  sheets.push({
    no: ++no,
    title: f.label,
    caption: `תוכנית ${f.label}, מפלס ${f.level === 0 ? "±0.00" : "+" + f.level.toFixed(2)}. כל חלל בצבע ייעודו, עם הריהוט שלו; שם החלל ושטחו כפי שהודפסו בתוכנית.`,
    sheet: await dxfImage(f.id),
    render,
  });
  say(`plan ${f.id}: ${plans[f.id]!.rooms.length} rooms, ${plans[f.id]!.items.length} pieces`);
}
// Roof plan: the roof in light grey, its parapet and the DXF's own lines, the towers found as the wall clusters inside the parapet.
{
  const pd = plans.roof!;
  const ring = pd.outlines[0]!;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${planH}"><rect width="100%" height="100%" fill="#FFFFFF"/>`;
  svg += `<polygon points="${ring.map(([x, y]) => `${px(x)},${pz(y)}`).join(" ")}" fill="#CFD8DC" stroke="#263238" stroke-width="14" stroke-linejoin="round"/>`;
  // Clusters of wall bands that touch: the biggest is the parapet's, the others are towers.
  const bands = pd.walls.map((q) => ({ x0: q.x - 0.3, y0: q.y - 0.3, x1: q.x + q.w + 0.3, y1: q.y + q.h + 0.3 }));
  const parent = bands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) {
    const A = bands[i]!, B = bands[j]!;
    if (A.x0 <= B.x1 && B.x0 <= A.x1 && A.y0 <= B.y1 && B.y0 <= A.y1) parent[find(i)] = find(j);
  }
  const groups = new Map<number, typeof bands>();
  bands.forEach((bd, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), bd]));
  const boxes = [...groups.values()].map((g) => ({ x0: Math.min(...g.map((q) => q.x0)) + 0.3, y0: Math.min(...g.map((q) => q.y0)) + 0.3, x1: Math.max(...g.map((q) => q.x1)) - 0.3, y1: Math.max(...g.map((q) => q.y1)) - 0.3 })).sort((a, c) => (c.x1 - c.x0) * (c.y1 - c.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));
  const towers = boxes.slice(1).filter((q) => (q.x1 - q.x0) * (q.y1 - q.y0) >= 3 && (q.x1 - q.x0) * (q.y1 - q.y0) < 120);
  const FONT = 'font-family="Arial, Segoe UI, sans-serif"';
  const halo = 'stroke="#FFFFFF" stroke-width="9" paint-order="stroke" stroke-linejoin="round"';
  const say2 = (x: number, y: number, size: number, text: string, color = "#0B1217") => `<text x="${px(x)}" y="${pz(y)}" text-anchor="middle" ${FONT} font-size="${size}" font-weight="700" fill="${color}" ${halo}>${esc(text)}</text>`;
  let texts = "";
  for (const q of towers) {
    const area = (q.x1 - q.x0) * (q.y1 - q.y0);
    // The small box beside the lift is the tallest; the stair towers stand at +17.31.
    const top = area < 20 ? 18.5 : 17.31;
    svg += `<rect x="${px(q.x0)}" y="${pz(q.y0)}" width="${((q.x1 - q.x0) * k).toFixed(1)}" height="${((q.y1 - q.y0) * k).toFixed(1)}" fill="${top > 18 ? "#E53935" : "#5C6BC0"}" stroke="#1A237E" stroke-width="5"/>`;
    texts += say2((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2 - 1.2, 40, `מגדל +${top.toFixed(2)}`);
  }
  // The two stair towers (3.5 × 6.2 m, the cells the roof sheet closes at x 31.6–35.1) rise to +17.31, the lift's box to +18.50.
  for (const [z0, z1, name] of [[16.26, 22.28, "צפון"], [52.02, 58.24, "דרום"]] as const) {
    svg += `<rect x="${px(31.6)}" y="${pz(z0)}" width="${(3.52 * k).toFixed(1)}" height="${((z1 - z0) * k).toFixed(1)}" fill="#5C6BC0" stroke="#1A237E" stroke-width="5"/>`;
    texts += say2(33.36, (z0 + z1) / 2 - 0.4, 34, `מגדל מדרגות ${name}`);
    texts += say2(33.36, (z0 + z1) / 2 + 1.2, 34, "+17.31");
  }
  texts += say2(27, 34.2, 62, "גג טכני +13.44");
  texts += say2(27, 37.4, 40, "מעקה +13.94 · מסך לוורים סביב עד +15.84");
  for (const [ax, ay, bx, by] of drawing.roof!.segs) svg += `<line x1="${px(ax!)}" y1="${pz(ay!)}" x2="${px(bx!)}" y2="${pz(by!)}" stroke="#111" stroke-width="2"/>`;
  svg += texts + "</svg>";
  sheets.push({ no: ++no, title: "גג טכני", caption: "תוכנית הגג: מעקה ב-+13.94, מסך לוורים סביב עד +15.84, ומגדלי הגג בגבהים לפי החתכים (+17.31, ובאמצע +18.50).", sheet: await dxfImage("roof"), render: await jpeg(await sharp(Buffer.from(svg)).png().toBuffer(), 3000) });
  say(`plan roof: ${towers.length} towers`);
}

// ---- Elevations: the model from each side, the DXF elevation in the same frame.
const FACADES = [
  { id: "south", he: "חזית דרומית", axis: "x" as const, cam: { dx: 0, dz: 1 } },
  { id: "north", he: "חזית צפונית", axis: "x" as const, cam: { dx: 0, dz: -1 } },
  { id: "east", he: "חזית מזרחית", axis: "z" as const, cam: { dx: 1, dz: 0 } },
  { id: "west", he: "חזית מערבית", axis: "z" as const, cam: { dx: -1, dz: 0 } },
];
for (const fc of FACADES) {
  const e = elevs[fc.id]!;
  const EH = Math.round((W * (e.v1 - e.v0)) / (e.u1 - e.u0));
  const mid = (e.u0 + e.u1) / 2, vm = (e.v0 + e.v1) / 2;
  const cx = (BODY.x0 + BODY.x1) / 2, cz = (BODY.z0 + BODY.z1) / 2, far = 90;
  const pos = fc.axis === "x" ? { x: mid, y: vm, z: cz + fc.cam.dz * far } : { x: cx + fc.cam.dx * far, y: vm, z: mid };
  const target = fc.axis === "x" ? { x: mid, y: vm, z: cz } : { x: cx, y: vm, z: mid };
  const lit = await frame({ camera: { position: pos, target, fovDeg: 20, orthoHalfWidth: (e.u1 - e.u0) / 2, hideTags: ["site"], clearGlass: true, studio: true }, width: W, height: EH, sun: { azimuthDeg: fc.id === "south" ? 235 : fc.id === "north" ? 55 : fc.id === "east" ? 125 : 305, elevationDeg: 60 }, exposure: 1.1, ao: false });
  // The studio's pale backdrop becomes the page's white: pixels of the corner's colour are painted out.
  const raw = await sharp(lit).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = raw.info.channels, d0 = raw.data, bg = [d0[0]!, d0[1]!, d0[2]!];
  for (let i = 0; i < d0.length; i += ch) if (Math.abs(d0[i]! - bg[0]!) < 9 && Math.abs(d0[i + 1]! - bg[1]!) < 9 && Math.abs(d0[i + 2]! - bg[2]!) < 9) { d0[i] = 255; d0[i + 1] = 255; d0[i + 2] = 255; }
  const shot = await sharp(d0, { raw: { width: raw.info.width, height: raw.info.height, channels: ch } }).jpeg({ quality: 92 }).toBuffer();
  const sx = (u: number) => ((e.rightIsPlus ? u - e.u0 : e.u1 - u) * (W / (e.u1 - e.u0))).toFixed(1);
  const sy = (v: number) => ((e.v1 - v) * (EH / (e.v1 - e.v0))).toFixed(1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${EH}"><rect width="100%" height="100%" fill="#fff"/>`;
  for (const ln of e.lines) svg += `<polyline fill="none" stroke="#111" stroke-width="1.2" points="${ln.map(([u, v]) => `${sx(u)},${sy(v)}`).join(" ")}"/>`;
  svg += "</svg>";
  sheets.push({ no: ++no, title: fc.he, caption: `${fc.he}, קנה מידה אחיד. חיפוי אבן; הצללת בטון בראש הקומות; מסך לוורים בגג.`, sheet: await jpeg(await sharp(Buffer.from(svg)).png().toBuffer()), render: await jpeg(shot) });
  say(`elevation ${fc.id}`);
}

// ---- Views from outside.
const cxB = (BODY.x0 + BODY.x1) / 2, czB = (BODY.z0 + BODY.z1) / 2;
const TRACE = Number(process.env.TRACE ?? 0);
/** GOLDEN=1: the golden hour — a low warm sun on the views (the lamps and the interior lights are on). */
const GOLDEN = process.env.GOLDEN === "1";
/** Each view's raw render is kept in <out>/plates/<id>-raw.jpg and reused on the next run; with USE_FLUX=1 a <id>-flux.jpg beside it (the local FLUX pass) is what the booklet shows. */
const platesDir = path.join(outDir, "plates");
fs.mkdirSync(platesDir, { recursive: true });
const USE_FLUX = process.env.USE_FLUX === "1";
const fromFile = async (file: string): Promise<BookletImage> => jpeg(fs.readFileSync(file), 4000);
const cached = async (id: string, make: () => Promise<BookletImage>): Promise<BookletImage> => {
  const raw = path.join(platesDir, `${id}-raw.jpg`), flux = path.join(platesDir, `${id}-flux.jpg`);
  if (!fs.existsSync(raw)) {
    const img = await make();
    fs.writeFileSync(raw, Buffer.from(img.base64, "base64"));
  }
  return USE_FLUX && fs.existsSync(flux) ? fromFile(flux) : fromFile(raw);
};
const persp = async (position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, az: number, el: number, fov = 38, extra: Partial<Payload["camera"]> = {}) =>
  jpeg(await frame({ camera: { position, target, fovDeg: fov, clearGlass: true, ...extra }, width: 2400, height: 1500, sun: { azimuthDeg: az, elevationDeg: GOLDEN ? 11 : el }, exposure: GOLDEN ? 0.8 : 0.66, ao: true, ...(TRACE ? { pathTrace: { samples: TRACE } } : {}) }));
const exterior: Array<[string, string, () => Promise<BookletImage>]> = [
  ["מבט מדרום-מזרח", "מהרחוב ומהכניסה הראשית", () => persp({ x: cxB + 46, y: 7, z: czB + 46 }, { x: cxB, y: 7.5, z: czB }, 140, 38)],
  ["מבט מצפון-מערב", "האגפים הצפוניים והחצר הפתוחה למערב", () => persp({ x: cxB - 46, y: 7, z: czB - 46 }, { x: cxB, y: 7.5, z: czB }, 230, 38)],
  ["מבט מדרום-מערב", "החצר שבין האגפים", () => persp({ x: cxB - 46, y: 7, z: czB + 46 }, { x: cxB, y: 7.5, z: czB }, 230, 38)],
  ["מבט מצפון-מזרח", "החזית המזרחית ואולם הזיגוג", () => persp({ x: cxB + 46, y: 7, z: czB - 46 }, { x: cxB, y: 7.5, z: czB }, 140, 38)],
  ["מבט ישר מדרום", "הבניין מול חזיתו הדרומית, בגובה אמצע הבניין", () => persp({ x: cxB + 6, y: 7, z: czB + 72 }, { x: cxB, y: 7.5, z: czB }, 190, 40, 36)],
  ["מבט מהחצר", "החצר שבין אגף הצפון לאגף הדרום, מול החזיתות הפנימיות", () => persp({ x: BODY.x0 - 4, y: 1.7, z: czB }, { x: BODY.x0 + 24, y: 6, z: czB }, 220, 36, 62)],
  ["הלובי והכניסה הראשית מקרוב", "הקיר המעוגל המזוגג של הלובי בפינה הדרומית-מזרחית", () => persp({ x: BODY.x1 + 17, y: 6, z: BODY.z1 + 20 }, { x: 47, y: 6, z: 56 }, 140, 40, 42)],
  ["מבט אל הכניסה הראשית", "הכניסה הראשית והלובי בפינה הדרומית-מזרחית", () => persp({ x: BODY.x1 + 10, y: 1.7, z: BODY.z1 + 7 }, { x: BODY.x1 - 5, y: 3.5, z: BODY.z1 - 7 }, 130, 36, 62)],
];
for (const [i, [title, caption, fn]] of exterior.entries()) {
  plates.push({ kicker: `מבחוץ · ${title}`, title, caption, image: await cached(`ext-${i + 1}`, fn) });
  say(`exterior ${title}`);
}

// ---- Views from inside: in rooms the plans name, the camera put where the most of the room's furniture stands in clear view.
const inRects = (rects: Array<{ x: number; y: number; w: number; h: number }>, x: number, y: number) => rects.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
type PlanRoomRow = PlanData["rooms"][number];
function pickCamera(pd: PlanData, roomFull: PlanRoomRow) {
  // The room as the sheet prints it: cells nearest its label up to its printed area, not the whole open region the label stands in.
  const budget = roomFull.printed ? roomFull.printed * 1.1 : roomFull.areaM2;
  const near = [...roomFull.rects].sort((a, c) => Math.hypot(a.x + a.w / 2 - roomFull.x, a.y + a.h / 2 - roomFull.y) - Math.hypot(c.x + c.w / 2 - roomFull.x, c.y + c.h / 2 - roomFull.y));
  const kept: typeof roomFull.rects = [];
  // The 10 cm bands overlap (each is 10 cm tall on a 2 cm step): their sum is a multiple of the room's area.
  const sum = roomFull.rects.reduce((a, q) => a + q.w * q.h, 0) || 1;
  const k2 = roomFull.areaM2 / sum;
  let acc = 0;
  for (const q of near) { kept.push(q); acc += q.w * q.h * k2; if (acc >= budget) break; }
  const room = { ...roomFull, rects: kept };
  const xs = room.rects.flatMap((q) => [q.x, q.x + q.w]), ys = room.rects.flatMap((q) => [q.y, q.y + q.h]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const mine = pd.items.filter((it) => it.kind !== "tower" && inRects(room.rects, it.x, it.y));
  const clear = (x: number, y: number, r = 0.85) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => inRects(room.rects, x + dx!, y + dy!));
  let best: { pos: [number, number]; dir: [number, number]; score: number } | null = null;
  for (let fx = 0.1; fx <= 0.9; fx += 0.1) for (let fy = 0.1; fy <= 0.9; fy += 0.1) {
    const cx = x0 + (x1 - x0) * fx, cy = y0 + (y1 - y0) * fy;
    if (!clear(cx, cy)) continue;
    // Never stand in a doorway or against a door leaf: a door filling the frame is no view.
    if (pd.openings.some((o) => o.kind === "doorway" || o.door ? Math.hypot(Math.max(o.x - cx, 0, cx - (o.x + o.w)), Math.max(o.y - cy, 0, cy - (o.y + o.h))) < 1.3 : false)) continue;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const d: [number, number] = [Math.cos(ang), Math.sin(ang)];
      // Sight: the first 3 m ahead must lie inside the room.
      let los = 0;
      for (let t = 0.5; t <= 3.5; t += 0.5) if (inRects(room.rects, cx + d[0] * t, cy + d[1] * t)) los++;
      if (los < 6) continue;
      let score = los;
      let seen = 0;
      // A room looks like a room with its daylight: windows in the view count for more than any furniture.
      for (const o of pd.openings) {
        if (!o.exterior || o.kind === "doorway") continue;
        const vx = o.x + o.w / 2 - cx, vy = o.y + o.h / 2 - cy, dist = Math.hypot(vx, vy);
        if (dist < 1.2 || dist > 14) continue;
        if (!inRects(room.rects, o.x + o.w / 2 - Math.sign(vx) * 0.4 * (o.o === "v" ? 1 : 0), o.y + o.h / 2 - Math.sign(vy) * 0.4 * (o.o === "h" ? 1 : 0))) continue;
        if ((vx * d[0] + vy * d[1]) / dist > 0.72) score += 4;
      }
      for (const it of mine) {
        const vx = it.x - cx, vy = it.y - cy, dist = Math.hypot(vx, vy);
        if (dist < 1.2 || dist > 12) continue;
        const cos = (vx * d[0] + vy * d[1]) / dist;
        if (cos > 0.78) { score += it.kind === "chair" ? 0.5 : it.kind === "table" || it.kind === "teacherDesk" || it.kind === "desk" ? 3 : 1; seen++; }
      }
      if (mine.length >= 6 && seen < 4) continue;
      if (!best || score > best.score) best = { pos: [cx, cy], dir: d, score };
    }
  }
  return { best, x0, x1, y0, y1 };
}
const roomsOf = (floor: string, re: RegExp, min = 12) => plans[floor]!.rooms.filter((r) => re.test(r.name) && r.areaM2 >= min && (r.printed ? r.areaM2 <= r.printed * 1.5 : r.areaM2 <= 80)).sort((a, b) => b.areaM2 - a.areaM2)[0];
const interiors: Array<[string, string, PlanRoomRow | undefined]> = [
  ["כיתה", "floor-1", roomsOf("floor-1", /כיתה/, 25)],
  ["כיתה בקומה ג'", "floor-3", roomsOf("floor-3", /כיתה/, 25)],
  ["מעבדת טכנולוגיה", "floor-1", roomsOf("floor-1", /טכנולוגיה/, 20)],
  ["ספרייה", "floor-2", roomsOf("floor-2", /ספריה/, 20)],
  ["חדר מורים", "floor-2", roomsOf("floor-2", /מורים/, 20)],
  ["אולם רב תכליתי", "floor-3", roomsOf("floor-3", /אולם/, 60)],
  ["חדר מנהל", "floor-2", roomsOf("floor-2", /מנהל/, 10)],
  ["חדר קלינאית תקשורת", "floor-0", roomsOf("floor-0", /קלינאית/, 12)],
];
for (const [ii, [title, floor, room]] of interiors.entries()) {
  if (!room) { say(`interior ${title}: no room`); continue; }
  const pd = plans[floor]!;
  const { best, x0, x1, y0, y1 } = pickCamera(pd, room);
  if (!best) { say(`interior ${title}: no clear camera`); continue; }
  const ceiling = pd.level + 3.0;
  const pos = { x: best.pos[0], y: pd.level + 1.55, z: best.pos[1] };
  const target = { x: best.pos[0] + best.dir[0] * 5, y: pd.level + 1.2, z: best.pos[1] + best.dir[1] * 5 };
  const image = await cached(`int-${ii + 1}`, async () => jpeg(await frame({
    camera: { position: pos, target, fovDeg: 78, interior: true, clearGlass: true, hideTags: ["site", "roof"], room: { x0, x1, z0: y0, z1: y1, floorY: pd.level, ceilingY: ceiling } },
    width: 2400, height: 1500, sun: { azimuthDeg: GOLDEN ? 250 : 160, elevationDeg: GOLDEN ? 14 : 50 }, exposure: 0.62, ao: true, ...(TRACE ? { pathTrace: { samples: TRACE } } : {}),
  })));
  plates.push({ kicker: `מבפנים · ${title}`, title, caption: `${room.name.replace(/q/g, " ")}, ${FLOORS.find((f) => f.id === floor)?.label ?? ""}, ${room.printed ?? Math.round(room.areaM2)} מ"ר, עם הריהוט שלו.`, image });
  say(`interior ${title} (score ${best.score.toFixed(1)}) camera ${floor} at (${best.pos[0].toFixed(2)}, ${best.pos[1].toFixed(2)}) looking (${best.dir[0].toFixed(2)}, ${best.dir[1].toFixed(2)}), room ${room.name} x ${x0.toFixed(1)}–${x1.toFixed(1)} z ${y0.toFixed(1)}–${y1.toFixed(1)}`);
}

// ---- The booklet.
const levelCount = (id: string) => rooms.filter((r) => r.floor === id).length;
const html = buildBuildingBookletHtml({
  projectName: 'בי"ס וולף — תיכון חינוך מיוחד',
  subtitle: "בני ברק · תוספת שתי קומות מעל מבנה בן שתי קומות",
  architect: "לפי קובצי התוכניות (DXF) והחזיתות שהתקבלו",
  hero: plates[0]!.image,
  kpis: [
    { label: "קומות", value: "2 קיימות + 2 חדשות + גג טכני" },
    { label: "גוף הבניין", value: "38.30 × 48.35 מ'" },
    { label: "גובה קומה", value: "3.36 מ'" },
    { label: "מעקה", value: "+13.94" },
    { label: "חדרים בתוכניות", value: String(rooms.length) },
  ],
  paragraphs: [
    "מבנה בית ספר בן שתי קומות קיימות (קרקע וקומה א') ותוספת של שתי קומות (ב' ו-ג') וגג טכני. הבניין בנוי משני אגפי כיתות סביב חצר פתוחה למערב, מסדרון קישור בציר המזרחי, ובפינה הדרום-מזרחית לובי הכניסה וחדרי ההנהלה; בקומה ג' אולם רב תכליתי.",
    "כל התמונות בחוברת נבנו ממודל תלת-ממדי שנבנה מקובצי ה-DXF של התוכניות והחזיתות: הקירות, החלונות, הדלתות, שמות החדרים והשטחים המודפסים, וחיפוי האבן לפי החזיתות. לצד כל הדמיה מופיע השרטוט עצמו באותה מסגרת ועמוד השוואה.",
    "מה לא נכלל: גבול המגרש, חומת הבטון, השער, המדרכה ושיפוע הקרקע (קובצי האתר שבתוכניות ריקים), וריהוט שלא סומן בשרטוטים. גובה סנפירי ההצללה וחלק מהחלונות בחזיתות הם הנחה לפי השרטוט.",
  ],
  // The cover's table: the largest named rooms of each floor, so every storey shows.
  rooms: FLOORS.flatMap((f, i) => {
    const mine = plans[f.id]!.rooms.filter((r) => r.areaM2 >= 12 && !/מעלית|ת"י/.test(r.name)).map((r) => ({ name: r.name.replace(/q/g, " ").replace(/^חדר\s+/, "חדר "), floor: f.label, area: `${shownArea(r)} מ"ר`, a: shownArea(r) }));
    const seen = new Set<string>();
    return mine.sort((p1, p2) => p2.a - p1.a).filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true))).slice(0, i < 2 ? 3 : 2).map(({ name, floor, area }) => ({ name, floor, area }));
  }),
  sheets,
  plates,
});
fs.writeFileSync(path.join(outDir, "booklet.html"), html);
say(`html: ${sheets.length} sheets × 3 + ${plates.length} plates + cover`);
void levelCount;
if (!flags.includes("--no-pdf")) {
  const pdf = await renderHtmlSectionsPdf(html, { waitForImages: true, timeoutMs: 600_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 });
  fs.writeFileSync(path.join(outDir, "booklet.pdf"), pdf);
  say(`pdf: ${path.join(outDir, "booklet.pdf")}`);
}
process.exit(0);
