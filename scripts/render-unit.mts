/**
 * One numbered flat out of a whole-floor DXF, measured and photographed.
 *
 * npx tsx --conditions=react-server scripts/render-unit.mts --dxf <file> --unit 14 --out <dir> [--engine raster|cycles] [--samples 64] [--width 1280]
 *
 * Writes into <dir>: page.jpg (the flat's own page), plan.jpg (the measured
 * plate), model.json (the scene), and one JPEG per view — the dollhouse, the
 * living room, the largest bedroom. Raster is Chromium (free, seconds);
 * cycles is Blender on this machine (BLENDER_BIN).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { config } from "dotenv";

config({ path: ".env.local" });

const { values } = parseArgs({
  options: {
    dxf: { type: "string" },
    unit: { type: "string" },
    out: { type: "string" },
    engine: { type: "string", default: "raster" },
    samples: { type: "string", default: "64" },
    width: { type: "string", default: "1280" },
    views: { type: "string", default: "dollhouse,living,kitchen,bedroom,balcony" },
    style: { type: "string", default: "haredi_classic" },
    // Premium dark: espresso joinery, smoked oak, dark stone, brass — the client's brief (03/11/2026).
    look: { type: "string", default: "premium-dark" },
    // "town": a procedural town outside the windows; by default a sunset sky alone.
    view: { type: "string", default: "sky" },
    golden: { type: "boolean", default: true },
    // How far the top-view camera stands back: 1 fits the flat tight; the client wants a margin of background (04/11/2026).
    frame: { type: "string", default: "1.2" },
  },
});
if (!values.dxf || !values.unit || !values.out) {
  console.error("usage: --dxf <file> --unit <n> --out <dir>");
  process.exit(1);
}
const outDir = path.resolve(values.out);
mkdirSync(path.join(outDir, "attempts"), { recursive: true });
const number = Number(values.unit);
const width = Number(values.width);
const height = Math.round((width * 10) / 16);

const { unitGeometryFromDxf, renderDxfPageJpeg, DXF_PAGE_UNITS_PER_METRE } = await import("@/lib/projects/floorplan-dxf");
const { readDxfDrawing } = await import("@/lib/projects/dxf-drawing");
const { unitByDoors, isUnitFailure } = await import("@/lib/projects/dxf-unit-by-doors");
const { unitSceneInput } = await import("@/lib/projects/dxf-unit-scene");
const { FLOORPLAN_VIZ_PRESETS } = await import("@/lib/projects/floorplan-viz-styles");
const { sceneStyleFor } = await import("@/lib/projects/scene3d/style");
const { buildScene } = await import("@/lib/projects/scene3d/build-scene");
const { outlineEdges } = await import("@/lib/projects/scene3d/floors");
const { dollhouseView, flatToPrimitives } = await import("@/lib/projects/building/flat-model");
const { unitInteriorViews } = await import("@/lib/projects/pipeline/flat-views");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
const { photographWithCycles } = await import("@/lib/projects/scene3d/blender-cycles");

const t0 = Date.now();
const drawing = readDxfDrawing(readFileSync(values.dxf))!;
const unit = unitGeometryFromDxf(drawing, number);
if ("reason" in unit) {
  console.log(JSON.stringify({ ok: false, stage: "unit", reason: unit.reason }));
  process.exit(2);
}
const { geometry } = unit;
console.log(JSON.stringify({ stage: "unit", ...geometry.unitArea, segments: geometry.segments.length, walls: geometry.walls.length, labels: geometry.labels?.length, ms: Date.now() - t0 }));

const plan = unitByDoors(drawing, number);
if (isUnitFailure(plan)) throw new Error(plan.reason);
const input = unitSceneInput(plan);
// The flat's own sheet, for the booklet, less the balconies the client says are not the flat's (overrides.json
// dropTerraces): the model left flat 16's and 17's lower balcony out, and the booklet's sheet still drew it.
{
  const file = path.join(outDir, "..", "overrides.json");
  const read = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { dropTerraces?: Array<{ box: [number, number, number, number] }>; dropAreas?: Array<{ box: [number, number, number, number] }> }) : {};
  const drops = [...(read.dropTerraces ?? []), ...(read.dropAreas ?? [])];
  // Metres as the scene reads them (from the plan's raster origin) to the page's points (from its 1 m margin).
  const m = DXF_PAGE_UNITS_PER_METRE;
  const ox = (plan.x0 - plan.bounds.x0) * plan.unitsM + 1;
  const oy = (plan.bounds.y1 - plan.y1) * plan.unitsM + 1;
  const boxes = drops.map(({ box: [x0, y0, x1, y1] }) => ({ x0: (x0 + ox) * m, y0: (y0 + oy) * m, x1: (x1 + ox) * m, y1: (y1 + oy) * m }));
  const inside = (b: (typeof boxes)[number], x: number, y: number) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  // A line crossing a box keeps its parts outside it: a railing runs on past the dropped balcony.
  const clip = (segs: typeof geometry.segments) =>
    segs.flatMap((sg) => {
      let parts = [sg];
      for (const b of boxes) {
        parts = parts.flatMap((q) => {
          const n = Math.max(1, Math.ceil(Math.hypot(q.x2 - q.x1, q.y2 - q.y1) / 2));
          const out: (typeof parts)[number][] = [];
          let start: number | null = null;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const keep = !inside(b, q.x1 + (q.x2 - q.x1) * t, q.y1 + (q.y2 - q.y1) * t);
            if (keep && start === null) start = t;
            if ((!keep || i === n) && start !== null) {
              const end = keep ? t : (i - 1) / n;
              if (end > start) out.push({ ...q, x1: q.x1 + (q.x2 - q.x1) * start, y1: q.y1 + (q.y2 - q.y1) * start, x2: q.x1 + (q.x2 - q.x1) * end, y2: q.y1 + (q.y2 - q.y1) * end });
              start = null;
            }
          }
          return out;
        });
      }
      return parts;
    });
  const sheet = boxes.length
    ? { ...geometry, segments: clip(geometry.segments), curves: clip(geometry.curves), labels: geometry.labels?.filter((l) => !boxes.some((b) => inside(b, l.x, l.y))) }
    : geometry;
  const page = await renderDxfPageJpeg(sheet);
  if (page) writeFileSync(path.join(outDir, "page.jpg"), page);
}
// The front doors, open into the flat as the sheet swings them (client, 03/11/2026); the floor inside them is laid below.
// The doors' openings come first, in the plan's order.
const entranceOpenings: string[] = [];
plan.doors.forEach((d, k) => {
  if (d.entrance && input.openings[k]?.leaf) entranceOpenings.push(`opening:${k}`);
});
// What the client asks beyond the sheet, kept beside the flat's renders (../overrides.json): a window made a door, by where it stands (metres, as _unit-openings prints).
const overridesFile = path.join(outDir, "..", "overrides.json");
if (existsSync(overridesFile)) {
  const overrides = JSON.parse(readFileSync(overridesFile, "utf8")) as {
    openings?: Array<{ near: [number, number]; kind: "door" | "slider" | "window"; into?: 1 | -1; hinge?: "from" | "to"; closed?: boolean }>;
    /** Balconies that are not the flat's, by a box [x0, y0, x1, y1] holding their centres (metres, as _unit-terraces prints). */
    dropTerraces?: Array<{ box: [number, number, number, number] }>;
    /** Whole parts of the drawing that are not the flat — a stair lobby, a neighbour's bathroom — by a box (metres, as _unit-rooms prints): everything in it goes. */
    dropAreas?: Array<{ box: [number, number, number, number] }>;
  };
  const u = input.unitsPerMetre;
  for (const drop of overrides.dropTerraces ?? []) {
    const [x0, y0, x1, y1] = drop.box.map((n) => n * u) as [number, number, number, number];
    const before = input.terraceRects.length;
    input.terraceRects = input.terraceRects.filter((rs) => {
      const cx = (Math.min(...rs.map((r) => r.x)) + Math.max(...rs.map((r) => r.x + r.w))) / 2;
      const cy = (Math.min(...rs.map((r) => r.y)) + Math.max(...rs.map((r) => r.y + r.h))) / 2;
      return !(cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
    });
    console.log(JSON.stringify({ stage: "override", dropTerraces: drop.box, dropped: before - input.terraceRects.length }));
  }
  // Flat 18's reading took the stair lobby outside its front door and the neighbour's bathroom above it as its own:
  // walls are cut back to the box's edge, floors and rooms lose what lies in it, pieces and openings in it go.
  type Rect = (typeof input.floorRects)[number];
  for (const drop of overrides.dropAreas ?? []) {
    const [x0, y0, x1, y1] = drop.box.map((n) => n * u) as [number, number, number, number];
    const inBox = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;
    const less = (r: Rect): Rect[] => {
      if (r.x >= x1 || r.x + r.w <= x0 || r.y >= y1 || r.y + r.h <= y0) return [r];
      const out: Rect[] = [];
      if (r.y < y0) out.push({ x: r.x, y: r.y, w: r.w, h: y0 - r.y });
      if (r.y + r.h > y1) out.push({ x: r.x, y: y1, w: r.w, h: r.y + r.h - y1 });
      const my0 = Math.max(r.y, y0), my1 = Math.min(r.y + r.h, y1);
      if (r.x < x0) out.push({ x: r.x, y: my0, w: x0 - r.x, h: my1 - my0 });
      if (r.x + r.w > x1) out.push({ x: x1, y: my0, w: r.x + r.w - x1, h: my1 - my0 });
      return out.filter((q) => q.w > 0 && q.h > 0);
    };
    const counts = { walls: input.bodies.length, openings: input.openings.length, furniture: input.furniture.length, rooms: input.rooms.length };
    input.bodies = input.bodies.flatMap((b) => {
      const across = b.orientation === "h" ? b.centre > y0 && b.centre < y1 : b.centre > x0 && b.centre < x1;
      if (!across) return [b];
      const [lo, hi] = b.orientation === "h" ? [x0, x1] : [y0, y1];
      return [{ ...b, to: Math.min(b.to, lo) }, { ...b, from: Math.max(b.from, hi) }].filter((p) => p.to - p.from > 0.05 * u);
    });
    input.openings = input.openings.filter((o) => !(o.orientation === "v" ? inBox(o.centre, (o.from + o.to) / 2) : inBox((o.from + o.to) / 2, o.centre)));
    input.furniture = input.furniture.filter((p) => !inBox(p.x + p.w / 2, p.y + p.h / 2));
    input.floorRects = input.floorRects.flatMap(less);
    input.terraceRects = input.terraceRects.map((rs) => rs.flatMap(less)).filter((rs) => rs.length > 0);
    input.rooms = input.rooms
      .map((r) => {
        const rects = r.rects.flatMap(less);
        return { ...r, rects, areaM2: rects.reduce((s, q) => s + q.w * q.h, 0) / (u * u) };
      })
      .filter((r) => r.areaM2 > 0.5);
    if (input.labelledRooms) input.labelledRooms = input.labelledRooms.filter((l) => !inBox(l.box.x + l.box.w / 2, l.box.y + l.box.h / 2));
    // The frame follows what is left: with the old bounds, 18's and 19's top views stood low in a frame still
    // sized for the lobby and the bathroom above them.
    const kept = [...input.floorRects, ...input.terraceRects.flat(), ...input.bodies.map((b) => (b.orientation === "h" ? { x: b.from, y: b.centre - b.thickness / 2, w: b.to - b.from, h: b.thickness } : { x: b.centre - b.thickness / 2, y: b.from, w: b.thickness, h: b.to - b.from }))];
    if (kept.length) {
      const bx0 = Math.min(...kept.map((q) => q.x)), by0 = Math.min(...kept.map((q) => q.y));
      const bx1 = Math.max(...kept.map((q) => q.x + q.w)), by1 = Math.max(...kept.map((q) => q.y + q.h));
      input.bounds = { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 };
    }
    console.log(JSON.stringify({ stage: "override", dropArea: drop.box, walls: counts.walls - input.bodies.length, openings: counts.openings - input.openings.length, furniture: counts.furniture - input.furniture.length, rooms: counts.rooms - input.rooms.length }));
  }
  for (const change of overrides.openings ?? []) {
    const [nx, ny] = [change.near[0] * u, change.near[1] * u];
    const where = (o: (typeof input.openings)[number]) => (o.orientation === "v" ? { x: o.centre, y: (o.from + o.to) / 2 } : { x: (o.from + o.to) / 2, y: o.centre });
    const o = [...input.openings].sort((a, b) => Math.hypot(where(a).x - nx, where(a).y - ny) - Math.hypot(where(b).x - nx, where(b).y - ny))[0];
    if (!o) continue;
    o.kind = change.kind;
    // A door hinged at its first end (or its last, `hinge: "to"`), its leaf open into the room on the `into` side of the
    // wall. Flat 17's upper bedroom: the reader laid the leaf along the thin wall beside the doorway, and the painter
    // made wall and leaf one wide door.
    if (change.kind === "door") {
      const len = o.to - o.from;
      const into = change.into ?? 1;
      const at = change.hinge === "to" ? o.to : o.from;
      o.leaf = o.orientation === "v" ? { x: o.centre, y: at, dx: into * len, dy: 0 } : { x: at, y: o.centre, dx: 0, dy: into * len };
      // Shut, in the wall's own line: flat 17's west bedroom door, open flat along the thin wall beside the upper
      // bedroom's doorway, was painted as a door in that wall.
      if (change.closed) {
        const span = (change.hinge === "to" ? -1 : 1) * len;
        o.leaf = o.orientation === "v" ? { x: o.centre, y: at, dx: 0, dy: span } : { x: at, y: o.centre, dx: span, dy: 0 };
      }
    }
    console.log(JSON.stringify({ stage: "override", opening: change }));
  }
}
console.log(JSON.stringify({ stage: "input", bodies: input.bodies.length, openings: input.openings.map((o) => o.kind).join(""), floorRects: input.floorRects.length, terraces: input.terraceRects.length, rooms: input.rooms.map((r) => `${r.name}:${r.kind}:${r.areaM2.toFixed(1)}`), furniture: input.furniture.length, pieces: [...new Set(plan.pieces.map((p) => p.block))].join("|") }));
const presets = FLOORPLAN_VIZ_PRESETS as Record<string, Parameters<typeof sceneStyleFor>[0]>;
const preset = presets[values.style!] ?? Object.values(presets)[0]!;
const style = sceneStyleFor(preset);
if (values.look === "premium-dark") {
  style.materials = {
    ...style.materials,
    // Warm and light, as the client's reference (03/11/2026): honey oak planks, cream plaster, walnut joinery, pale stone.
    wall: { color: 0xeadfce, roughness: 0.92, metalness: 0 },
    skirting: { color: 0x9a6c45, roughness: 0.5, metalness: 0 },
    floorWood: { color: 0xb88a5c, roughness: 0.4, metalness: 0 },
    floorTile: { color: 0xd9cfc2, roughness: 0.22, metalness: 0 },
    joinery: { color: 0x8a5d3b, roughness: 0.35, metalness: 0 },
    timber: { color: 0x7a5034, roughness: 0.4, metalness: 0 },
    upholstery: { color: 0xd8c8b2, roughness: 0.95, metalness: 0 },
    linen: { color: 0xf0e7da, roughness: 0.9, metalness: 0 },
    worktop: { color: 0xe6ddd0, roughness: 0.2, metalness: 0 },
    metal: { color: 0xb38b52, roughness: 0.28, metalness: 1 },
    steel: { color: 0xc4c2bd, roughness: 0.3, metalness: 1 },
    neutral: { color: 0xcdb89c, roughness: 0.85, metalness: 0 },
  };
}
// Scanned surfaces (Poly Haven, CC0) for the premium look; see מערכת הדמיות/_textures.
const texRoot = path.resolve("מערכת הדמיות/_textures");
const scan = (id: string) => ({ diff: path.join(texRoot, id, "diff.jpg"), rough: path.join(texRoot, id, "rough.jpg"), nor: path.join(texRoot, id, "nor.jpg") });
const textures =
  values.look === "premium-dark" && existsSync(texRoot)
    ? {
        // Long honey-oak boards, one floor through the flat: the straight grain of the veneer scan, laid as planks 1.2 × 0.19 m.
        floorWood: { ...scan("black_walnut_veneer_01"), sizeM: 1.2, mode: "full" as const, tint: [0.95, 0.8, 0.55] as [number, number, number], roughMin: 0.28, roughMax: 0.55, planks: [1.2, 0.19] as [number, number] },
        timber: { ...scan("black_walnut_veneer_01"), sizeM: 1, mode: "full" as const, tint: [0.82, 0.58, 0.4] as [number, number, number], roughMin: 0.25, roughMax: 0.55 },
        upholstery: { ...scan("wool_boucle"), sizeM: 0.35, mode: "relief" as const, roughMin: 0.8, roughMax: 1, normal: 1.4 },
        linen: { ...scan("rough_linen"), sizeM: 0.27, mode: "relief" as const, roughMin: 0.75, roughMax: 0.95, normal: 0.8 },
        neutral: { ...scan("poly_wool_herringbone"), sizeM: 0.4, mode: "full" as const, tint: [0.9, 0.82, 0.72] as [number, number, number], roughMin: 0.8, roughMax: 1 },
      }
    : undefined;
// The flat's floor above the street, from the level the sheet writes in it (+9.64).
const levelText = plan.texts.map((t) => /^\+(\d+\.\d+)$/.exec(t.text.trim())?.[1]).find((v) => v != null);
const floorLevelM = levelText ? Number(levelText) : 9;
const scene = buildScene(input, { rules: style.rules, modern: values.look === "premium-dark" });
// Wall the client asks to stand thicker than the sheet draws it, as boxes in the scene's metres (x0, z0, x1, z1 as
// model.json reads): flat 17's 12 cm partition beside the upper bedroom's doorway was painted as a walnut leaf twice.
{
  const file = path.join(outDir, "..", "overrides.json");
  const extra = existsSync(file) ? ((JSON.parse(readFileSync(file, "utf8")) as { addWalls?: Array<{ scene: [number, number, number, number] }> }).addWalls ?? []) : [];
  const ref = scene.meshes.find((m) => m.kind === "wall");
  for (const { scene: [x0, z0, x1, z1] } of extra) {
    if (!ref) break;
    scene.meshes.push({ kind: "wall", material: ref.material, centre: { x: (x0 + x1) / 2, y: ref.centre.y, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: ref.size.y, z: z1 - z0 }, sourceId: "wall:override" });
    console.log(JSON.stringify({ stage: "override", addWall: [x0, z0, x1, z1] }));
  }
}
if (values.look === "premium-dark") {
  // The floor inside the front door: the builder judged it open to the landing, door and all, and laid none —
  // a hole inside flat 16's door. Filled on the flat's side only, where no floor is, in 2 cm rows (an overlapping
  // square showed its edges as grey lines). From the door's own line and 20 cm past each jamb: narrower, it left
  // grey strips at the jambs and behind the leaf.
  for (const id of entranceOpenings) {
    const o = scene.openings.find((q) => q.id === id);
    const floors = scene.meshes.filter((m) => m.kind === "floor" && m.centre.y < 0.2);
    const ref = floors.find((m) => m.material === "floorWood") ?? floors[0];
    if (!o || !ref) continue;
    const alongX = o.size.x >= o.size.z;
    const len = alongX ? o.size.x : o.size.z;
    const onFloor = (x: number, z: number) => floors.some((m) => Math.abs(x - m.centre.x) <= m.size.x / 2 && Math.abs(z - m.centre.z) <= m.size.z / 2);
    const half = (alongX ? o.size.z : o.size.x) / 2;
    const side = [1, -1].find((sg) => (alongX ? onFloor(o.centre.x, o.centre.z + sg * (half + len + 0.3)) : onFloor(o.centre.x + sg * (half + len + 0.3), o.centre.z)));
    if (!side) continue;
    const c = 0.02;
    // The open runs of each 2 cm row, then rows with the same runs merged into one piece: 2 cm strips showed
    // as a patch of hairlines. Each piece reaches 1 cm into the floor round it, at its height, so no crack shows.
    const rows: Array<Array<[number, number]>> = [];
    const wide = len + 0.4;
    const steps = Math.round(wide / c);
    for (let v = 0; v < half + len; v += c) {
      const runs: Array<[number, number]> = [];
      let run: number | null = null;
      for (let i = 0; i <= steps; i++) {
        const u = -wide / 2 + i * c;
        const x = alongX ? o.centre.x + u + c / 2 : o.centre.x + side * (v + c / 2);
        const z = alongX ? o.centre.z + side * (v + c / 2) : o.centre.z + u + c / 2;
        const open = i < steps && !onFloor(x, z);
        if (open && run === null) run = u;
        if (!open && run !== null) {
          runs.push([run, u]);
          run = null;
        }
      }
      rows.push(runs);
    }
    let filled = 0;
    const key = (r: Array<[number, number]>) => r.map((q) => q.map((n) => n.toFixed(3)).join(",")).join(";");
    for (let i = 0; i < rows.length; ) {
      let j = i + 1;
      while (j < rows.length && key(rows[j]!) === key(rows[i]!)) j++;
      for (const [u0, u1] of rows[i]!) {
        const w = u1 - u0 + 0.02;
        const d = (j - i) * c + 0.02;
        const mid = (u0 + u1) / 2;
        const along = side * ((i + j) / 2) * c;
        scene.meshes.push({ kind: "floor", material: ref.material, centre: { x: alongX ? o.centre.x + mid : o.centre.x + along, y: ref.centre.y, z: alongX ? o.centre.z + along : o.centre.z + mid }, size: alongX ? { x: w, y: ref.size.y, z: d } : { x: d, y: ref.size.y, z: w }, sourceId: "floor:entrance" });
        filled += (u1 - u0) * (j - i) * c;
      }
      i = j;
    }
    if (filled) console.log(JSON.stringify({ stage: "entrance-floor", opening: id, m2: +filled.toFixed(2), pieces: scene.meshes.filter((m) => m.sourceId === "floor:entrance").length }));
  }
  // A wall block standing alone off the floor is not a wall: past flat 16's west wall the reader built a row of
  // 27 cm blocks the sheet does not draw. A door's 1 cm jamb sliver is no block.
  {
    const walls = scene.meshes.filter((m) => m.kind === "wall");
    const grounds = scene.meshes.filter((m) => m.kind === "floor" || m.kind === "terrace");
    const gapOf = (a: (typeof walls)[number], b: (typeof walls)[number]) =>
      Math.max(Math.abs(a.centre.x - b.centre.x) - (a.size.x + b.size.x) / 2, Math.abs(a.centre.z - b.centre.z) - (a.size.z + b.size.z) / 2);
    const lone = new Set(
      walls
        .filter((w) => Math.max(w.size.x, w.size.z) < 0.5 && Math.min(w.size.x, w.size.z) >= 0.1)
        .filter((w) => walls.every((o) => o === w || gapOf(w, o) > 0.02) && grounds.every((f) => gapOf(w, f) > 0.02))
        .map((w) => w.sourceId),
    );
    if (lone.size) {
      scene.meshes = scene.meshes.filter((m) => !lone.has(m.sourceId));
      console.log(JSON.stringify({ stage: "lone-walls", dropped: [...lone] }));
    }
  }
  // Two walls in one line with a slot of a few centimetres between them are one wall: beside flat 16's balcony door
  // the wall stopped 3 cm short of each jamb, and above the door's frame the slots showed as two dark lines.
  {
    const walls = scene.meshes.filter((m) => m.kind === "wall");
    const lo = (m: (typeof walls)[number], k: "x" | "y" | "z") => m.centre[k] - m.size[k] / 2;
    const hi = (m: (typeof walls)[number], k: "x" | "y" | "z") => m.centre[k] + m.size[k] / 2;
    let closed = 0;
    for (const a of walls)
      for (const b of walls)
        for (const [k, o] of [["x", "z"], ["z", "x"]] as const) {
          const gap = lo(b, k) - hi(a, k);
          if (gap <= 0.002 || gap > 0.05) continue;
          const o0 = Math.max(lo(a, o), lo(b, o));
          const o1 = Math.min(hi(a, o), hi(b, o));
          const y0 = Math.max(lo(a, "y"), lo(b, "y"));
          const y1 = Math.min(hi(a, "y"), hi(b, "y"));
          if (o1 - o0 < 0.05 || y1 - y0 < 0.5) continue;
          // Nothing else already standing in the slot.
          const mid = { [k]: hi(a, k) + gap / 2, [o]: (o0 + o1) / 2 } as Record<"x" | "z", number>;
          if (walls.some((w) => w !== a && w !== b && Math.abs(mid.x - w.centre.x) < w.size.x / 2 && Math.abs(mid.z - w.centre.z) < w.size.z / 2)) continue;
          const size = { x: 0, y: y1 - y0, z: 0 };
          size[k] = gap;
          size[o] = o1 - o0;
          scene.meshes.push({ kind: "wall", material: a.material, centre: { x: mid.x, y: (y0 + y1) / 2, z: mid.z }, size, sourceId: `${a.sourceId}+slot` });
          closed++;
        }
    if (closed) console.log(JSON.stringify({ stage: "wall-slots", closed }));
  }
  // One floor through the open space: the kitchen's strip in tile beside the living room's wood read as a patch.
  const kitchens = new Set(scene.rooms.filter((r) => r.kind === "kitchen").map((r) => r.id));
  for (const m of scene.meshes) if (m.kind === "floor" && kitchens.has(m.sourceId)) m.material = "floorWood";
  // The tall unit standing at the end of a kitchen run is its fridge: in the joinery's wood it read as a block of timber.
  const tops = scene.meshes.filter((m) => m.kind === "furniture" && m.material === "worktop" && m.sourceId.endsWith("/worktop"));
  const pieces = new Map<string, typeof scene.meshes>();
  for (const m of scene.meshes) {
    if (m.kind !== "furniture" || m.sourceId.endsWith("/upper") || m.sourceId.endsWith("/underlight")) continue;
    const id = m.sourceId.split("/")[0]!;
    pieces.set(id, [...(pieces.get(id) ?? []), m]);
  }
  const gap = (a: (typeof scene.meshes)[number], b: (typeof scene.meshes)[number]) =>
    Math.max(Math.abs(a.centre.x - b.centre.x) - (a.size.x + b.size.x) / 2, Math.abs(a.centre.z - b.centre.z) - (a.size.z + b.size.z) / 2);
  for (const [id, parts] of pieces) {
    const top = Math.max(...parts.map((m) => m.centre.y + m.size.y / 2));
    const deep = Math.max(...parts.map((m) => Math.min(m.size.x, m.size.z)));
    if (top < 1.7 || deep < 0.5 || !parts.some((m) => tops.some((t) => gap(m, t) <= 0.25))) continue;
    for (const m of parts) if (m.material === "joinery" || m.material === "timber") m.material = "steel";
    // A cupboard over it to the wall cupboards' top line: the fridge stands in the run, not under a gap.
    const x0 = Math.min(...parts.map((m) => m.centre.x - m.size.x / 2));
    const x1 = Math.max(...parts.map((m) => m.centre.x + m.size.x / 2));
    const z0 = Math.min(...parts.map((m) => m.centre.z - m.size.z / 2));
    const z1 = Math.max(...parts.map((m) => m.centre.z + m.size.z / 2));
    if (top < 2.35) {
      scene.meshes.push({ kind: "furniture", material: "joinery", centre: { x: (x0 + x1) / 2, y: (top + 0.02 + 2.45) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: 2.45 - top - 0.02, z: z1 - z0 }, sourceId: `${id}/over`, round: 0.004 });
    }
    console.log(JSON.stringify({ stage: "fridge", piece: id, top }));
  }
}
// Windows and the doors out to a balcony in slim grey aluminium, a "Belgian" profile (client, 03/11/2026):
// a frame round every pane, the slider's mullion in it, and a balcony door a glazed aluminium leaf, not a wooden one.
if (values.look === "premium-dark") {
  const P = 0.05; // the profile's face
  const D = 0.07; // its depth across the wall
  const ring = (id: string, c: { x: number; z: number }, alongX: boolean, len: number, y0: number, y1: number) => {
    const across = (w: number, h: number, y: number, u = 0) =>
      scene.meshes.push({ kind: "frame", material: "aluminium", centre: { x: c.x + (alongX ? u : 0), y, z: c.z + (alongX ? 0 : u) }, size: alongX ? { x: w, y: h, z: D } : { x: D, y: h, z: w }, sourceId: `${id}/profile` });
    across(len, P, y1 - P / 2);
    across(len, P * 1.4, y0 + (P * 1.4) / 2);
    for (const k of [-1, 1]) across(P, y1 - y0, (y0 + y1) / 2, k * (len / 2 - P / 2));
  };
  // Every door out to a balcony, the 0.9 m strip by bedroom 4 too, is aluminium (client, 03/11/2026).
  const slabs = scene.meshes.filter((m) => m.kind === "terrace" && m.size.y < 0.1 && !m.sourceId.includes("/"));
  const byBalcony = (o: (typeof scene.openings)[number]) =>
    slabs.some((s) => Math.max(Math.abs(o.centre.x - s.centre.x) - s.size.x / 2, Math.abs(o.centre.z - s.centre.z) - s.size.z / 2) <= 0.45);
  for (const o of scene.openings) {
    const alongX = o.size.x >= o.size.z;
    const len = alongX ? o.size.x : o.size.z;
    if (o.kind === "window" || o.kind === "slider") {
      ring(o.id, o.centre, alongX, len, o.sillM, o.headM);
      for (const m of scene.meshes) if (m.sourceId === `${o.id}/mullion`) m.material = "aluminium";
    } else if (o.kind === "door" && byBalcony(o)) {
      for (const m of scene.meshes) {
        if (m.sourceId === `${o.id}/frame`) m.material = "aluminium";
        if (m.sourceId !== `${o.id}/leaf`) continue;
        // The leaf as glass in an aluminium ring, where it stands open.
        m.kind = "glazing";
        m.material = "glass";
        const leafAlongX = m.size.x >= m.size.z;
        const leafLen = leafAlongX ? m.size.x : m.size.z;
        ring(`${o.id}/leaf`, m.centre, leafAlongX, leafLen, m.centre.y - m.size.y / 2, m.centre.y + m.size.y / 2);
      }
    }
  }
}
// Dressed for the brief: curtains, pendants, lamps, art, a plant (lib/projects/scene3d/dress.ts).
if (values.look === "premium-dark") {
  const { dressFlat } = await import("@/lib/projects/scene3d/dress");
  const dressed = dressFlat(scene);
  // No plant indoors (client, 03/11/2026): flat 16's living window drew a pot beside it; planting stays on the balconies.
  dressed.meshes = dressed.meshes.filter((m) => !m.sourceId.startsWith("prop:plant/"));
  scene.meshes.push(...dressed.meshes);
  scene.lights.push(...dressed.lights);
  console.log(JSON.stringify({ stage: "dress", props: new Set(dressed.meshes.map((m) => m.sourceId.split("/")[0])).size, lights: dressed.lights.length }));
}
writeFileSync(path.join(outDir, "model.json"), JSON.stringify(scene));
console.log(
  JSON.stringify({
    stage: "model",
    rooms: scene.rooms.map((r) => `${r.name}:${r.kind}:${r.areaM2.toFixed(1)}`),
    openings: scene.openings.length,
    meshes: scene.meshes.length,
  }),
);

// Golden hour: the sun low and amber, on the side the living room's windows look out of.
const livingRects = scene.rooms.filter((r) => r.kind === "living" || r.kind === "kitchen").flatMap((r) => r.rects);
const cxL = livingRects.reduce((a, r) => a + (r.x + r.w / 2) * r.w * r.d, 0) / Math.max(1e-6, livingRects.reduce((a, r) => a + r.w * r.d, 0));
const czL = livingRects.reduce((a, r) => a + (r.z + r.d / 2) * r.w * r.d, 0) / Math.max(1e-6, livingRects.reduce((a, r) => a + r.w * r.d, 0));
const near = scene.openings.filter((o) => o.exterior && o.kind !== "door" && Math.hypot(o.centre.x - cxL, o.centre.z - czL) < 7);
const dx = near.reduce((a, o) => a + (o.centre.x - cxL) * o.size.x * o.size.z, 0);
const dz = near.reduce((a, o) => a + (o.centre.z - czL) * o.size.x * o.size.z, 0);
const sunAz = near.length ? ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360 : 270;
const sunAt = values.golden ? { azimuthDeg: sunAz, elevationDeg: 5 } : { azimuthDeg: 200, elevationDeg: 40 };
console.log(JSON.stringify({ stage: "light", style: values.style, golden: values.golden, sun: sunAt }));

// Hidden light: a strip tight along every wall of a room — at the ceiling seen
// from inside, at the walls' cut top from above. Set in a rectangle inside the
// room's largest part it hung over the middle of the floor, never at a wall.
const wallBoxes = scene.meshes.filter((m) => m.kind === "wall");
const wallNear = (x: number, z: number, pad: number) =>
  wallBoxes.some((w) => Math.abs(x - w.centre.x) <= w.size.x / 2 + pad && Math.abs(z - w.centre.z) <= w.size.z / 2 + pad);
const openingNear = (x: number, z: number) =>
  scene.openings.some((o) => Math.abs(x - o.centre.x) <= o.size.x / 2 + 0.08 && Math.abs(z - o.centre.z) <= o.size.z / 2 + 0.08);
function coves(y = 2.62) {
  const out: Array<Record<string, unknown>> = [];
  const off = 0.04;
  const step = 0.1;
  for (const room of scene.rooms) {
    if (room.kind === "balcony" || room.areaM2 < 2.5) continue;
    const rects = room.rects.map((r) => ({ x: r.x, y: r.z, w: r.w, h: r.d }));
    const inside = (x: number, z: number) => room.rects.some((r) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);
    for (const e of outlineEdges(rects)) {
      if (e.to - e.from < 0.5) continue;
      // Which side is the room's: the strip hangs a few centimetres in from the wall face.
      const mid = (e.from + e.to) / 2;
      const inward = e.orientation === "h" ? (inside(mid, e.at + 0.05) ? 1 : -1) : inside(e.at + 0.05, mid) ? 1 : -1;
      const at = e.at + inward * off;
      const wallAt = e.at - inward * 0.06;
      let start = -1;
      const runs: Array<[number, number]> = [];
      // One step past the end, so a run along the whole wall is closed too.
      for (let t = e.from + step / 2; t < e.to + step; t += step) {
        // Over a window or a door too: the cove is in the ceiling, and broken at every opening it read as lit on some walls and not others.
        const on = t < e.to && (e.orientation === "h" ? wallNear(t, wallAt, 0.03) || openingNear(t, wallAt) : wallNear(wallAt, t, 0.03) || openingNear(wallAt, t));
        if (on && start < 0) start = t - step / 2;
        if (!on && start >= 0) {
          runs.push([start + 0.05, Math.min(e.to, t - step / 2) - 0.05]);
          start = -1;
        }
      }
      for (const [a, b] of runs) {
        if (b - a < 0.4) continue;
        const c = (a + b) / 2;
        const centre = e.orientation === "h" ? { x: c, y, z: at } : { x: at, y, z: c };
        const size = e.orientation === "h" ? { x: b - a, y: 0.03, z: 0.04 } : { x: 0.04, y: 0.03, z: b - a };
        out.push({ type: "box", centre, size, material: "lightPanel", tag: `light:cove:${room.id}` });
      }
    }
  }
  return out;
}

// The kitchen's hidden light: under every wall cupboard, a warm wash on the worktop.
if (values.look === "premium-dark") {
  for (const m of scene.meshes.filter((q) => q.sourceId.endsWith("/upper"))) {
    const long = Math.max(m.size.x, m.size.z);
    const n = Math.max(1, Math.round(long / 0.6));
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n - 0.5;
      const x = m.centre.x + (m.size.x >= m.size.z ? f * m.size.x : 0);
      const z = m.centre.z + (m.size.x >= m.size.z ? 0 : f * m.size.z);
      scene.lights.push({ id: `light:undercabinet@${m.sourceId}:${i}`, kind: "lamp", position: { x, y: 1.44, z }, kelvin: 2700, intensity: 0.22, anchorId: m.sourceId });
    }
  }
}

const wanted = new Set(values.views!.split(","));
const interiors = unitInteriorViews(scene).map((v) => ({
  id: v.id,
  title: v.title,
  ceiling: true,
  cutAboveM: undefined as number | undefined,
  payload: {
    width,
    height,
    exposure: 0.7,
    ao: true,
    camera: { position: v.position, target: v.target, fovDeg: v.fovDeg, interior: true, studio: true, up: undefined as { x: number; y: number; z: number } | undefined },
    sun: sunAt,
  },
}));
// Cameras the client asks for beyond the chosen ones (../overrides.json "cameras", scene metres as model.json): on 19
// both interiors looked at the island from the kitchen side and hid its stools (client, 04/11/2026).
{
  const file = path.join(outDir, "..", "overrides.json");
  const extra = existsSync(file) ? ((JSON.parse(readFileSync(file, "utf8")) as { cameras?: Array<{ id: string; title: string; from: [number, number]; to: [number, number]; fovDeg?: number }> }).cameras ?? []) : [];
  for (const c of extra) {
    const base = interiors[0];
    if (!base) break;
    const shot = { ...base, id: c.id, title: c.title, payload: { ...base.payload, camera: { ...base.payload.camera, position: { x: c.from[0], y: 1.5, z: c.from[1] }, target: { x: c.to[0], y: 1.05, z: c.to[1] }, fovDeg: c.fovDeg ?? 72 } } };
    const at = interiors.findIndex((v) => v.id === c.id);
    if (at >= 0) interiors[at] = shot;
    else interiors.push(shot);
  }
}
console.log(JSON.stringify({ stage: "coves", strips: coves().length }));
console.log(JSON.stringify({ stage: "cameras", views: interiors.map((v) => [v.id, v.payload.camera.position, v.payload.camera.target]) }));
const top = dollhouseView(scene, width);
top.payload.camera.position = { ...top.payload.camera.position, y: top.payload.camera.position.y * Number(values.frame) };
const views = [top, ...interiors].filter((v) => wanted.has(v.id));
// Every camera, for the booklet's maps: where each picture was taken from and which way it looks.
writeFileSync(
  path.join(outDir, "views.json"),
  JSON.stringify([top, ...interiors].map((v) => ({ id: v.id, title: v.title, cutAboveM: v.cutAboveM, payload: v.payload }))),
);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const view of views) {
  const name = view.id;
  const started = Date.now();
  let bytes: Buffer | null = null;
  if (values.engine === "cycles") {
    // From above, a curtain cut at the section reads as a post standing at the glass.
    const shown = view.ceiling ? scene : { ...scene, meshes: scene.meshes.filter((m) => !m.sourceId.startsWith("prop:curtain")) };
    // Each view at its own frame: the dollhouse's is the flat's shape, and in the interiors' 16:10 a tall flat stood in a wide grey field.
    const shot = await photographWithCycles(shown, style, {
      width: view.payload.width,
      height: view.payload.height,
      position: view.payload.camera.position,
      target: view.payload.camera.target,
      up: view.payload.camera.up ?? { x: 0, y: 1, z: 0 },
      fovDeg: view.payload.camera.fovDeg,
      cutAboveM: view.cutAboveM,
      ceiling: view.ceiling ?? false,
      interior: Boolean(view.payload.camera.interior),
      // Golden light is for rooms seen from inside: from above, the low sun burned the cut walls white and the sky under the horizon was black.
      golden: Boolean(values.golden) && Boolean(view.ceiling),
      warm: values.look === "premium-dark" && !view.ceiling,
      ...(values.view === "town" ? { surroundingsFloorM: floorLevelM } : {}),
      ...(textures ? { textures } : {}),
      // From above, the strips run along the walls' cut tops.
      coves: (values.look === "premium-dark" || view.ceiling ? coves(view.ceiling ? 2.62 : (view.cutAboveM ?? 1.1) - 0.05) : []).map((c) => {
        const q = c as { centre: { x: number; y: number; z: number }; size: { x: number; z: number } };
        return { x: q.centre.x, y: q.centre.y, z: q.centre.z, w: q.size.x, d: q.size.z };
      }),
      sunAzimuthDeg: view.payload.sun.azimuthDeg,
      sunElevationDeg: view.payload.sun.elevationDeg,
      samples: Number(values.samples),
      deadlineMs: Date.now() + 30 * 60 * 1000,
    });
    bytes = shot ? Buffer.from(shot.base64, "base64") : null;
  } else {
    const model = flatToPrimitives(scene, { cutAboveM: view.cutAboveM, ceiling: view.ceiling });
    if (view.ceiling) {
      model.primitives.push(...(coves() as typeof model.primitives));
      // One slab over the whole flat above the rooms' own ceilings: the gaps between rooms, over doors and wall ends, showed the sky.
      const e = scene.extent;
      model.primitives.push({ type: "box", centre: { x: e.x + e.width / 2, y: 2.79, z: e.z + e.depth / 2 }, size: { x: e.width + 2, y: 0.1, z: e.depth + 2 }, material: "ceiling", tag: "ceiling:slab" } as (typeof model.primitives)[number]);
    }
    if (values.golden) model.palette = { ...(model.palette ?? {}), golden: true };
    const [frame] = await renderBuildingFrames(
      [{ ...view.payload, model }],
      { outputWidthPx: view.payload.width, timeoutMs: 180_000 },
    );
    bytes = frame ?? null;
  }
  if (!bytes) {
    console.log(JSON.stringify({ stage: "view", view: name, ok: false }));
    continue;
  }
  writeFileSync(path.join(outDir, "attempts", `${name}-${values.engine}-${stamp}-raw.jpg`), bytes);
  // Stronger colour (client, 04/11/2026): the renders came out washed, every surface a pale peach. Deeper mid-tones
  // and more contrast, the saturation held back a little so the warm light does not turn the wood red.
  const sharp = (await import("sharp")).default;
  bytes = await sharp(bytes).gamma(2.2, 1.5).modulate({ saturation: 0.9 }).linear([1.12, 1.1, 1.14], [-8, -6, -4]).jpeg({ quality: 93 }).toBuffer();
  writeFileSync(path.join(outDir, "attempts", `${name}-${values.engine}-${stamp}.jpg`), bytes);
  writeFileSync(path.join(outDir, `${name}-${values.engine}.jpg`), bytes);
  console.log(JSON.stringify({ stage: "view", view: name, ok: true, ms: Date.now() - started }));
}
