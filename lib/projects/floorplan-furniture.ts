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
 * A flat has one dining table, and it is the one with chairs round it.
 *
 * Keeping the largest rectangle of table size picked the drawing's own legend —
 * the 136 by 86 cm box holding "111.29 מ"ר ברוטו" — on every run of דירה 14, and
 * the still came back with the dining table pushed against the kitchen where the
 * legend sits instead of in the middle of the living room where it is drawn.
 *
 * Chairs are the thing that tells a table from a box on the sheet, and they were
 * already being counted, just afterwards: the seats were looked for around
 * whichever candidate had already won on area. Asked first, they settle it — the
 * legend has none. If nothing has a chair beside it there is no dining table
 * here, which is a better answer than the legend.
 */
export function settleTables(
  pieces: FurniturePiece[],
  curves: VectorSegment[] = [],
  unitsPerMetre = 54,
  preferred?: FurniturePiece | null,
): FurniturePiece[] {
  const tables = pieces.filter((p) => p.kind === "table");
  if (tables.length === 0) return pieces;
  // A table built from the ring of chairs round it needs no seat test — the
  // ring is the seats. It would fail one anyway: this CAD draws a chair as four
  // corner arcs about 13 cm across, and the seat search looks for whole chairs
  // of 32 to 70 cm, so it finds none anywhere near the real dining table.
  let keep = preferred && tables.includes(preferred) ? preferred : undefined;
  if (!keep) {
    const scored = tables
      .map((table) => ({
        table,
        seats: findSeatsAroundTable(curves, table, unitsPerMetre).length,
      }))
      .sort(
        (a, b) => b.seats - a.seats || b.table.w * b.table.h - a.table.w * a.table.h,
      );
    const best = scored[0]!;
    // Rejecting on no seats only counts as evidence when there were chairs to
    // find. A sheet that carries no curve data at all says nothing either way,
    // and there the largest candidate is still the best guess available.
    keep = best.seats > 0 || curves.length === 0 ? best.table : undefined;
  }
  return pieces.map((p) =>
    p.kind === "table" && p !== keep ? { ...p, kind: "unknown" as const } : p,
  );
}

/**
 * The dining table, from the ring of chairs drawn round it.
 *
 * This CAD draws a chair as a rounded rectangle, and only its four corner arcs
 * reach the curve list — the straight sides are ordinary segments. So a chair
 * never clusters into one shape: דירה 14's dining chairs come through as ten
 * separate 11 by 15 cm knots, and no search for a chair-sized or table-sized
 * curve shape can find anything at all in the living room. The table itself is
 * drawn the same way and is equally invisible.
 *
 * The arrangement survives even though the objects do not. Corner knots sitting
 * in a ring, a couple of metres across, are chairs round a table — nothing else
 * on a flat's plan is laid out that way — and the table is the hole in the
 * middle, inset from the ring by the depth of a chair.
 */
export function findDiningTable(
  curves: VectorSegment[],
  unitsPerMetre: number,
  options?: { chairDepthM?: number },
): FurniturePiece | null {
  const chairDepth = (options?.chairDepthM ?? 0.42) * unitsPerMetre;
  const knots = findCurveFixtures(curves, unitsPerMetre, {
    cell: 5,
    minChords: 3,
    minCm: 6,
    maxCm: 36,
    maxShortCm: 36,
  });
  if (knots.length < 6) return null;
  const centres = knots.map((k) => ({ x: k.x + k.w / 2, y: k.y + k.h / 2 }));

  // Swept rather than fixed, because no single link distance separates the two
  // groups: דירה 14's dining chairs sit 1.00 m apart round the table and the
  // nearest armchair of the living-room suite is 1.09 m beyond the last of them.
  // Nine per cent is not a margin to hard-code, so the sweep asks each distance
  // in turn and keeps the largest group that is shaped like a dining set. Too
  // tight and the ring falls into pairs that fail the size gate; too loose and
  // it swallows the suite and fails it the other way. Only the distances that
  // isolate the ring produce anything at all.
  let best: FurniturePiece | null = null;
  let bestKnots = 0;
  for (let linkM = 0.55; linkM <= 1.45; linkM += 0.05) {
    const link = linkM * unitsPerMetre;
    const found = ringAt(knots, centres, link, chairDepth, unitsPerMetre);
    if (found && found.knots > bestKnots) {
      best = found.piece;
      bestKnots = found.knots;
    }
  }
  return best;
}

/** The dining ring at one link distance, or nothing if none is shaped like one. */
function ringAt(
  knots: FurniturePiece[],
  centres: Array<{ x: number; y: number }>,
  link: number,
  chairDepth: number,
  unitsPerMetre: number,
): { piece: FurniturePiece; knots: number } | null {
  const seen = new Array<boolean>(centres.length).fill(false);
  let best: { piece: FurniturePiece; knots: number } | null = null;
  for (let i = 0; i < centres.length; i++) {
    if (seen[i]) continue;
    const stack = [i];
    const group: number[] = [];
    seen[i] = true;
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (let j = 0; j < centres.length; j++) {
        if (seen[j]) continue;
        const dx = centres[cur]!.x - centres[j]!.x;
        const dy = centres[cur]!.y - centres[j]!.y;
        if (Math.hypot(dx, dy) > link) continue;
        seen[j] = true;
        stack.push(j);
      }
    }
    if (group.length < 6) continue;

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const g of group) {
      const k = knots[g]!;
      x0 = Math.min(x0, k.x);
      y0 = Math.min(y0, k.y);
      x1 = Math.max(x1, k.x + k.w);
      y1 = Math.max(y1, k.y + k.h);
    }
    const longCm = (Math.max(x1 - x0, y1 - y0) / unitsPerMetre) * 100;
    const shortCm = (Math.min(x1 - x0, y1 - y0) / unitsPerMetre) * 100;
    if (longCm < 120 || longCm > 360 || shortCm < 80 || shortCm > 260) continue;

    const x = x0 + chairDepth;
    const y = y0 + chairDepth;
    const w = x1 - x0 - chairDepth * 2;
    const h = y1 - y0 - chairDepth * 2;
    if (w < unitsPerMetre * 0.6 || h < unitsPerMetre * 0.6) continue;
    const piece: FurniturePiece = {
      x,
      y,
      w,
      h,
      widthCm: (w / unitsPerMetre) * 100,
      depthCm: (h / unitsPerMetre) * 100,
      kind: "table",
    };
    if (!best || group.length > best.knots) best = { piece, knots: group.length };
  }
  return best;
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
  options?: {
    cell?: number;
    minChords?: number;
    minCm?: number;
    maxCm?: number;
    maxShortCm?: number;
  },
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
    // The short side is capped separately, because a fixture is narrow and a
    // dining set is not. Folding the cap into maxCm at a flat 100 cm meant a
    // table with its chairs — 208 by 147 cm on this sheet — could never be
    // found, whatever maxCm was raised to.
    const maxShortCm = options?.maxShortCm ?? Math.min(maxCm, 100);
    if (short < minCm || short > maxShortCm || long < minCm || long > maxCm) continue;
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

/**
 * The rounded furniture, assembled from its corners.
 *
 * This is the piece of the drawing the pipeline had been blind to, and it is
 * most of what a living room contains. A CAD draws a chair, an armchair, a sofa
 * and a bar stool with rounded corners, and only the corner arcs reach the curve
 * list — the straight sides between them are ordinary segments. So a chair never
 * appears as a chair-shaped cluster of curve, and searching for one finds
 * nothing: דירה 14's living room came back with no seating at all, its dining
 * chairs missing, and none of the four stools at the island.
 *
 * What that left was a flat whose middle was bare floor, and bare floor is what
 * the model fills in for itself — the invented armchairs standing in the
 * entrance, and the "rooms full of nothing" the plan does not have. Detecting
 * the furniture is the fix for the invention, not a further instruction not to
 * invent.
 *
 * Corners are clustered instead of shapes. Four arcs within half a metre of each
 * other are one piece of furniture and its bounding box is the piece. The link
 * has to be shorter than the gap between neighbouring chairs — on this sheet
 * they stand 1.0 m apart and a chair is 0.5 m across — so 0.55 m separates them
 * and still holds each chair together.
 */
export function findRoundedFurniture(
  curves: VectorSegment[],
  unitsPerMetre: number,
  options?: { gapM?: number },
): FurniturePiece[] {
  // Measured between the arcs' edges, not their centres. Centre distance
  // depends on how big the arcs happen to be drawn — a small corner puts the
  // centres further apart on the same chair — so a fixed centre link held one
  // sheet's armchairs together and pulled another's apart. Edge to edge, the
  // number means the same thing everywhere: how much bare drawing lies between
  // two arcs. Half a metre keeps a chair whole and still leaves neighbouring
  // dining chairs, which stand a metre apart, separate.
  const gap = (options?.gapM ?? 0.5) * unitsPerMetre;
  const knots = findCurveFixtures(curves, unitsPerMetre, {
    cell: 4,
    minChords: 2,
    minCm: 4,
    maxCm: 40,
    maxShortCm: 40,
  });
  if (knots.length === 0) return [];

  const seen = new Array<boolean>(knots.length).fill(false);
  const out: FurniturePiece[] = [];
  for (let i = 0; i < knots.length; i++) {
    if (seen[i]) continue;
    const stack = [i];
    const group: number[] = [];
    seen[i] = true;
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (let j = 0; j < knots.length; j++) {
        if (seen[j]) continue;
        const a = knots[cur]!;
        const b = knots[j]!;
        const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
        const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
        if (Math.hypot(dx, dy) > gap) continue;
        seen[j] = true;
        stack.push(j);
      }
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const g of group) {
      const k = knots[g]!;
      x0 = Math.min(x0, k.x);
      y0 = Math.min(y0, k.y);
      x1 = Math.max(x1, k.x + k.w);
      y1 = Math.max(y1, k.y + k.h);
    }
    const w = x1 - x0;
    const h = y1 - y0;
    const widthCm = (w / unitsPerMetre) * 100;
    const depthCm = (h / unitsPerMetre) * 100;
    const short = Math.min(widthCm, depthCm);
    const long = Math.max(widthCm, depthCm);
    // A bar stool is drawn as a half disc about 30 by 60 cm, a chair and an
    // armchair as a square 40 to 90, a sofa as 90 to 250 long and up to 110
    // deep. Anything outside that is not seating.
    const stool = short >= 20 && short <= 45 && long >= 40 && long <= 80;
    const chair = short >= 38 && short <= 95 && long >= 38 && long <= 100;
    const sofa = short >= 45 && short <= 115 && long > 100 && long <= 260;
    if (!stool && !chair && !sofa) continue;
    out.push({ x: x0, y: y0, w, h, widthCm, depthCm, kind: "seat" });
  }
  return out;
}

/**
 * The chairs round a dining table, placed rather than found.
 *
 * Detecting each chair on this sheet does not work and the reason is structural:
 * a chair is a rounded rectangle whose four corner arcs are all that reach the
 * curve list, only two of them come through as separate knots, and the sliver
 * they bound is 15 by 35 cm — smaller than any chair. Growing the cluster onto
 * the straight sides recovers the chair and also merges neighbouring chairs into
 * columns and claims the bath and both basins.
 *
 * There is nothing to infer, though. The plan draws chairs round the table, the
 * table has been found, and where the chairs go follows from it: one at each
 * short end and a pair along each long side, which is the six דירה 14 draws.
 * Placing them is what fills the middle of the living room, and an empty middle
 * is what the model was inventing into.
 */
export function seatsAroundTable(
  table: FurniturePiece,
  unitsPerMetre: number,
  options?: { seatM?: number; gapM?: number; perSide?: number },
): FurniturePiece[] {
  const seat = (options?.seatM ?? 0.5) * unitsPerMetre;
  const gap = (options?.gapM ?? 0.06) * unitsPerMetre;
  const perSide = options?.perSide ?? 2;
  const vertical = table.h >= table.w;
  const longRun = vertical ? table.h : table.w;
  if (longRun < seat * perSide) return [];

  const make = (x: number, y: number, w: number, h: number): FurniturePiece => ({
    x,
    y,
    w,
    h,
    widthCm: (w / unitsPerMetre) * 100,
    depthCm: (h / unitsPerMetre) * 100,
    kind: "seat",
  });
  const out: FurniturePiece[] = [];
  for (let i = 0; i < perSide; i++) {
    // Spread evenly along the long side, centred on the run.
    const t = (i + 0.5) / perSide;
    if (vertical) {
      const cy = table.y + table.h * t - seat / 2;
      out.push(make(table.x - gap - seat, cy, seat, seat));
      out.push(make(table.x + table.w + gap, cy, seat, seat));
    } else {
      const cx = table.x + table.w * t - seat / 2;
      out.push(make(cx, table.y - gap - seat, seat, seat));
      out.push(make(cx, table.y + table.h + gap, seat, seat));
    }
  }
  // One at each end.
  if (vertical) {
    const cx = table.x + table.w / 2 - seat / 2;
    out.push(make(cx, table.y - gap - seat, seat, seat));
    out.push(make(cx, table.y + table.h + gap, seat, seat));
  } else {
    const cy = table.y + table.h / 2 - seat / 2;
    out.push(make(table.x - gap - seat, cy, seat, seat));
    out.push(make(table.x + table.w + gap, cy, seat, seat));
  }
  return out;
}

/**
 * The stools along a kitchen island, placed the same way and for the reason.
 *
 * The audit had been failing every finish on "island stools 0, plan has 3" and
 * it was right: nothing was looking for them. A stool on this sheet is a half
 * disc about 30 by 60 cm, which the rounded-furniture search rejects for being
 * under 35 cm deep, and widening that gate lets the sanitary ware in.
 *
 * The island is found reliably — a free-standing run 40 to 70 cm deep and 1.5 to
 * 3 m long — and the stools stand along whichever of its long sides faces the
 * room, which the caller knows and this does not.
 */
export function stoolsAlongRun(
  run: FurniturePiece,
  unitsPerMetre: number,
  side: "low" | "high",
  options?: { stoolM?: number; depthM?: number; gapM?: number },
): FurniturePiece[] {
  const stool = (options?.stoolM ?? 0.58) * unitsPerMetre;
  const depth = (options?.depthM ?? 0.3) * unitsPerMetre;
  const gap = (options?.gapM ?? 0.04) * unitsPerMetre;
  const vertical = run.h >= run.w;
  const longRun = vertical ? run.h : run.w;
  // Stools stand almost shoulder to shoulder: דירה 14 seats four along 228 cm,
  // which is 57 cm each. Spacing them at 1.35 times their width gave two.
  const count = Math.max(1, Math.round(longRun / (stool * 1.1)));
  const out: FurniturePiece[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    if (vertical) {
      const y = run.y + run.h * t - stool / 2;
      const x = side === "low" ? run.x - gap - depth : run.x + run.w + gap;
      out.push({
        x,
        y,
        w: depth,
        h: stool,
        widthCm: (depth / unitsPerMetre) * 100,
        depthCm: (stool / unitsPerMetre) * 100,
        kind: "seat",
      });
    } else {
      const x = run.x + run.w * t - stool / 2;
      const y = side === "low" ? run.y - gap - depth : run.y + run.h + gap;
      out.push({
        x,
        y,
        w: stool,
        h: depth,
        widthCm: (stool / unitsPerMetre) * 100,
        depthCm: (depth / unitsPerMetre) * 100,
        kind: "seat",
      });
    }
  }
  return out;
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
  // The drawn table before the rectangles' idea of one. A dining table on this
  // CAD is rounded, so it reaches neither the rectangle list nor the curve list
  // as a shape — it has to be inferred from the ring of chairs round it — while
  // the rectangle that does look like a table is the drawing's legend box.
  const ring = findDiningTable(options?.curves ?? [], unitsPerMetre);
  const table = ring ?? pieces.find((p) => p.kind === "table");
  const seats = findSeatsAroundTable(options?.curves ?? [], table, unitsPerMetre);
  const withCurves = [
    ...(ring ? [ring] : []),
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
  return settleTables(
    settleFixtures(withCurves, unitsPerMetre),
    options?.curves ?? [],
    unitsPerMetre,
    ring,
  );
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
