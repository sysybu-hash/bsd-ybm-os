// Breuer 21 at the golden hour, from the street as the architect's own render stands: eye height across the south street,
// looking up at the building's south face with one side just in view — once from the south-east, once mirrored from the
// south-west. The flats are lived in: most windows glow warm, some dimmer, some dark. Free (raster), no paid call.
// npx tsx --conditions=react-server scripts/_breuer/golden.mts <model-dir> <out-dir> [ids] [widthPx]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";

delete process.env.ALLOW_PAID_AI;
const [dir, out, idsArg, widthArg] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: golden.mts <model-dir> <out-dir> [ids] [widthPx]"); process.exit(2); }
const model = JSON.parse(readFileSync(path.join(dir, "model.json"), "utf8"));
const state = JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));

// Lived-in windows: a fixed hash of each pane's place decides lit / dim / dark, so every run lights the same rooms.
const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
type Prism = { type: string; material: string; tag?: string; ring?: number[][]; y0?: number; y1?: number };
const ext0 = model.extent as { x: number; z: number; width: number; depth: number };
const bx = ext0.x + ext0.width / 2, bz = ext0.z + ext0.depth / 2;
let lit = 0, dim = 0, dark = 0;
const glows: Prism[] = [];
const prims = model.primitives.map((p: Prism) => {
  if (p.type !== "prism" || p.material !== "glass" || !/^pane:/.test(p.tag ?? "") || !p.ring || p.ring.length < 3) return p;
  const xs = p.ring.map((q) => q[0]!), zs = p.ring.map((q) => q[1]!);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, mz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const r = hash(Math.round(mx * 2), Math.round((p.y0 ?? 0) / 3.15), Math.round(mz * 2));
  if (r >= 0.62) { dark++; return p; }
  const strong = r < 0.42;
  strong ? lit++ : dim++;
  // the room behind it: a lit back 0.9 m in from the glass, a little inset, the window's own height
  const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs);
  const half = (alongX ? Math.max(...xs) - Math.min(...xs) : Math.max(...zs) - Math.min(...zs)) / 2 - 0.04;
  const inward = alongX ? Math.sign(bz - mz) || 1 : Math.sign(bx - mx) || 1;
  // a slab across the window's line, from a0 to a1 along it, d to d+t in from the glass
  const slab = (a0: number, a1: number, d: number, t: number) => alongX
    ? [[mx + a0, mz + inward * d], [mx + a1, mz + inward * d], [mx + a1, mz + inward * (d + t)], [mx + a0, mz + inward * (d + t)]]
    : [[mx + inward * d, mz + a0], [mx + inward * (d + t), mz + a0], [mx + inward * (d + t), mz + a1], [mx + inward * d, mz + a1]];
  const y0 = (p.y0 ?? 0) + 0.02, y1 = (p.y1 ?? 0) - 0.02, ym = y0 + 0.4 * (y1 - y0);
  // the room's back wall: lit warm above, dimmer below where the furniture stands
  glows.push({ type: "prism", ring: slab(-half, half, 1.6, 0.04), y0: ym, y1, material: strong ? "roomGlow" : "roomGlowDim", tag: `room-glow:${p.tag}` });
  glows.push({ type: "prism", ring: slab(-half, half, 1.6, 0.04), y0, y1: ym, material: "roomGlowDim", tag: `room-glow:${p.tag}` });
  // a drawn curtain to one side, 12 cm in from the glass, a quarter of the window wide (most rooms have one)
  const r2 = hash(mx * 3.1, (p.y0 ?? 0) * 1.7, mz * 2.3);
  if (r2 < 0.75 && half > 0.35) { const w = Math.min(0.6, half * 0.5), s = r2 < 0.38 ? -1 : 1;
    glows.push({ type: "prism", ring: slab(s > 0 ? half - w : -half, s > 0 ? half : -half + w, 0.12, 0.03), y0, y1, material: "linen", tag: `curtain:${p.tag}` }); }
  return { ...p, material: "glassWarm" };
});
console.log(`windows: ${lit} lit, ${dim} dim, ${dark} dark (of ${lit + dim + dark} panes)`);
const goldenModel = { ...model, primitives: [...prims, ...glows], palette: { ...(model.palette ?? {}), golden: true } };

const base = dwfBuildingViews(
  { floors: state.floors, model: { extent: model.extent, primitives: model.primitives } },
  undefined, {}, { house: false, public: true },
).find((v) => v.id === "hero")!;
const e = model.extent as { x: number; z: number; width: number; depth: number };
const cx = e.x + e.width / 2, south = e.z + e.depth, cz = e.z + e.depth / 2;
// The architect's frame: across the street, 28 m out from the south face, 12 m off the centre, the eye 1.7 m over the
// street (≈ −1.5 against ±0.00 = +28.45), looking up at the body.
// The camera looks level and a shift lens lifts the frame, so the tower's verticals stay upright as in the architect's render.
// The streets are the ones the ground tab names on the plot line (report.streets, built by build.mts): for each, two frames
// from across it, 32 m out from the plot edge and 10 m to either side of its middle, the eye 1.7 m over that street's road.
type St = { name: string; edge: number[][] };
const report = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8")) as { streets?: St[] };
const SLUG: Record<string, string> = { "ברויאר": "breuer", "תורה ועבודה": "torah" };
const roadY = (name: string) => { const ys = model.primitives.filter((p: { tag?: string; material: string; y1?: number }) => p.tag === `street:${name}` && p.material === "asphalt").map((p: { y1: number }) => p.y1); return ys.length ? ys.reduce((a: number, b: number) => a + b, 0) / ys.length : 0; };
const streetViews = (report.streets ?? []).flatMap((s) => {
  const [a, b] = s.edge as [[number, number], [number, number]];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n = [-u[1]!, u[0]!]; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  if ((cx - mx) * n[0]! + (cz - mz) * n[1]! > 0) n = [-n[0]!, -n[1]!];
  const y = roadY(s.name) + 1.7, OUT = Number(process.env.OUT ?? 32);
  // SIDE: how far (m) each frame stands to the side of the street's middle — per view, e.g. {"street-torah-b":4} (a smaller
  // offset looks more square on the face; the user found torah-b at 10 m "crooked")
  const SIDE: Record<string, number> = process.env.SIDE ? JSON.parse(process.env.SIDE) : {};
  return ([1, -1] as const).map((side, i) => { const id = `street-${SLUG[s.name] ?? s.name}-${i ? "b" : "a"}`, off = SIDE[id] ?? 10; return {
    id,
    camera: {
      position: { x: mx + n[0]! * OUT + u[0]! * side * off, y, z: mz + n[1]! * OUT + u[1]! * side * off },
      target: { x: cx - u[0]! * side * off * 0.2, y, z: cz - u[1]! * side * off * 0.2 },
      fovDeg: 56, shiftY: Number(process.env.SHIFT ?? 0.33),
    },
    // a summer evening: the south street lit from the south-west, the north street (backlit at 238°) from the north-west
    sun: { azimuthDeg: Number(process.env.SUNAZ ?? (SLUG[s.name] === "torah" ? 295 : 238)), elevationDeg: 12 },
  }; });
});
void south;
const views = [
  ...streetViews,
  // DOLLY: the hero's camera moved back along its line of sight by this factor (a zoom out that keeps the angle)
  { id: "golden-hero", camera: (() => { const c = base.payload.camera as { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }, k = Number(process.env.DOLLY ?? 1);
    return { ...base.payload.camera, position: { x: c.target.x + (c.position.x - c.target.x) * k, y: c.target.y + (c.position.y - c.target.y) * k, z: c.target.z + (c.position.z - c.target.z) * k } }; })(), sun: { azimuthDeg: Number(process.env.SUNAZ ?? 238), elevationDeg: 12 } },
].filter((v) => !idsArg || idsArg.split(",").includes(v.id));
// soft sun: a pale warm light, not the full amber
const sunLight = { color: 0xffead2, intensity: Number(process.env.SUN ?? 2.1) };
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const w = widthArg ? Number(widthArg) : 1600;
const frames = await renderBuildingFrames(
  views.map((v) => ({ ...base.payload, camera: v.camera, sun: v.sun, sunLight, width: v.id === "golden-hero" ? 1600 : 2400, height: v.id === "golden-hero" ? 2000 : 1580, exposure: Number(process.env.EXPO ?? 0.58), ...(process.env.OVERRIDE ? JSON.parse(process.env.OVERRIDE) : {}), model: goldenModel })),
  { outputWidthPx: w },
);
views.forEach((v, i) => writeFileSync(path.join(out, `${v.id}.jpg`), frames[i]!));
console.log(`${views.map((v) => v.id).join(", ")} → ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
