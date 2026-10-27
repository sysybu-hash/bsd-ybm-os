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
    // A note's frame (the text layer) is no tread, however it lines up with them.
    if (!p.pts || p.text || /^טקסט/.test(p.layer)) continue;
    for (let i = 1; i < p.pts.length; i++) {
      const a = at(p.pts[i - 1]!);
      const b = at(p.pts[i]!);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 0.25 || len > 6.5) continue;
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang < 0) ang += Math.PI;
      // A line drawn a hair off level, right to left, is at 179.99°: it is the same direction as one at 0°.
      if (ang >= Math.PI - 0.01) ang -= Math.PI;
      segs.push({ a, b, len, ang, off: a[0] * -Math.sin(ang) + a[1] * Math.cos(ang), layer: p.layer });
    }
  }
  const groups = new Map<number, Seg[]>();
  for (const s of segs) {
    const k = Math.round((s.ang * 180) / Math.PI / 2);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out: TreadSet[] = [];
  for (const g0 of groups.values()) {
    // One tread drawn in pieces — the halves either side of a middle handrail, or the same line on two layers — is one row:
    // the pieces on one line (within 2 cm: an outline 5 cm off a tread is not the tread) are joined into one segment over their whole span, when they overlap or meet within 30 cm.
    g0.sort((p, q) => p.off - q.off);
    const g: Seg[] = [];
    for (let i = 0; i < g0.length; ) {
      let j = i;
      while (j + 1 < g0.length && g0[j + 1]!.off - g0[i]!.off < 0.02) j++;
      const line = g0.slice(i, j + 1);
      const c = Math.cos(line[0]!.ang);
      const sn = Math.sin(line[0]!.ang);
      const spans = line.map((s) => [Math.min(s.a[0] * c + s.a[1] * sn, s.b[0] * c + s.b[1] * sn), Math.max(s.a[0] * c + s.a[1] * sn, s.b[0] * c + s.b[1] * sn), s] as const).sort((p, q) => p[0] - q[0]);
      let cur: [number, number, Seg, Seg[]] | null = null;
      const close = () => {
        if (!cur) return;
        const [u0, u1, s, parts] = cur;
        const len = u1 - u0;
        if (len >= 0.7 && len <= 6.5) g.push({ ...s, a: [u0 * c - s.off * sn, u0 * sn + s.off * c], b: [u1 * c - s.off * sn, u1 * sn + s.off * c], len });
        // A tread whose line runs on into a wall's face is too long joined: its own pieces stand.
        else if (len > 6.5) g.push(...parts.filter((q) => q.len >= 0.7 && q.len <= 6.5));
      };
      for (const sp of spans) {
        if (cur && sp[0] <= cur[1] + 0.3) cur = [cur[0], Math.max(cur[1], sp[1]), cur[2], [...cur[3], sp[2]]];
        else {
          close();
          cur = [sp[0], sp[1], sp[2], [sp[2]]];
        }
      }
      close();
      i = j + 1;
    }
    g.sort((p, q) => p.off - q.off);
    if (g.length === 0) continue;
    let run: Seg[] = [g[0]!];
    const flush = () => {
      // Six lines make a stair of any layer; on the sheets' own stair layer (מדרגוט) three do — a landing's short flight.
      if (run.length >= (/^מדרגוט/.test(run[0]?.layer ?? "") ? 3 : 6)) {
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
    // Each tread's next is the nearest line 19–42 cm on, of its length (within 12 cm) and lying over it (80% of its span), at the
    // run's own going (within 4 cm): lines between them that belong to something else (a wall's face, a note's leader) are passed over.
    const span = (s: Seg) => {
      const c = Math.cos(s.ang);
      const sn = Math.sin(s.ang);
      const u = [s.a[0] * c + s.a[1] * sn, s.b[0] * c + s.b[1] * sn];
      return [Math.min(u[0]!, u[1]!), Math.max(u[0]!, u[1]!)] as const;
    };
    const used = new Set<Seg>();
    for (const start of g) {
      if (used.has(start)) continue;
      run = [start];
      let going = 0;
      for (;;) {
        const last = run[run.length - 1]!;
        const [l0, l1] = span(last);
        const next = g
          .filter((s) => !used.has(s) && !run.includes(s))
          .filter((s) => {
            const gap = s.off - last.off;
            if (gap <= 0.19 || gap >= 0.42 || Math.abs(s.len - last.len) >= 0.12) return false;
            if (going && Math.abs(gap - going) > 0.04) return false;
            const [s0, s1] = span(s);
            return Math.min(l1, s1) - Math.max(l0, s0) >= 0.8 * Math.min(l1 - l0, s1 - s0);
          })
          .sort((p, q) => p.off - q.off)[0];
        if (!next) break;
        if (!going) going = next.off - last.off;
        run.push(next);
      }
      if (run.length >= (/^מדרגוט/.test(run[0]!.layer) ? 3 : 6)) run.forEach((s) => used.add(s));
      flush();
    }
  }
  // One flight with a tread line the sheet leaves out (under a cut line, a note) reads as two runs: runs on one axis, of one width and
  // going, whose ends are two or three goings apart, are one flight.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = 0; j < out.length && !merged; j++) {
        const a = out[i]!;
        const b = out[j]!;
        if (i === j || Math.abs(a.width - b.width) > 0.1 || Math.abs(a.pitch - b.pitch) > 0.03 || a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] < 0.99) continue;
        const gx = b.first[0] - a.last[0];
        const gz = b.first[1] - a.last[1];
        const along = gx * a.dir[0] + gz * a.dir[1];
        const across = Math.abs(-gx * a.dir[1] + gz * a.dir[0]);
        const k = Math.round(along / a.pitch);
        if (across > 0.1 || k < 2 || k > 3 || Math.abs(along - k * a.pitch) > 0.06) continue;
        const n = a.n + b.n + k - 1;
        out[i] = { ...a, n, last: b.last, pitch: Math.hypot(b.last[0] - a.first[0], b.last[1] - a.first[1]) / (n - 1) };
        out.splice(j, 1);
        merged = true;
      }
    }
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
export function stairPrims(set: TreadSet, top: number, bottom: number, tag: string, material: "concrete" | "stone" = "concrete", base = bottom - 0.4, walled = false): Primitive[] {
  const out: Primitive[] = [];
  const rise = (top - bottom) / set.n;
  const ang = Math.atan2(set.dir[1], set.dir[0]);
  for (let k = 0; k < set.n; k++) {
    const t = k / Math.max(1, set.n - 1);
    const cx = set.first[0] + (set.last[0] - set.first[0]) * t;
    const cz = set.first[1] + (set.last[1] - set.first[1]) * t;
    const h = top - k * rise;
    out.push({ type: "box", centre: { x: cx, y: (h + base) / 2, z: cz }, size: { x: set.pitch, y: h - base, z: set.width }, rotY: -ang, material, tag });
  }
  // A handrail up each side ("מאחז יד" on the sheets): one continuous rail a metre over the treads, from the first to the last, in fine sections so it follows the slope; a post every four treads.
  const perp: [number, number] = [-set.dir[1], set.dir[0]];
  // A flight four metres wide or more has a rail down its middle too.
  for (const side of set.width >= 4 ? [-1, 0, 1] : [-1, 1]) {
    const sub = set.n * 3;
    for (let q = 0; q < sub; q++) {
      const t = (q + 0.5) / sub;
      const px = set.first[0] + (set.last[0] - set.first[0]) * t + perp[0] * side * (set.width / 2 - 0.04);
      const pz = set.first[1] + (set.last[1] - set.first[1]) * t + perp[1] * side * (set.width / 2 - 0.04);
      const h = top - rise * (t * (set.n - 1)) ;
      out.push({ type: "box", centre: { x: px, y: h + 0.95, z: pz }, size: { x: (set.pitch * set.n) / sub + 0.02, y: 0.05, z: 0.05 }, rotY: -ang, material: "frame", tag: `${tag}-rail` });
    }
    // Against a side wall (`walled`) the handrail is fixed to the wall: no posts of its own, which would stand a second guard beside it.
    if (walled && side !== 0) continue;
    for (let k = 0; k < set.n; k += 4) {
      const t = k / Math.max(1, set.n - 1);
      const px = set.first[0] + (set.last[0] - set.first[0]) * t + perp[0] * side * (set.width / 2 - 0.04);
      const pz = set.first[1] + (set.last[1] - set.first[1]) * t + perp[1] * side * (set.width / 2 - 0.04);
      const h = top - k * rise;
      out.push({ type: "box", centre: { x: px, y: h + 0.475, z: pz }, size: { x: 0.045, y: 0.95, z: 0.045 }, material: "frame", tag: `${tag}-rail` });
    }
  }
  return out;
}


/** A railing along a line at `level`: 1.1 m, a top rail, a post every 1.6 m, bars every 12 cm. */
export function railingPrims(a: [number, number], b: [number, number], level: number, tag: string, height = 1.1): Primitive[] {
  const out: Primitive[] = [];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.3) return out;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const mid = { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
  out.push({ type: "box", centre: { x: mid.x, y: level + height, z: mid.z }, size: { x: len, y: 0.05, z: 0.06 }, rotY: -ang, material: "frame", tag });
  const n = Math.max(1, Math.round(len / 0.12));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const post = k % 13 === 0 || k === n;
    out.push({ type: "box", centre: { x: a[0] + (b[0] - a[0]) * t, y: level + height / 2, z: a[1] + (b[1] - a[1]) * t }, size: { x: post ? 0.07 : 0.018, y: height, z: post ? 0.07 : 0.018 }, material: "frame", tag });
  }
  return out;
}

/**
 * The courtyard's south wall, where the survey (layer M2602, floor −1's sheet) draws it: the outer face's line, west to east, from the
 * courtyard's west corner to the entrance stair. The survey draws the wall as two lines 35 cm apart; its lines along the street are
 * taken, the inner one (with a partner 20–50 cm south of it) left out. Empty when the sheet has none.
 */
export function dxfCourtyardWall(drawing: DxfDrawing, x0 = -11.5, x1 = 24.2): Array<[number, number]> {
  const at = frame("floor-1");
  const segs: Array<[[number, number], [number, number]]> = [];
  for (const p of sheetPieces(drawing, "floor-1")) {
    if (!p.pts || p.text || p.layer !== "M2602" || p.pts.length !== 2) continue;
    let a = at(p.pts[0]!);
    let b = at(p.pts[1]!);
    if (a[0] > b[0]) [a, b] = [b, a];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.3 || Math.abs(b[1] - a[1]) > 0.3 * (b[0] - a[0]) || b[0] < x0 || a[0] > x1 || a[1] < 19 || a[1] > 23) continue;
    segs.push([a, b]);
  }
  const zAt = (s: [[number, number], [number, number]], x: number) => s[0][1] + ((s[1][1] - s[0][1]) * (x - s[0][0])) / (s[1][0] - s[0][0] || 1);
  const outer = segs.filter((s) => {
    const mx = (s[0][0] + s[1][0]) / 2;
    return !segs.some((q) => q !== s && q[0][0] <= mx && q[1][0] >= mx && zAt(q, mx) - zAt(s, mx) > 0.2 && zAt(q, mx) - zAt(s, mx) < 0.5);
  });
  const line: Array<[number, number]> = [];
  for (const [a, b] of outer.sort((p, q) => p[0][0] - q[0][0])) {
    const last = line[line.length - 1];
    if (!last || Math.hypot(last[0] - a[0], last[1] - a[1]) > 0.05) line.push(a);
    line.push(b);
  }
  return line.filter((q) => q[0] >= x0 - 0.5 && q[0] <= x1 + 0.5);
}

/**
 * The main entrance (floor −1's sheet, "מדרגוט" and "קו נסטר עליון"): the stair core's flight from floor −1 up to the entrance
 * landing, the landing, and the flight from the landing up to the street, where the sheet draws them; their levels are the
 * marks beside them. Null when the sheet's treads are not found, so the hand-set flights stay.
 */
export function dxfEntrancePrims(drawing: DxfDrawing, floorMinus1: number, street: number): Primitive[] | null {
  const sets = dxfTreadSets(drawing, "floor-1").filter((s) => s.width > 5 && Math.abs(s.dir[0]) < 0.05);
  const mid = (s: TreadSet) => (s.first[1] + s.last[1]) / 2;
  const core = sets.find((s) => Math.abs((s.first[0] + s.last[0]) / 2 - 27.4) < 1.5 && mid(s) > 11 && mid(s) < 17.5);
  const entry = sets.find((s) => Math.abs((s.first[0] + s.last[0]) / 2 - 27.4) < 1.5 && mid(s) > 17.5 && mid(s) < 23);
  if (!core || !entry) return null;
  const spots = dxfSpotHeights(drawing, "floor-1");
  const mark = (x: number, z: number, lo: number, hi: number, fallback: number) =>
    spots.filter((q) => q.level > lo && q.level < hi).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0]?.level ?? fallback;
  const cx = (core.first[0] + core.last[0]) / 2;
  const landing = mark(cx, (core.last[1] + entry.first[1]) / 2, 14, 16, 15.01);
  const top = mark(cx, entry.last[1] + 1, landing + 1, landing + 4, street);
  // Both flights climb south: the treads listed from the top down.
  const down = (s: TreadSet): TreadSet => (s.dir[1] > 0 ? { ...s, first: s.last, last: s.first, dir: [-s.dir[0], -s.dir[1]] } : s);
  const out: Primitive[] = [];
  const x0 = cx - core.width / 2;
  const x1 = cx + core.width / 2;
  const boxOf = (z0: number, z1: number, y0: number, y1: number, material: "stone" | "concrete", tag: string): Primitive =>
    ({ type: "box", centre: { x: cx, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 }, material, tag });
  // n tread lines are n + 1 risers: the flight's top block is one riser under the landing.
  const riseCore = (landing - floorMinus1) / (core.n + 1);
  out.push(...stairPrims(down(core), landing - riseCore, floorMinus1 + riseCore, "floor-1:inside:stair", "stone", floorMinus1, true));
  const zLand0 = Math.max(core.first[1], core.last[1]) + core.pitch / 2;
  const zLand1 = Math.min(entry.first[1], entry.last[1]) - entry.pitch / 2;
  out.push(boxOf(zLand0, zLand1, landing - 0.4, landing, "stone", "floor-1:inside:stair"));
  const riseEntry = (top - landing) / (entry.n + 1);
  const zTop = Math.max(entry.first[1], entry.last[1]) + entry.pitch / 2;
  out.push(...stairPrims(down(entry), top - riseEntry, landing + riseEntry, "site:entry-stair", "stone", landing - 0.4, true));
  // The flight's own head: the street's paving up to the treads.
  out.push(boxOf(zTop, zTop + 0.6, top - 0.4, top, "stone", "site:entry-stair"));
  // Its side walls (the sheet's 20 cm stone walls either side) and the slab under the landing and the entry flight, over the courtyard.
  for (const x of [x0 - 0.2, x1]) out.push({ type: "box", centre: { x: x + 0.1, y: (8.2 + top + 1) / 2, z: (zLand0 + zTop) / 2 }, size: { x: 0.2, y: top + 1 - 8.2, z: zTop - zLand0 }, material: "stone", tag: "site:entry-stair" });
  out.push(boxOf(zLand0, zTop, 8.2, landing - 0.4, "concrete", "site:entry-stair"));
  return out;
}
