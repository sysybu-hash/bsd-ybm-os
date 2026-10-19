import type { Primitive } from "@/lib/projects/building/model";
import { PISGA_DXF } from "@/lib/projects/building/pisga-dxf";
import { entitiesWithin, flattenDxf, type DxfDrawing, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * מרכז פסג"ה — the stairs a sheet draws, found by what a stair is: a run of
 * parallel lines of one length, a tread apart. No layer is named: the layers
 * differ from stair to stair (the lobby's, the exits', the ramps'), and a reader
 * that asked for one of them left the others out.
 */
export type TreadSet = {
  /** Treads, nearest the first line first. */
  n: number;
  /** The tread's length (the stair's width), and the going between two treads, metres. */
  width: number;
  pitch: number;
  /** The run's direction as a unit vector, from the first tread to the last, in the plan frame. */
  dir: [number, number];
  /** The middle of the first and of the last tread. */
  first: [number, number];
  last: [number, number];
  layer: string;
};

type Seg = { a: [number, number]; b: [number, number]; len: number; ang: number; off: number; layer: string };

/** Plan-frame point of a sheet point. */
const frame = (sheet: keyof typeof PISGA_DXF.sheets) => {
  const left = PISGA_DXF.sheets[sheet];
  const { corner } = PISGA_DXF;
  const shift = sheet === "roof" ? -152 : 0;
  return (q: Pt): [number, number] => [(q.x - left - corner.x - shift) / 100 + 0.88, (PISGA_DXF.frameY + corner.y - q.y) / 100 + 1.02];
};

const sheetPieces = (drawing: DxfDrawing, sheet: keyof typeof PISGA_DXF.sheets) => {
  const left = PISGA_DXF.sheets[sheet];
  const { frameY, width, height } = PISGA_DXF;
  return flattenDxf(drawing, entitiesWithin(drawing, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
};

/** The runs of parallel, equal, evenly spaced lines on a sheet: at least six, a tread 19–38 cm deep. */
export function dxfTreadSets(drawing: DxfDrawing, sheet: keyof typeof PISGA_DXF.sheets): TreadSet[] {
  const at = frame(sheet);
  const segs: Seg[] = [];
  for (const p of sheetPieces(drawing, sheet)) {
    if (!p.pts || p.text) continue;
    for (let i = 1; i < p.pts.length; i++) {
      const a = at(p.pts[i - 1]!);
      const b = at(p.pts[i]!);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.7 || len > 4.5) continue;
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang < 0) ang += Math.PI;
      if (ang >= Math.PI - 1e-6) ang -= Math.PI;
      segs.push({ a, b, len, ang, off: a[0] * -Math.sin(ang) + a[1] * Math.cos(ang), layer: p.layer });
    }
  }
  const groups = new Map<number, Seg[]>();
  for (const s of segs) {
    const k = Math.round((s.ang * 180) / Math.PI / 2);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: TreadSet[] = [];
  for (const g of groups.values()) {
    g.sort((p, q) => p.off - q.off);
    let run: Seg[] = [g[0]!];
    const flush = () => {
      if (run.length >= 6) {
        const f = run[0]!;
        const l = run[run.length - 1]!;
        const mid = (s: Seg): [number, number] => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
        const m0 = mid(f);
        const m1 = mid(l);
        const run2 = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]);
        const sign = (m1[0] - m0[0]) * -Math.sin(f.ang) + (m1[1] - m0[1]) * Math.cos(f.ang) >= 0 ? 1 : -1;
        out.push({
          n: run.length,
          width: run.reduce((t, s) => t + s.len, 0) / run.length,
          pitch: run2 / (run.length - 1),
          dir: [-Math.sin(f.ang) * sign, Math.cos(f.ang) * sign],
          first: m0,
          last: m1,
          layer: f.layer,
        });
      }
      run = [];
    };
    for (let i = 1; i < g.length; i++) {
      const gap = g[i]!.off - run[run.length - 1]!.off;
      if (gap > 0.19 && gap < 0.38 && Math.abs(g[i]!.len - run[run.length - 1]!.len) < 0.12) run.push(g[i]!);
      else if (gap >= 0.05) {
        flush();
        run = [g[i]!];
      }
    }
    flush();
  }
  return out;
}

export type SpotHeight = { x: number; z: number; level: number };

/** The level marks of a sheet: "+931.00" and "%%+931.28" are metres over the survey's zero, 923.20; "+11.86=935.06" gives its own. */
export function dxfSpotHeights(drawing: DxfDrawing, sheet: keyof typeof PISGA_DXF.sheets): SpotHeight[] {
  const at = frame(sheet);
  const out: SpotHeight[] = [];
  for (const p of sheetPieces(drawing, sheet)) {
    if (!p.text || !p.at) continue;
    const m = /(9[2-4]\d\.\d\d)/.exec(p.text);
    if (!m) continue;
    const [x, z] = at(p.at);
    out.push({ x, z, level: Number(m[1]) - 923.2 });
  }
  return out;
}

/**
 * A set of treads as a flight of solid steps: from its top at `top` metres down to `bottom`, the
 * steps as wide as the lines, each a block down to the ground.
 */
export function stairPrims(set: TreadSet, top: number, bottom: number, tag: string): Primitive[] {
  const out: Primitive[] = [];
  const rise = (top - bottom) / set.n;
  const ang = Math.atan2(set.dir[1], set.dir[0]);
  for (let k = 0; k < set.n; k++) {
    const t = k / Math.max(1, set.n - 1);
    const cx = set.first[0] + (set.last[0] - set.first[0]) * t;
    const cz = set.first[1] + (set.last[1] - set.first[1]) * t;
    const h = top - k * rise;
    const base = bottom - 0.4;
    out.push({ type: "box", centre: { x: cx, y: (h + base) / 2, z: cz }, size: { x: set.pitch, y: h - base, z: set.width }, rotY: -ang, material: "concrete", tag });
  }
  return out;
}
