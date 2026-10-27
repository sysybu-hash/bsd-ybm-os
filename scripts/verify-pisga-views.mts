#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the model's elevations and sections drawn in the DXF's own
 * frames, the drawing laid over each render, for the eye; and the numbers
 * the overlay can't say: each drawing's windows against the model's.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-views.mts "<drawing.dxf>" <out dir> [view…]
 *
 * A drawing's levels come from its own marks ("+8.29", "+12.77"…), at 100
 * units a metre; its horizontal place from where its building mass stands.
 * Free: nothing here calls an image model.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { readDxfDrawing, flattenDxf, entitiesWithin } = await import("@/lib/projects/dxf-drawing");
const { buildPisga, readPisgaDxfFloor, LABELS_MINUS1, LABELS_MINUS2, OUTLINE_MINUS1, OUTLINE_MINUS2, LEVEL } = await import("@/lib/projects/building/pisga");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
type Payload = import("@/lib/projects/building/render-page").BuildingRenderPayload;

const [file, outDir, ...only] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <drawing.dxf> <out dir> [view…]");
fs.mkdirSync(outDir, { recursive: true });
const dxf = readDxfDrawing(fs.readFileSync(file));
if (!dxf) throw new Error("unreadable DXF");
const model = await buildPisga(null, { dxf });
const allPieces = flattenDxf(dxf);

type View = {
  id: string;
  /** Looking from this side: the image's right is +x from the south, −x from the north, +z from the west, −z from the east. */
  from: "n" | "s" | "e" | "w";
  /** The model's range across the image, metres in the plan frame. */
  span: [number, number];
  /** The levels the image shows. */
  levels: [number, number];
  /** The drawing's pieces: a box in drawing units. */
  box: { x0: number; x1: number; y0: number; y1: number };
  /** The drawing's +8.29 line: its y. */
  base: number;
  /** The plan coordinate along the image of the drawing's x = 0: plan = (±x/100) + offset, the sign by the side. */
  offset: number;
  section?: { axis: "x" | "z"; at: number; keep: 1 | -1 };
  hide?: string[];
  /** A section: the room seen inside, the windows not compared. */
  cut?: boolean;
};

const NO_SITE = ["car", "tree"];
const VIEWS: View[] = [
  { id: "south", from: "s", span: [-3, 58], levels: [6.5, 21.5], box: { x0: 152000, x1: 158800, y0: 641900, y1: 643700 }, base: 642064, offset: -1526.09, hide: [...NO_SITE, "site:retaining", "site:entrance", "site:sidewalk", "site:street", "site:stair", "site:crossing", "site:lane"], section: { axis: "z", at: 20.9, keep: -1 } },
  { id: "east", from: "e", span: [-3, 25], levels: [4, 22], box: { x0: 147300, x1: 152500, y0: 644700, y1: 646600 }, base: 645113, offset: 1501.48, hide: NO_SITE, section: { axis: "x", at: 57.2, keep: -1 } },
  { id: "west", from: "w", span: [-3, 25], levels: [4, 22], box: { x0: 147300, x1: 152500, y0: 642300, y1: 644300 }, base: 642521, offset: -1484.23, hide: NO_SITE, section: { axis: "x", at: -1.5, keep: 1 } },
];

VIEWS.push(
  { id: "section-aa", from: "s", span: [-3, 58], levels: [-1, 21.5], box: { x0: 162800, x1: 169500, y0: 644500, y1: 646800 }, base: 645590, offset: -1630.91, hide: NO_SITE, section: { axis: "z", at: 6.3, keep: -1 }, cut: true },
  { id: "section-cc", from: "e", span: [-3, 25], levels: [3, 21], box: { x0: 162800, x1: 166400, y0: 641900, y1: 644300 }, base: 642573, offset: 1641.8, hide: NO_SITE, section: { axis: "x", at: 31.9, keep: -1 }, cut: true },
  { id: "section-bb", from: "w", span: [-3, 25], levels: [3, 21], box: { x0: 166500, x1: 171800, y0: 641900, y1: 644300 }, base: 642552, offset: -1673.65, hide: NO_SITE, section: { axis: "x", at: 49.3, keep: 1 }, cut: true },
  { id: "section-dd", from: "e", span: [-3, 25], levels: [3, 21], box: { x0: 171800, x1: 176000, y0: 641900, y1: 644300 }, base: 642475, offset: 1729.7, hide: NO_SITE, section: { axis: "x", at: 27.4, keep: -1 }, cut: true },
);
const chosen = VIEWS.filter((v) => only.length === 0 || only.includes(v.id));
const W = 2400;
const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

for (const v of chosen) {
  const [u0, u1] = v.span;
  const [l0, l1] = v.levels;
  const H = Math.round((W * (l1 - l0)) / (u1 - u0));
  const k = W / (u1 - u0);
  const ym = (l0 + l1) / 2;
  const um = (u0 + u1) / 2;
  const d = 300;
  const at = v.from === "n" ? { x: um, z: -d } : v.from === "s" ? { x: um, z: d } : v.from === "e" ? { x: d, z: um } : { x: -d, z: um };
  const target = v.from === "n" || v.from === "s" ? { x: um, y: ym, z: 0 } : { x: 0, y: ym, z: um };
  const payload: Payload = {
    model,
    camera: { position: { x: at.x, y: ym, z: at.z }, target, fovDeg: 30, orthoHalfWidth: (u1 - u0) / 2, ...(v.section ? { section: v.section, interior: v.cut === true } : {}), hideTags: v.hide },
    width: W,
    height: H,
    sun: { azimuthDeg: v.from === "s" ? 180 : v.from === "e" ? 110 : v.from === "w" ? 250 : 300, elevationDeg: 35 },
    exposure: 0.64,
    ao: true,
  };
  const [shot] = await renderBuildingFrames([payload], { outputWidthPx: 99999 });
  // The whole drawing, not the entities anchored in the box: the imported kindergarten sections are blocks anchored far away.
  const pieces = allPieces.filter((p) => { const q = p.pts?.[0] ?? p.arc?.c; return q && q.x >= v.box.x0 && q.x <= v.box.x1 && q.y >= v.box.y0 && q.y <= v.box.y1; });
  // The plan coordinate of a drawing x: the image runs +x to the right from the south, −x from the north, +z from the west, −z from the east.
  const plan = (x: number) => (v.from === "s" || v.from === "w" ? x / 100 + v.offset : v.offset - x / 100);
  const px = (x: number) => (v.from === "s" || v.from === "w" ? (plan(x) - u0) * k : (u1 - plan(x)) * k).toFixed(1);
  const py = (y: number) => ((l1 - ((y - v.base) / 100 + 8.29)) * k).toFixed(1);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (const p of pieces) {
    if (!p.pts || p.pts.length < 2 || /^(מידה|טקסט|0$)/.test(p.layer)) continue;
    if (p.pts.some((q) => q.x < v.box.x0 || q.x > v.box.x1 || q.y < v.box.y0 || q.y > v.box.y1)) continue;
    const colour = /^חלון/.test(p.layer) ? "#0050ff" : /^(קיר|אדום)/.test(p.layer) ? "#e00000" : "#777777";
    svg += `<polyline fill="none" stroke="${colour}" stroke-width="1.2" points="${p.pts.map((q) => `${px(q.x)},${py(q.y)}`).join(" ")}"/>`;
  }
  svg += "</svg>";
  // The drawing's windows against the model's openings on this side, by floor: the centre along the image, and the sizes.
  if (!v.cut) {
    type B = { x0: number; x1: number; y0: number; y1: number };
    const parts: B[] = [];
    for (const p of pieces) {
      if (!/^חלון/.test(p.layer)) continue;
      const pts = [...(p.pts ?? []), ...(p.arc ? [p.arc.c] : [])];
      if (pts.length && pts.every((q) => q.x >= v.box.x0 && q.x <= v.box.x1 && q.y >= v.box.y0 && q.y <= v.box.y1)) parts.push({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) });
    }
    const parent = parts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!;
      const b = parts[j]!;
      if (a.x0 - 25 <= b.x1 && b.x0 - 25 <= a.x1 && a.y0 - 25 <= b.y1 && b.y0 - 25 <= a.y1) parent[find(i)] = find(j);
    }
    const groups = new Map<number, B>();
    parts.forEach((p, i) => {
      const c = groups.get(find(i));
      if (!c) groups.set(find(i), { ...p });
      else { c.x0 = Math.min(c.x0, p.x0); c.x1 = Math.max(c.x1, p.x1); c.y0 = Math.min(c.y0, p.y0); c.y1 = Math.max(c.y1, p.y1); }
    });
    const drawn = [...groups.values()].filter((w) => w.x1 - w.x0 > 60 && w.y1 - w.y0 > 60);
    for (const [id, level, labels, outline] of [["floor-2", LEVEL.floorMinus2, LABELS_MINUS2, OUTLINE_MINUS2], ["floor-1", LEVEL.floorMinus1, LABELS_MINUS1, OUTLINE_MINUS1]] as const) {
      const { openings } = readPisgaDxfFloor(dxf, id, labels as never, outline as never);
      const side = openings.filter((o) => o.exterior && (v.from === "s" ? o.orientation === "h" && o.outward === 1 : v.from === "n" ? o.orientation === "h" && o.outward === -1 : v.from === "e" ? o.orientation === "v" && o.outward === 1 : o.orientation === "v" && o.outward === -1));
      // A window along the image: x range for the south and north, z for east and west.
      const modelAt = side.map((o) => (v.from === "s" || v.from === "n" ? [o.x, o.x + o.w] : [o.y, o.y + o.h]) as [number, number]);
      const here = drawn.filter((w) => { const lv = (w.y0 - v.base) / 100 + 8.29; return lv > level - 0.3 && lv < level + 2.2; });
      const drawnAt = here.map((w) => { const a = plan(w.x0); const b = plan(w.x1); return { a: Math.min(a, b), b: Math.max(a, b), lv0: (w.y0 - v.base) / 100 + 8.29 - level, lv1: (w.y1 - v.base) / 100 + 8.29 - level }; });
      const unmatched = drawnAt.filter((d) => !modelAt.some(([a, b]) => Math.abs((a + b) / 2 - (d.a + d.b) / 2) < 0.35));
      const extra = modelAt.filter(([a, b]) => !drawnAt.some((d) => Math.abs((a + b) / 2 - (d.a + d.b) / 2) < 0.35));
      say(`${v.id} ${id}: בשרטוט ${drawnAt.length} חלונות, במודל ${modelAt.length} פתחים בצד הזה; בשרטוט בלי פתח במודל: ${unmatched.length}; פתח מודל בלי חלון בשרטוט: ${extra.length}`);
      for (const d of unmatched) say(`  - חסר במודל: ${d.a.toFixed(2)}..${d.b.toFixed(2)} (${(d.b - d.a).toFixed(2)} מ'), גובה ${d.lv0.toFixed(2)}..${d.lv1.toFixed(2)} מעל הרצפה`);
      for (const [a, b] of extra) say(`  - מודל בלי שרטוט: ${a.toFixed(2)}..${b.toFixed(2)} (${(b - a).toFixed(2)} מ')`);
      const matched = drawnAt.filter((d) => !unmatched.includes(d));
      for (const d of matched.slice(0, 4)) { const m = modelAt.find(([a, b]) => Math.abs((a + b) / 2 - (d.a + d.b) / 2) < 0.35)!; say(`  · שרטוט ${d.a.toFixed(2)}..${d.b.toFixed(2)} מול מודל ${m[0].toFixed(2)}..${m[1].toFixed(2)}`); }
    }
  }
  const out = path.join(outDir, `view-${v.id}.jpg`);
  await sharp(shot!).resize(W, H).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toFile(out);
  say(`${v.id}: ${out}`);
}
fs.writeFileSync(path.join(outDir, "views-report.md"), lines.join("\n"));
process.exit(0);
