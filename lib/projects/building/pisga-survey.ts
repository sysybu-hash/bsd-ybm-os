import { flattenDxf, type DxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";

/**
 * The site survey of 25.12.2022 (668-mgr302-251222, the surveyor's DWG saved as DXF): Israeli grid metres, the existing ground as it stands
 * with the kindergarten, both side stairs, kerbs, walls, fences and poles. Its layers are the survey code's (M…), its labels DOS Hebrew.
 *
 * The plan frame is a translation of the grid: the shared layers M2407 and M2200, which the architect's DXF carries on its site sheet,
 * land on each other within a centimetre with x = X − 211647.33, z = 604179.70 − Y. Levels are over ±0.00 = 923.20.
 */
export const SURVEY_FRAME = { x0: 211647.33, y0: 604179.7, datum: 923.2 };

export type SurveySpot = { x: number; z: number; level: number; layer: string };
export type SurveyLine = { pts: Array<[number, number]>; layer: string; closed: boolean };
export type SurveyMark = { x: number; z: number; layer: string; block: string; rot: number; text: string; level?: number };

export type PisgaSurvey = {
  /** Ground and paving heights: points (M1502), stair and wall heads (M2651), control points (C1610/C1611), manhole covers (M4804, M4610). */
  spots: SurveySpot[];
  /** Roof and floor levels of buildings (M2221, M2220): not the ground. */
  roofs: SurveySpot[];
  lines: SurveyLine[];
  marks: SurveyMark[];
};

export const toPlan = (p: { x: number; y: number }): [number, number] => [p.x - SURVEY_FRAME.x0, SURVEY_FRAME.y0 - p.y];

const DOS_HEBREW = (() => {
  const m = new Map<string, string>();
  const dec = new TextDecoder("windows-1252");
  // The reader hands some of these bytes over as windows-1252 letters (‚ for 0x82) and others as the bare C1 code (U+008C for 0x8C, a
  // ל): both map. Left out, "סלעים" read "סעים" and "מחסום" "חסום".
  for (let b = 0x80; b <= 0x9a; b++) {
    m.set(dec.decode(new Uint8Array([b])), String.fromCharCode(0x5d0 + b - 0x80));
    m.set(String.fromCharCode(b), String.fromCharCode(0x5d0 + b - 0x80));
  }
  return m;
})();
/** A survey label in logical order: its DOS Hebrew bytes, read as windows-1252, are letters typed right to left. */
export function surveyText(raw: string): string {
  const s = [...raw].map((c) => DOS_HEBREW.get(c) ?? c).join("");
  return /[א-ת]/.test(s) ? [...s].reverse().join("").trim() : s.trim();
}

const LEVEL_TEXT = /^9\d\d\.\d\d?$/;
// M2651 is a wall's head and foot, two points a few centimetres apart a storey apart (925.54 over 924.77 at the east stair): a wall's, not the ground's.
const GROUND_LAYERS = new Set(["M1502", "M2651", "C1610", "C1610_0", "M4804", "M4610", "M4001"]);
export const WALL_SPOT_LAYER = "M2651";
const ROOF_LAYERS = new Set(["M2221", "M2220"]);
/** The sheet's frame, legend, tables and cadastre: nothing that stands on the site. */
const NOT_SITE = /^(C1680|C169\d|SCELLNO|Mcellno|migrashim|TR_|tr_|declaration|Tcontours|Mrozeta|0)$/;

export function readPisgaSurvey(drawing: DxfDrawing): PisgaSurvey {
  const spots: SurveySpot[] = [];
  const roofs: SurveySpot[] = [];
  const lines: SurveyLine[] = [];
  const marks: SurveyMark[] = [];
  const pieces: DxfPiece[] = flattenDxf(drawing);
  for (const p of pieces) {
    if (p.type === "INSERT" && p.at) {
      const [x, z] = toPlan(p.at);
      const h = p.attribs?.find((a) => a.tag === "HEIGHT" && LEVEL_TEXT.test(a.text.trim()));
      const level = h ? Number(h.text) - SURVEY_FRAME.datum : undefined;
      if (level != null && ROOF_LAYERS.has(p.layer)) roofs.push({ x, z, level, layer: p.layer });
      else if (level != null && GROUND_LAYERS.has(p.layer)) spots.push({ x, z, level, layer: p.layer });
      const text = p.attribs?.find((a) => a.tag === "MARK" || a.tag === "TEXT")?.text ?? "";
      if (!NOT_SITE.test(p.layer)) marks.push({ x, z, layer: p.layer, block: p.insert ?? "", rot: p.rot ?? 0, text: surveyText(text), level });
      continue;
    }
    // Pieces inside a block are its symbol (a cross, a tree's circle), not lines on the site.
    if (p.path.length || !p.pts || p.pts.length < 2 || NOT_SITE.test(p.layer)) continue;
    lines.push({ pts: p.pts.map(toPlan), layer: p.layer, closed: !!p.closed });
  }
  return { spots, roofs, lines, marks };
}

type Tri = [number, number, number];

/** Delaunay triangles of the points (Bowyer–Watson): a surveyor's ground model is the TIN of their spots. */
function delaunay(pts: Array<[number, number]>): Tri[] {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const d = Math.max(maxX - minX, maxZ - minZ) * 20;
  const all: Array<[number, number]> = [...pts, [minX - d, minZ - d], [maxX + d * 2, minZ - d], [minX - d, maxZ + d * 2]];
  const n = pts.length;
  let tris: Array<{ t: Tri; cx: number; cz: number; r2: number }> = [];
  const circ = (t: Tri) => {
    const [a, b, c] = [all[t[0]]!, all[t[1]]!, all[t[2]]!];
    const D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) || 1e-12;
    const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / D;
    const uz = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / D;
    return { t, cx: ux, cz: uz, r2: (a[0] - ux) ** 2 + (a[1] - uz) ** 2 };
  };
  tris.push(circ([n, n + 1, n + 2]));
  for (let i = 0; i < n; i++) {
    const [px, pz] = all[i]!;
    const bad = tris.filter((q) => (px - q.cx) ** 2 + (pz - q.cz) ** 2 < q.r2);
    const edges = new Map<string, [number, number]>();
    for (const q of bad) {
      for (const [a, b] of [[q.t[0], q.t[1]], [q.t[1], q.t[2]], [q.t[2], q.t[0]]] as const) {
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        if (edges.has(k)) edges.delete(k);
        else edges.set(k, [a, b]);
      }
    }
    tris = tris.filter((q) => !bad.includes(q));
    for (const [a, b] of edges.values()) tris.push(circ([a, b, i]));
  }
  return tris.map((q) => q.t).filter((t) => t.every((k) => k < n));
}

/**
 * The surveyed ground as a function of plan position: linear over the TIN of the ground spots, null outside their hull.
 * Two spots closer than 20 cm are one (a wall's foot beside its head reads as a cliff otherwise): the lower stands.
 */
export function surveyGround(survey: PisgaSurvey): (x: number, z: number) => number | null {
  const kept: SurveySpot[] = [];
  for (const s of [...survey.spots].filter((q) => q.layer !== WALL_SPOT_LAYER).sort((a, b) => a.level - b.level)) {
    if (!kept.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < 0.2)) kept.push(s);
  }
  const tris = delaunay(kept.map((s) => [s.x, s.z]));
  const cell = 5;
  const index = new Map<string, Tri[]>();
  for (const t of tris) {
    const [a, b, c] = [kept[t[0]]!, kept[t[1]]!, kept[t[2]]!];
    for (let i = Math.floor(Math.min(a.x, b.x, c.x) / cell); i <= Math.floor(Math.max(a.x, b.x, c.x) / cell); i++) {
      for (let j = Math.floor(Math.min(a.z, b.z, c.z) / cell); j <= Math.floor(Math.max(a.z, b.z, c.z) / cell); j++) {
        const k = `${i},${j}`;
        (index.get(k) ?? index.set(k, []).get(k)!).push(t);
      }
    }
  }
  return (x, z) => {
    for (const t of index.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []) {
      const [a, b, c] = [kept[t[0]]!, kept[t[1]]!, kept[t[2]]!];
      const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(det) < 1e-9) continue;
      const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det;
      const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
      const l3 = 1 - l1 - l2;
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * a.level + l2 * b.level + l3 * c.level;
    }
    return null;
  };
}

/** The survey's lines on one layer, as two-point segments. */
export function surveySegments(survey: PisgaSurvey, layer: string): Array<[[number, number], [number, number]]> {
  const out: Array<[[number, number], [number, number]]> = [];
  for (const l of survey.lines) {
    if (l.layer !== layer) continue;
    const pts = l.closed ? [...l.pts, l.pts[0]!] : l.pts;
    for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]) > 0.01) out.push([pts[i - 1]!, pts[i]!]);
  }
  return out;
}

/** The lot (the parcel layer M1803's ring round the kindergarten): the largest closed parcel; the side stairs stand in parcels of their own. */
export function surveyPlot(survey: PisgaSurvey): Array<[number, number]> | null {
  const area = (r: Array<[number, number]>) => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]!; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const rings = survey.lines.filter((l) => l.layer === "M1803" && l.closed).map((l) => l.pts);
  return rings.sort((a, b) => area(b) - area(a))[0] ?? null;
}

/** The surveyed ground anywhere: the TIN inside the spots' hull, inverse-distance weighting of the nearest spots outside it. */
export function surveyGroundEverywhere(survey: PisgaSurvey): (x: number, z: number) => number {
  const tin = surveyGround(survey);
  const spots = survey.spots.filter((s) => s.layer !== WALL_SPOT_LAYER);
  return (x, z) => {
    const t = tin(x, z);
    if (t != null) return t;
    let w = 0, h = 0;
    for (const s of spots) {
      const d2 = (x - s.x) ** 2 + (z - s.z) ** 2 + 0.25;
      const k = 1 / (d2 * d2);
      w += k;
      h += k * s.level;
    }
    return h / w;
  };
}
