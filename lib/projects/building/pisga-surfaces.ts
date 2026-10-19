import { insidePolygon } from "@/lib/projects/building/assemble";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { PISGA_DXF } from "@/lib/projects/building/pisga-dxf";
import { entitiesWithin, flattenDxf, type DxfDrawing, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * מרכז פסג"ה — the surfaces a sheet hatches, read whole.
 *
 * Every hatch on a plan sheet is a surface of the site: paving laid in bricks
 * or herringbone, concrete, a grated deck, earth. The reader takes each one
 * as the drawing's own polygon (outer ring and holes, even-odd) and sorts it
 * by its pattern; nothing is picked by layer name, so what the architect hatches
 * stands in the model whatever layer it sits on. Hatches that only mark something
 * (the red/blue ANSI31 section ticks, text fills) are not surfaces and are named
 * in `SECTION_MARKS`.
 */
export type SurfaceKind = "paving" | "concrete" | "grate" | "earth" | "fill";

export type DxfSurface = {
  ring: Array<[number, number]>;
  holes: Array<Array<[number, number]>>;
  kind: SurfaceKind;
  pattern: string;
  layer: string;
  colour: number;
  areaM2: number;
};

/** Patterns that only mark (section ticks, demolition, steel hatching), not surfaces. */
const SECTION_MARKS = /^ANSI3\d$/;

const kindOf = (pattern: string): SurfaceKind =>
  /GRATE|STEEL/.test(pattern)
    ? "grate"
    : /HBONE|^AR-B8|^AR-B1|BRICK|paving|ANSI37|ANGLE/i.test(pattern)
      ? "paving"
      : /CONC|DOTS/.test(pattern)
        ? "concrete"
        : /EARTH|SAND/.test(pattern)
          ? "earth"
          : "fill";

const area = (r: Array<[number, number]>) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const u = r[i]!;
    const v = r[(i + 1) % r.length]!;
    a += u[0] * v[1] - v[0] * u[1];
  }
  return Math.abs(a) / 2;
};

/**
 * The hatches of a plan sheet in the plan frame (metres, x east, z south). A
 * hatch's rings are outer boundary and holes: a ring inside a larger one is a hole.
 */
export function dxfSurfaces(drawing: DxfDrawing, sheet: keyof typeof PISGA_DXF.sheets): DxfSurface[] {
  const left = PISGA_DXF.sheets[sheet];
  const { frameY, width, height, corner } = PISGA_DXF;
  // The roof sheet sits 152 units left of the floors' frame (their plot lines register it).
  const shift = sheet === "roof" ? -152 : 0;
  const at = (q: Pt): [number, number] => [(q.x - left - corner.x - shift) / 100 + 0.88, (frameY + corner.y - q.y) / 100 + 1.02];
  const pieces = flattenDxf(drawing, entitiesWithin(drawing, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
  const out: DxfSurface[] = [];
  for (const p of pieces) {
    if (!p.rings || p.rings.length === 0 || !(p.pattern || p.solid)) continue;
    const pattern = p.pattern ?? "SOLID";
    if (SECTION_MARKS.test(pattern) || /^(טקסט|אדום|כחול|הריסה|סימנים)/.test(p.layer) || /^(C3-10|B16-20|BL-TR|H200|A1-10)/.test(p.layer)) continue;
    if (pattern === "SOLID" && p.layer !== "מילוי גוטליב") continue;
    const rings = p.rings.map((r) => r.map(at)).filter((r) => r.length >= 3);
    const sorted = rings.map((r) => ({ r, a: area(r) })).sort((x, y) => y.a - x.a);
    const outers: Array<{ r: Array<[number, number]>; a: number; holes: Array<Array<[number, number]>> }> = [];
    for (const s of sorted) {
      const parent = outers.find((o) => insidePolygon(o.r, s.r[0]![0], s.r[0]![1]));
      if (parent) parent.holes.push(s.r);
      else outers.push({ ...s, holes: [] });
    }
    for (const o of outers) {
      if (o.a < 0.5) continue;
      out.push({ ring: o.r, holes: o.holes, kind: kindOf(pattern), pattern, layer: p.layer, colour: p.colour, areaM2: o.a - o.holes.reduce((t, h) => t + area(h), 0) });
    }
  }
  return out;
}

const MATERIAL: Record<SurfaceKind, BuildingMaterial> = { paving: "paving", concrete: "concrete", grate: "metal", earth: "soil", fill: "concrete" };

/**
 * A surface as a patch of ground laid on the ground itself (`groundAt`): a fine grid over the
 * polygon's box whose vertices stand a hand over the ground inside the polygon (outer ring,
 * not its holes) and a metre under it outside, so the paving follows every rise and fall of the
 * site, takes the polygon's edge to a quarter metre, and meets the ground at a kerb's height.
 */
export function surfacePrims(surfaces: DxfSurface[], groundAt: (x: number, z: number) => number, tag: string, lift = 0.08, deckLevel?: (s: DxfSurface) => number | undefined): Primitive[] {
  const out: Primitive[] = [];
  for (const s of surfaces) {
    // A grated deck is a deck, level, on its own supports: a slab at the level its spot height gives, not a skin on the slope.
    const level = s.kind === "grate" ? deckLevel?.(s) : undefined;
    if (level !== undefined) {
      out.push({ type: "prism", ring: s.ring, holes: s.holes.length ? s.holes : undefined, y0: level - 0.22, y1: level, material: "metal", tag: `${tag}:grate` });
      // Posts under it, at the corners and the middles of the sides of its box, down to the ground: it does not hang in the air.
      const bx = s.ring.map((q) => q[0]);
      const bz = s.ring.map((q) => q[1]);
      const [ax, cx, az, cz] = [Math.min(...bx) + 0.15, Math.max(...bx) - 0.15, Math.min(...bz) + 0.15, Math.max(...bz) - 0.15];
      for (const px of [ax, (ax + cx) / 2, cx]) {
        for (const pz of [az, cz]) {
          if (!insidePolygon(s.ring, px, pz)) continue;
          const g = groundAt(px, pz) - 0.3;
          if (level - 0.22 - g > 0.1) out.push({ type: "box", centre: { x: px, y: (level - 0.22 + g) / 2, z: pz }, size: { x: 0.2, y: level - 0.22 - g, z: 0.2 }, material: "metal", tag: `${tag}:grate-post` });
        }
      }
      continue;
    }
    const xs = s.ring.map((q) => q[0]);
    const zs = s.ring.map((q) => q[1]);
    const dx = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)) > 2500 ? 0.5 : 0.25;
    const x0 = Math.floor(Math.min(...xs) / dx) * dx - dx;
    const z0 = Math.floor(Math.min(...zs) / dx) * dx - dx;
    const nx = Math.ceil((Math.max(...xs) - x0) / dx) + 2;
    const nz = Math.ceil((Math.max(...zs) - z0) / dx) + 2;
    const heights: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * dx;
        const z = z0 + j * dx;
        const inside = insidePolygon(s.ring, x, z) && !s.holes.some((h) => insidePolygon(h, x, z));
        heights.push(groundAt(x, z) + (inside ? lift + (s.kind === "grate" ? 0.1 : 0) : -1));
      }
    }
    out.push({ type: "terrain", x0, z0, dx, nx, nz, heights, material: MATERIAL[s.kind], tag: `${tag}:${s.kind}` });
  }
  return out;
}

