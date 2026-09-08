import { isAxisAligned, segmentLength, type VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * The furniture the sheet actually draws, read out of the CAD.
 *
 * Every count this project argued about — how many beds, how many stools, is
 * there a bed in the ממ"ד — was a vision model looking at a picture and
 * answering differently each time. The sheet draws a bed as a closed rectangle
 * 93 by 218 units at a known place, and it says so identically every run.
 *
 * On דירה 14 this finds five beds at 93x218 and 218x93, wardrobes and counters
 * at 36-52 cm deep, and a bath — from geometry, with no model involved.
 */

export type FurnitureKind =
  | "bed"
  | "hob"
  | "sink"
  | "storage"
  | "counter"
  | "fixture"
  | "table"
  | "seat"
  | "unknown";

export type FurniturePiece = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: FurnitureKind;
  widthCm: number;
  depthCm: number;
};

type Edge = { at: number; a: number; b: number };

/**
 * Closed axis-aligned rectangles, which is how a CAD draws a piece of furniture.
 *
 * Two parallel edges that start and end together, with an edge closing each end.
 * Requiring all four means a hatch line or a dimension tick cannot qualify.
 */
export function findRectangles(
  segments: VectorSegment[],
  options: { unitsPerMetre: number; minSideM?: number; maxSideM?: number; tolerance?: number },
): Array<{ x: number; y: number; w: number; h: number }> {
  const upm = options.unitsPerMetre;
  const min = (options.minSideM ?? 0.3) * upm;
  const max = (options.maxSideM ?? 3.2) * upm;
  const tol = options.tolerance ?? 3;

  const horizontal: Edge[] = [];
  const vertical: Edge[] = [];
  for (const s of segments) {
    if (!isAxisAligned(s) || segmentLength(s) < min * 0.5) continue;
    if (Math.abs(s.y2 - s.y1) < Math.abs(s.x2 - s.x1)) {
      horizontal.push({ at: (s.y1 + s.y2) / 2, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) });
    } else {
      vertical.push({ at: (s.x1 + s.x2) / 2, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) });
    }
  }

  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < horizontal.length; i++) {
    for (let j = i + 1; j < horizontal.length; j++) {
      const top = horizontal[i]!;
      const bottom = horizontal[j]!;
      const depth = Math.abs(bottom.at - top.at);
      if (depth < min || depth > max) continue;
      // The two edges must be the same edge of the same object, not two things
      // that happen to line up: they start and end together.
      if (Math.abs(top.a - bottom.a) > tol * 3 || Math.abs(top.b - bottom.b) > tol * 3) continue;
      const x0 = Math.max(top.a, bottom.a);
      const x1 = Math.min(top.b, bottom.b);
      const width = x1 - x0;
      if (width < min || width > max) continue;
      const y0 = Math.min(top.at, bottom.at);
      const y1 = Math.max(top.at, bottom.at);
      const closes = (at: number) =>
        vertical.some((s) => Math.abs(s.at - at) < tol && s.a <= y0 + tol && s.b >= y1 - tol);
      if (closes(x0) && closes(x1)) out.push({ x: x0, y: y0, w: width, h: depth });
    }
  }
  return out;
}

/**
 * Drops the stair, which is a stack of rectangles and not a stack of furniture.
 *
 * The building stair on דירה 14 comes back as eleven rectangles sharing an x,
 * 93 cm wide, their heights stepping 247, 226, 205, 184 down to 58 — the treads,
 * each closed by the same pair of stringers. A flat does not contain eleven
 * nested wardrobes on one spot, and the internal staircase that had to be
 * repaired out of an earlier still came from exactly this.
 */
export function dropNested(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  minStack = 3,
): Array<{ x: number; y: number; w: number; h: number }> {
  const drop = new Set<number>();
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!;
    const sharing = rects.filter(
      (b, k) => k !== i && Math.abs(b.x - a.x) < 4 && Math.abs(b.w - a.w) < 8,
    );
    if (sharing.length + 1 >= minStack) drop.add(i);
  }
  return rects.filter((_, i) => !drop.has(i));
}

/** Keeps the largest rectangle wherever several describe one object. */
export function dedupeRectangles(
  rects: Array<{ x: number; y: number; w: number; h: number }>,
  cell = 4,
): Array<{ x: number; y: number; w: number; h: number }> {
  const seen = new Set<string>();
  const out: typeof rects = [];
  for (const r of [...rects].sort((a, b) => b.w * b.h - a.w * a.h)) {
    const key = `${Math.round(r.x / cell)},${Math.round(r.y / cell)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Names a rectangle from its size in centimetres.
 *
 * An Israeli single bed is 90x200 and draws at about 93x218 with its frame; a
 * wardrobe or a kitchen run is 36-60 deep and long; a bath is about 70x160.
 * Anything else is left unknown rather than guessed at — an unnamed block in the
 * right place is honest, and a bed invented in the wrong place is what this
 * pipeline has been apologising for all along.
 */
export function classifyPiece(widthCm: number, depthCm: number): FurnitureKind {
  const long = Math.max(widthCm, depthCm);
  const short = Math.min(widthCm, depthCm);
  if (short >= 80 && short <= 110 && long >= 185 && long <= 230) return "bed";
  if (short >= 60 && short <= 80 && long >= 140 && long <= 180) return "fixture";
  if (short >= 30 && short <= 62 && long >= 90 && long <= 320) return "storage";
  if (short >= 55 && short <= 75 && long >= 55 && long <= 75) return "fixture";
  // The dining table. It was being detected all along at 140x88 and named
  // "unknown", so the render put a nameless block in the dining area and the
  // model made nothing of it — the audit's "living and dining furniture omitted"
  // was a naming gap, not a detection one.
  if (short >= 75 && short <= 115 && long >= 120 && long <= 200) return "table";
  // A dining chair or an armchair: small and roughly square.
  if (short >= 38 && short <= 72 && long >= 38 && long <= 72) return "seat";
  if (short >= 80 && short <= 140 && long >= 140 && long <= 260) return "counter";
  return "unknown";
}

/**
 * A small square is only a toilet if it is standing in a wet room.
 *
 * classifyPiece reads size alone, so a 62 by 62 block came back "fixture"
 * wherever it stood — and the model dutifully turned a bedside table in a
 * bedroom into a toilet, three of them, in a still whose every other check
 * passed. The bath gives the wet rooms away: it is unmistakable at about 70 by
 * 160, and the pans and basins are the small squares near it.
 *
 * A small square with no bath nearby is demoted to a side piece rather than
 * dropped. It is something, and the plan drew it there.
 */
export function settleFixtures(pieces: FurniturePiece[], unitsPerMetre: number): FurniturePiece[] {
  const baths = pieces.filter(
    (p) => p.kind === "fixture" && Math.max(p.widthCm, p.depthCm) >= 120,
  );
  const reach = unitsPerMetre * 3;
  return pieces.map((p) => {
    if (p.kind !== "fixture" || Math.max(p.widthCm, p.depthCm) >= 120) return p;
    const near = baths.some(
      (b) =>
        Math.abs(b.x + b.w / 2 - (p.x + p.w / 2)) <= reach &&
        Math.abs(b.y + b.h / 2 - (p.y + p.h / 2)) <= reach,
    );
    return near ? p : { ...p, kind: "unknown" as const };
  });
}

/**
 * A flat has one dining table. Extra ones are something else the size matched.
 */
export function settleTables(pieces: FurniturePiece[]): FurniturePiece[] {
  const tables = pieces
    .filter((p) => p.kind === "table")
    .sort((a, b) => b.w * b.h - a.w * a.h);
  const keep = tables[0];
  return pieces.map((p) => (p.kind === "table" && p !== keep ? { ...p, kind: "unknown" as const } : p));
}

/**
 * Sanitary ware and sinks, which a CAD draws with curves rather than rectangles.
 *
 * findRectangles needs four straight sides, and a pan, a basin or a kitchen sink
 * has none: דירה 14 draws exactly one bath as a closed rectangle and every other
 * fixture as curves. The furniture pass therefore saw a single fixture in a flat
 * with two bathrooms and a kitchen, and the model was left to decide for itself
 * where the wet rooms are — it chose a bedroom and a terrace.
 *
 * A fixture is a compact knot of curves, so cluster the chords by proximity and
 * take each knot's bounding box. On this sheet that finds the pans and basins in
 * both bathrooms and the sink in the kitchen, all at the coordinates they are
 * drawn at.
 */
export function findCurveFixtures(
  curves: VectorSegment[],
  unitsPerMetre: number,
  options?: { cell?: number; minChords?: number; minCm?: number; maxCm?: number },
): FurniturePiece[] {
  const cell = options?.cell ?? 8;
  const minChords = options?.minChords ?? 4;
  if (curves.length === 0) return [];

  const parent = new Map<string, string>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const find = (a: string): string => {
    let n = a;
    while (parent.get(n) !== n) {
      parent.set(n, parent.get(parent.get(n)!)!);
      n = parent.get(n)!;
    }
    return n;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const cellsFor = (s: VectorSegment) => {
    const steps = Math.max(2, Math.ceil(segmentLength(s) / cell) * 2);
    const out = new Set<string>();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      out.add(key(s.x1 + (s.x2 - s.x1) * t, s.y1 + (s.y2 - s.y1) * t));
    }
    return [...out];
  };

  const perChord = curves.map(cellsFor);
  for (const cells of perChord) for (const c of cells) if (!parent.has(c)) parent.set(c, c);
  for (const cells of perChord) for (let i = 1; i < cells.length; i++) union(cells[0]!, cells[i]!);
  for (const k of [...parent.keys()]) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ] as const) {
      const n = `${x + dx},${y + dy}`;
      if (parent.has(n)) union(k, n);
    }
  }

  const groups = new Map<string, VectorSegment[]>();
  curves.forEach((s, i) => {
    const root = find(perChord[i]![0]!);
    groups.set(root, [...(groups.get(root) ?? []), s]);
  });

  const out: FurniturePiece[] = [];
  for (const list of groups.values()) {
    if (list.length < minChords) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of list) {
      minX = Math.min(minX, s.x1, s.x2);
      maxX = Math.max(maxX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxY = Math.max(maxY, s.y1, s.y2);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const widthCm = (w / unitsPerMetre) * 100;
    const depthCm = (h / unitsPerMetre) * 100;
    const short = Math.min(widthCm, depthCm);
    const long = Math.max(widthCm, depthCm);
    // A pan, a basin or a sink by default. The bounds are a parameter because a
    // hob's burners are the same shape an eighth of the size — 15 cm circles —
    // and the default floor of 28 cm rejected every one of them, so no hob was
    // ever found.
    const minCm = options?.minCm ?? 28;
    const maxCm = options?.maxCm ?? 150;
    if (short < minCm || short > Math.min(maxCm, 100) || long < minCm || long > maxCm) continue;
    out.push({ x: minX, y: minY, w, h, widthCm, depthCm, kind: "fixture" });
  }
  return out;
}

/**
 * The hob and the sink, which are what make a kitchen a kitchen.
 *
 * Both were being read as something else. The hob is four burners drawn as
 * circles inside a 64 by 64 cm square, and the square alone looked exactly like
 * a toilet or a basin, so it was classified as a sanitary fixture — a cooktop
 * marked as plumbing, in the one room that most needs telling apart. The sink is
 * two 32 by 64 cm basins side by side, which is precisely the "two basins" the
 * audit keeps asking for, and both were "unknown".
 *
 * A hob is the square with burners in it: four knots of curve inside a square of
 * the right size. Nothing else on a sales sheet looks like that.
 */
export function findKitchenFittings(
  segments: VectorSegment[],
  curves: VectorSegment[],
  unitsPerMetre: number,
): FurniturePiece[] {
  const rects = dedupeRectangles(dropNested(findRectangles([...segments, ...curves], {
    unitsPerMetre,
    minSideM: 0.25,
    maxSideM: 1.2,
  })));
  const burners = findCurveFixtures(curves, unitsPerMetre, {
    cell: 4,
    minChords: 3,
    minCm: 6,
    maxCm: 30,
  });

  const out: FurniturePiece[] = [];
  const basins: FurniturePiece[] = [];
  for (const r of rects) {
    const widthCm = (r.w / unitsPerMetre) * 100;
    const depthCm = (r.h / unitsPerMetre) * 100;
    const short = Math.min(widthCm, depthCm);
    const long = Math.max(widthCm, depthCm);

    if (short >= 50 && short <= 80 && long >= 50 && long <= 80) {
      const inside = burners.filter(
        (b) =>
          b.x + b.w / 2 >= r.x &&
          b.x + b.w / 2 <= r.x + r.w &&
          b.y + b.h / 2 >= r.y &&
          b.y + b.h / 2 <= r.y + r.h,
      ).length;
      if (inside >= 3) {
        out.push({ ...r, widthCm, depthCm, kind: "hob" });
        continue;
      }
    }
    // A basin: half as wide as it is deep, at worktop depth.
    if (short >= 26 && short <= 42 && long >= 52 && long <= 78) {
      basins.push({ ...r, widthCm, depthCm, kind: "sink" });
    }
  }

  // A kitchen sink is a pair of basins side by side. On its own, a rectangle of
  // that size is a bedside table, and two of דירה 14's bedside tables were
  // coming back as sinks.
  for (const basin of basins) {
    const paired = basins.some(
      (other) =>
        other !== basin &&
        Math.abs(other.x - basin.x) < Math.max(basin.w, basin.h) * 1.4 &&
        Math.abs(other.y - basin.y) < Math.max(basin.w, basin.h) * 1.4,
    );
    if (paired) out.push(basin);
  }
  return out;
}

/**
 * The chairs round a dining table, which a CAD draws with rounded corners.
 *
 * A chair is a knot of curve about 45 to 55 cm across — the same shape and size
 * as a washbasin, so it cannot be told apart on its own and calling every such
 * knot a fixture would put basins all over the living room. What tells them
 * apart is what they are next to: chairs stand round the table.
 *
 * The audit reads them as "island stools" and counts four to six; the pipeline
 * was finding two.
 */
export function findSeatsAroundTable(
  curves: VectorSegment[],
  table: FurniturePiece | undefined,
  unitsPerMetre: number,
  options?: { reachM?: number },
): FurniturePiece[] {
  if (!table) return [];
  const reach = (options?.reachM ?? 1.2) * unitsPerMetre;
  const knots = findCurveFixtures(curves, unitsPerMetre, {
    cell: 5,
    minChords: 3,
    minCm: 32,
    maxCm: 70,
  });
  return knots
    .filter((k) => {
      const cx = k.x + k.w / 2;
      const cy = k.y + k.h / 2;
      return (
        cx >= table.x - reach &&
        cx <= table.x + table.w + reach &&
        cy >= table.y - reach &&
        cy <= table.y + table.h + reach
      );
    })
    .map((k) => ({ ...k, kind: "seat" as const }));
}

export function findFurniture(
  segments: VectorSegment[],
  unitsPerMetre: number,
  options?: { curves?: VectorSegment[] },
): FurniturePiece[] {
  const rects = dedupeRectangles(dropNested(findRectangles(segments, { unitsPerMetre })));
  const pieces = rects.map((r) => {
    const widthCm = (r.w / unitsPerMetre) * 100;
    const depthCm = (r.h / unitsPerMetre) * 100;
    return { ...r, widthCm, depthCm, kind: classifyPiece(widthCm, depthCm) };
  });
  // Curve-drawn fixtures are added before settling, so a bath found as a
  // rectangle can vouch for the pans and basins clustered around it.
  const kitchen = findKitchenFittings(segments, options?.curves ?? [], unitsPerMetre);
  const table = pieces.find((p) => p.kind === "table");
  const seats = findSeatsAroundTable(options?.curves ?? [], table, unitsPerMetre);
  const withCurves = [
    ...kitchen,
    ...seats.filter(
      (s) => !kitchen.some((k) => Math.abs(k.x - s.x) < 4 && Math.abs(k.y - s.y) < 4),
    ),
    ...pieces.filter(
      (p) => !kitchen.some((k) => Math.abs(k.x - p.x) < 4 && Math.abs(k.y - p.y) < 4),
    ),
    ...findCurveFixtures(options?.curves ?? [], unitsPerMetre).filter(
      (c) =>
        !pieces.some((p) => Math.abs(p.x - c.x) < c.w && Math.abs(p.y - c.y) < c.h) &&
        // A chair is the same shape and size as a basin; the ones round the
        // table have already been claimed as seats.
        !seats.some((s) => Math.abs(s.x - c.x) < 4 && Math.abs(s.y - c.y) < 4),
    ),
  ];
  return settleTables(settleFixtures(withCurves, unitsPerMetre));
}

/**
 * The sheet's scale, read off the beds.
 *
 * Every other anchor tried here feeds back into itself. Solving the scale from
 * the enclosed floor area has two fixed points and settles on the wrong one,
 * because the wall detector's thresholds are in metres, so the scale decides
 * which walls are found, which decides the area: 43.2 units/m is exactly as
 * self-consistent as 56. Wall thickness is no better — swept across 36 to 72
 * units/m the median wall comes out 32 to 38 cm at every one of them, for the
 * same reason.
 *
 * A bed is not a property of the drawing. 90 by 200 cm is a fact about the
 * world, so the scale at which a sheet's rectangles read as beds is the sheet's
 * scale, and nothing about the detector can move it. On דירה 14 it is sharp:
 * no beds at all below 48 units/m or above 60, three to four across 52 to 60.
 */
export function scaleFromBeds(
  segments: VectorSegment[],
  options?: { from?: number; to?: number; step?: number },
): { unitsPerMetre: number; beds: number } | null {
  const from = options?.from ?? 36;
  const to = options?.to ?? 72;
  const step = options?.step ?? 2;
  let best: { unitsPerMetre: number; beds: number } | null = null;
  for (let upm = from; upm <= to; upm += step) {
    const beds = findFurniture(segments, upm).filter((p) => p.kind === "bed").length;
    if (beds > 0 && (!best || beds > best.beds)) best = { unitsPerMetre: upm, beds };
  }
  return best;
}
