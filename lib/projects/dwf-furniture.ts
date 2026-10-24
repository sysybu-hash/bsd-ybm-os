import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { findRectangles, seatsAroundTable, type FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { readDwfSanitary } from "@/lib/projects/dwf-sanitary";

/**
 * The furniture a permit plan draws, read as a permit plan draws it.
 *
 * The sales-sheet rules classify a rectangle by its size alone, and on a
 * permit plan that goes wrong in the first bedroom: a wardrobe is drawn as a
 * 160 × 60 box with an X across it — a bath's size — and a bed with its
 * pillow, its fold and a desk beside it closes a 280 × 186 rectangle round
 * the lot. So each rectangle is read with what is drawn in it and the room it
 * stands in:
 *
 * - a box with both diagonals is a wardrobe;
 * - 80–110 by 180–215 is a single bed; two 55–75 by 155–210 boxes side by side
 *   are a double bed;
 * - a row of cushions, 40–65 deep, in a living room is a sofa;
 * - 75–115 by 120–240 in a living room or kitchen is a table;
 * - in a wet room, 65–95 square is a shower tray and 60–80 by 140–185 a bath,
 *   60 square a washing machine;
 * - 50–70 by 90–160 with nothing across it in a bedroom is a desk;
 * - a rectangle that holds a number is a label's box, and one that encloses
 *   two other pieces is their outline, not a piece.
 */
type Rect = { x: number; y: number; w: number; h: number };

export function readDwfFurniture(
  sheet: DwfGeometry,
  upm: number,
  roomKindAt: (x: number, y: number) => FloorplanRoomKind | null | undefined,
  inFlat: (x: number, y: number) => boolean,
  wallAt?: (x: number, y: number) => boolean,
): FurniturePiece[] {
  const cm = (v: number) => (v / upm) * 100;
  // The drawing names its furniture (a DXF's blocks): that is the furniture,
  // with the worktops — lines, not blocks — read as before under its sinks and hobs.
  if (sheet.furniture?.length) {
    // A pair of mirrored homes is parted at its axis, not by the rooms the
    // plan was segmented into: a DXF's hatch strokes cut its rooms finer, the
    // second home claimed half of the first one's, and its bedrooms stood
    // bare (Gottlieb A, 12/10/2026). The axis is the furniture's own mirror
    // line; this home is the side most of whose pieces it holds.
    const all = sheet.furniture;
    const cx = (p: { x: number; w: number }) => p.x + p.w / 2;
    const axis = all.reduce((t, p) => t + cx(p), 0) / all.length;
    const twins = all.filter((p) => all.some((q) => q !== p && q.kind === p.kind && Math.abs(cx(q) - (2 * axis - cx(p))) < 0.3 * upm && Math.abs(q.y + q.h / 2 - (p.y + p.h / 2)) < 0.3 * upm)).length;
    const mine = all.filter((p) => inFlat(cx(p), p.y + p.h / 2));
    const left = mine.filter((p) => cx(p) < axis).length;
    const side = twins >= 0.75 * all.length && mine.length ? (left >= mine.length - left ? -1 : 1) : 0;
    const drawn: FurniturePiece[] = all
      .filter((p) => (side ? Math.sign(cx(p) - axis) === side : inFlat(cx(p), p.y + p.h / 2)))
      .map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, kind: p.kind, widthCm: cm(p.w), depthCm: cm(p.h), drawn: true, ...(p.fixture ? { fixture: p.fixture } : {}) }));
    // The worktops this home's side holds: read across the whole floor, parted at the same axis.
    const read = readDwfFurniture({ ...sheet, furniture: undefined }, upm, roomKindAt, side ? () => true : inFlat, wallAt).filter((p) => !side || Math.sign(p.x + p.w / 2 - axis) === side);
    // A worktop runs from the drawn sink and hob: one far from both is a ledge or a line of the floor.
    const nearCooking = (p: FurniturePiece) => drawn.some((d) => (d.kind === "sink" || d.kind === "hob") && Math.hypot(d.x + d.w / 2 - (p.x + p.w / 2), d.y + d.h / 2 - (p.y + p.h / 2)) < 2.2 * upm);
    const overlap = (d: FurniturePiece, p: FurniturePiece) => Math.max(0, Math.min(d.x + d.w, p.x + p.w) - Math.max(d.x, p.x)) * Math.max(0, Math.min(d.y + d.h, p.y + p.h) - Math.max(d.y, p.y));
    // A worktop never runs through a table or its chairs: lines read off a
    // drawn kitchen table stood a counter over Gottlieb A's (13/10/2026).
    const counters = read.filter(
      (p) =>
        p.kind === "counter" &&
        nearCooking(p) &&
        !drawn.some((d) => overlap(d, p) > ((d.kind === "table" || d.kind === "seat") ? 0.1 : 0.5) * p.w * p.h),
    );
    return [...drawn, ...counters];
  }
  const all = findRectangles(sheet.segments, { unitsPerMetre: upm, minSideM: 0.25, maxSideM: 5 }).filter((r) =>
    inFlat(r.x + r.w / 2, r.y + r.h / 2),
  );
  // Near-identical rectangles (a double line, a stroke drawn twice) are one.
  const rects: Rect[] = [];
  for (const r of all.sort((a, b) => b.w * b.h - a.w * a.h)) {
    const same = rects.some((q) => Math.abs(q.x - r.x) < 0.04 * upm && Math.abs(q.y - r.y) < 0.04 * upm && Math.abs(q.w - r.w) < 0.06 * upm && Math.abs(q.h - r.h) < 0.06 * upm);
    if (!same) rects.push(r);
  }
  const inside = (p: Rect, r: Rect, slack = 0.02 * upm) =>
    p !== r && p.x >= r.x - slack && p.y >= r.y - slack && p.x + p.w <= r.x + r.w + slack && p.y + p.h <= r.y + r.h + slack;
  const diagonals = (r: Rect) =>
    sheet.segments.filter(
      (s) =>
        Math.abs(s.x2 - s.x1) > r.w * 0.8 &&
        Math.abs(s.y2 - s.y1) > r.h * 0.8 &&
        Math.min(s.x1, s.x2) >= r.x - 1 &&
        Math.max(s.x1, s.x2) <= r.x + r.w + 1 &&
        Math.min(s.y1, s.y2) >= r.y - 1 &&
        Math.max(s.y1, s.y2) <= r.y + r.h + 1,
    ).length;
  const labelled = (r: Rect) => sheet.texts.some((t) => /^\s*\d/.test(t.text) && t.x > r.x && t.x < r.x + r.w && t.y - t.height / 2 > r.y && t.y - t.height / 2 < r.y + r.h);

  const out: Array<FurniturePiece & { rect: Rect }> = [];
  const piece = (r: Rect, kind: FurniturePiece["kind"], fixture?: FurniturePiece["fixture"]) => {
    out.push({ ...r, kind, widthCm: cm(r.w), depthCm: cm(r.h), rect: r, ...(fixture ? { fixture } : {}) });
  };
  const taken = new Set<Rect>();
  const overlap = (a: Rect, b: Rect) => {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ox > 0 && oy > 0 ? (ox * oy) / Math.min(a.w * a.h, b.w * b.h) : 0;
  };
  // A piece claims what is drawn inside it and anything drawn over it.
  const take = (r: Rect) => {
    taken.add(r);
    for (const q of rects) if (inside(q, r) || overlap(q, r) > 0.5) taken.add(q);
  };
  const dims = (r: Rect) => [Math.min(cm(r.w), cm(r.h)), Math.max(cm(r.w), cm(r.h))] as const;

  // Pans and basins first: a rectangle round one is the room's outline or a
  // vanity, never a bath — on דירה 10 the bathroom's inner faces, split by a
  // partition, closed two 180 cm "baths" round its pan and its basin.
  const sanitary = readDwfSanitary(sheet, upm, roomKindAt, inFlat, rects);
  const holdsSanitary = (r: Rect) =>
    sanitary.some((f) => {
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h && f.w * f.h < r.w * r.h * 0.8;
    });

  // A floor tile: a rectangle crossed edge to edge by two or more grid lines and empty between them.
  const isTile = (q: Rect) => {
    // Or a row of the tiling itself: its two long edges are two of a run of
    // like lines at its own spacing, the floor's grid. Gottlieb A's second
    // bedroom's one row of tiles along its wall was read as a shelf, and the
    // wardrobe drawn beside it went unread (12/10/2026).
    {
      const wide = q.w >= q.h;
      const step = wide ? q.h : q.w;
      const [lo, hi] = wide ? [q.x, q.x + q.w] : [q.y, q.y + q.h];
      const base = wide ? q.y : q.x;
      if (step > 0.2 * upm && step < 0.7 * upm) {
        const lineAt = (at: number) =>
          sheet.segments.some((sg) =>
            wide
              ? Math.abs(sg.y2 - sg.y1) < 0.01 * upm && Math.abs(sg.y1 - at) < 0.02 * upm && Math.min(sg.x1, sg.x2) <= lo + 0.05 * upm && Math.max(sg.x1, sg.x2) >= hi - 0.05 * upm
              : Math.abs(sg.x2 - sg.x1) < 0.01 * upm && Math.abs(sg.x1 - at) < 0.02 * upm && Math.min(sg.y1, sg.y2) <= lo + 0.05 * upm && Math.max(sg.y1, sg.y2) >= hi - 0.05 * upm,
          );
        const run = [-3, -2, -1, 2, 3, 4].filter((k) => lineAt(base + k * step)).length;
        if (run >= 3) return true;
      }
    }
    const inside = sheet.segments.filter((sg) => Math.min(sg.x1, sg.x2) >= q.x - 1 && Math.max(sg.x1, sg.x2) <= q.x + q.w + 1 && Math.min(sg.y1, sg.y2) >= q.y - 1 && Math.max(sg.y1, sg.y2) <= q.y + q.h + 1).length;
    if (inside >= 20) return false;
    return (
      sheet.segments.filter((sg) => {
        const h = Math.abs(sg.y2 - sg.y1) < 0.01 * upm;
        const v = Math.abs(sg.x2 - sg.x1) < 0.01 * upm;
        if (h) return Math.min(sg.x1, sg.x2) <= q.x + 0.02 * upm && Math.max(sg.x1, sg.x2) >= q.x + q.w - 0.02 * upm && sg.y1 > q.y + 0.1 * upm && sg.y1 < q.y + q.h - 0.1 * upm;
        if (v) return Math.min(sg.y1, sg.y2) <= q.y + 0.02 * upm && Math.max(sg.y1, sg.y2) >= q.y + q.h - 0.02 * upm && sg.x1 > q.x + 0.1 * upm && sg.x1 < q.x + q.w - 0.1 * upm;
        return false;
      }).length >= 1 ||
      // Or one of a run of like rectangles laid edge to edge: the tiling's rows.
      rects.filter((o) => o !== q && Math.abs(o.w - q.w) < 0.03 * upm && Math.abs(o.h - q.h) < 0.03 * upm && ((Math.abs(o.x - q.x) < 0.03 * upm && Math.abs(Math.abs(o.y - q.y) - q.h) < 0.03 * upm) || (Math.abs(o.y - q.y) < 0.03 * upm && Math.abs(Math.abs(o.x - q.x) - q.w) < 0.03 * upm))).length >= 1
    );
  };
  // Largest first, so an item claims what is drawn inside it.
  const order = [...rects].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const r of order) {
    if (taken.has(r) || labelled(r)) continue;
    const [s, l] = dims(r);
    const room = roomKindAt(r.x + r.w / 2, r.y + r.h / 2);
    const wet = room === "bathroom" || room === "utility";
    if (diagonals(r) >= 2 && s >= 40 && s <= 80 && l >= 80 && l <= 500) {
      piece(r, "storage");
      take(r);
      continue;
    }
    const sleeping = room === "bedroom" || room === "mmd";
    // A tile: crossed edge to edge by the floor's grid lines, and empty between them. A
    // drawn bed or mattress is filled — its hatch, its fold, its pillow — whatever crosses it.
    const filled = (q: Rect) =>
      sheet.segments.filter((sg) => Math.min(sg.x1, sg.x2) >= q.x - 1 && Math.max(sg.x1, sg.x2) <= q.x + q.w + 1 && Math.min(sg.y1, sg.y2) >= q.y - 1 && Math.max(sg.y1, sg.y2) <= q.y + q.h + 1).length >= 20;
    const crossed = (q: Rect, min = 2) =>
      !filled(q) &&
      sheet.segments.filter((sg) => {
        const h = Math.abs(sg.y2 - sg.y1) < 0.01 * upm;
        const v = Math.abs(sg.x2 - sg.x1) < 0.01 * upm;
        if (h) return Math.min(sg.x1, sg.x2) <= q.x + 0.02 * upm && Math.max(sg.x1, sg.x2) >= q.x + q.w - 0.02 * upm && sg.y1 > q.y + 0.1 * upm && sg.y1 < q.y + q.h - 0.1 * upm;
        if (v) return Math.min(sg.y1, sg.y2) <= q.y + 0.02 * upm && Math.max(sg.y1, sg.y2) >= q.y + q.h - 0.02 * upm && sg.x1 > q.x + 0.1 * upm && sg.x1 < q.x + q.w - 0.1 * upm;
        return false;
      }).length >= min;
    // A bed drawn whole — filled, its pillow's rounded corners in it — is a bed in whatever room it stands; the room is then a bedroom (dwf-flat).
    const pillowIn = (q: Rect) => (sheet.arcs ?? []).filter((c) => cm(c.r) >= 3 && cm(c.r) <= 7 && c.cx > q.x && c.cx < q.x + q.w && c.cy > q.y && c.cy < q.y + q.h).length >= 4;
    if (!sleeping && room !== "bathroom" && room !== "kitchen" && s >= 80 && s <= 100 && l >= 190 && l <= 210 && filled(r) && pillowIn(r)) {
      piece(r, "bed");
      take(r);
      continue;
    }
    // A double bed's width is told by its two pillows; a wide box without them is the floor's tiles.
    if (sleeping && s >= 60 && s <= 200 && l >= 175 && l <= 215 && !crossed(r) && (s <= 105 || pillowIn(r))) {
      piece(r, "bed");
      take(r);
      continue;
    }
    // A single bed drawn as its mattress, 120–170 long, the pillow drawn apart
    // at one end: the bed is 195 long, run on to the end that stays in the room.
    if (sleeping && s >= 65 && s <= 100 && l >= 120 && l < 175 && !labelled(r) && filled(r) && !crossed(r, 3) && !out.some((p) => overlap(p.rect, r) > 0.2)) {
      const grow = (1.95 * upm) - Math.max(r.w, r.h);
      const along = r.w >= r.h;
      // The pillow's end is where the drawn mattress stops short of a wall: the bed runs on to that wall.
      const toWall = (dir: 1 | -1) => {
        const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
        const from = along ? (dir > 0 ? r.x + r.w : r.x) : dir > 0 ? r.y + r.h : r.y;
        for (let d = 0.02 * upm; d <= 0.7 * upm; d += 0.02 * upm) {
          const [ex, ey] = along ? [from + dir * d, cy] : [cx, from + dir * d];
          if ((wallAt?.(ex, ey) ?? false) || roomKindAt(ex, ey) !== room) return d;
        }
        return null;
      };
      const [dF, dB] = [toWall(1), toWall(-1)];
      const dir: 1 | -1 | null = dB != null && (dF == null || dB <= dF) ? -1 : dF != null ? 1 : null;
      const reach = dir == null ? grow : Math.min(grow, (dir > 0 ? dF : dB)!);
      const bed = dir == null ? null : along ? (dir > 0 ? { ...r, w: r.w + reach } : { ...r, x: r.x - reach, w: r.w + reach }) : dir > 0 ? { ...r, h: r.h + reach } : { ...r, y: r.y - reach, h: r.h + reach };
      // Its pillow is drawn in the part the bed was run on over: else it is not a bed.
      if (bed && pillowIn(bed)) {
        piece(bed, "bed");
        take(r);
        continue;
      }
    }
    // A bath can close a small region of its own, with no name: it is a
    // bath wherever a wet room's size and shape says so.
    if ((wet || room == null) && s >= 50 && s <= 82 && l >= 130 && l <= 185 && !holdsSanitary(r)) {
      piece(r, "fixture", "bath");
      take(r);
      continue;
    }
    if (wet && s >= 65 && s <= 100 && l <= 105 && !holdsSanitary(r)) {
      piece(r, "fixture", "shower");
      take(r);
      continue;
    }
    if (wet && s >= 50 && s <= 64 && l <= 66) {
      piece(r, "storage");
      take(r);
      continue;
    }
    // A house's sheet draws its tables with their chairs (below): a bare box is no table there.
    if (!(sheet.arcs ?? []).length && (room === "living" || room === "kitchen") && s >= 75 && s <= 115 && l >= 120 && l <= 240) {
      piece(r, "table");
      take(r);
      continue;
    }
  }
  // A bed whose mattress the rectangle finder does not close (Gottlieb's
  // upper bedrooms, a hatched mattress): its pillow is drawn, a rounded box —
  // four arcs of 3–7 cm — 15–45 by 35–80 cm, at the bed's head against a wall.
  // The bed runs from it 195 cm away from that wall, as wide as the pillow is long and 15 cm more.
  {
    const corners = (sheet.arcs ?? []).filter((q) => cm(q.r) >= 3 && cm(q.r) <= 7 && (roomKindAt(q.cx, q.cy) === "bedroom" || roomKindAt(q.cx, q.cy) === "mmd") && inFlat(q.cx, q.cy));
    const used = new Set<(typeof corners)[number]>();
    for (const c of corners) {
      if (used.has(c)) continue;
      const near = corners.filter((q) => !used.has(q) && q.cx >= c.cx - 0.01 * upm && q.cy >= c.cy - 0.01 * upm && q.cx - c.cx <= 0.8 * upm && q.cy - c.cy <= 0.8 * upm);
      const xs = [...new Set(near.map((q) => Math.round(q.cx / (0.02 * upm))))];
      const ys = [...new Set(near.map((q) => Math.round(q.cy / (0.02 * upm))))];
      if (near.length < 4 || xs.length !== 2 || ys.length !== 2) continue;
      const r0 = Math.max(...near.map((q) => q.r));
      const box = { x: Math.min(...near.map((q) => q.cx)) - r0, y: Math.min(...near.map((q) => q.cy)) - r0, w: 0, h: 0 };
      box.w = Math.max(...near.map((q) => q.cx)) + r0 - box.x;
      box.h = Math.max(...near.map((q) => q.cy)) + r0 - box.y;
      const [ps, pl] = dims(box);
      if (ps < 15 || ps > 45 || pl < 35 || pl > 80) continue;
      for (const q of near) used.add(q);
      if (out.some((p) => p.kind === "bed" && Math.hypot(p.x + p.w / 2 - (box.x + box.w / 2), p.y + p.h / 2 - (box.y + box.h / 2)) < 1.1 * upm)) continue;
      // The bed lies across the pillow's short side; its head is at the wall nearer the pillow.
      const along = box.w < box.h; // the bed runs along x where the pillow stands tall
      const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
      const wallDist = (dir: 1 | -1) => {
        for (let d = 0; d <= 0.6 * upm; d += 0.02 * upm) {
          const [ex, ey] = along ? [cx + dir * d, cy] : [cx, cy + dir * d];
          if ((wallAt?.(ex, ey) ?? false) || roomKindAt(ex, ey) == null) return d;
        }
        return Infinity;
      };
      const head: 1 | -1 = wallDist(-1) <= wallDist(1) ? -1 : 1;
      const wide = Math.max(box.w, box.h) + 0.15 * upm;
      const long = 1.95 * upm;
      const start = along ? (head < 0 ? box.x : box.x + box.w) : head < 0 ? box.y : box.y + box.h;
      const bed = along
        ? { x: head < 0 ? start : start - long, y: cy - wide / 2, w: long, h: wide }
        : { x: cx - wide / 2, y: head < 0 ? start : start - long, w: wide, h: long };
      if (roomKindAt(bed.x + bed.w / 2, bed.y + bed.h / 2) !== roomKindAt(cx, cy)) continue;
      for (let i = out.length - 1; i >= 0; i--) if ((out[i]!.kind === "desk" || out[i]!.kind === "storage") && overlap(out[i]!.rect, bed) > 0.3) out.splice(i, 1);
      out.push({ ...bed, kind: "bed", widthCm: cm(bed.w), depthCm: cm(bed.h), rect: bed });
    }
  }
  // Double beds drawn as two mattresses side by side.
  const mats = order.filter((r) => !taken.has(r) && (() => { const [s, l] = dims(r); return s >= 50 && s <= 76 && l >= 155 && l <= 212; })());
  for (const a of mats) {
    if (taken.has(a)) continue;
    const b = mats.find((q) => q !== a && !taken.has(q) && Math.abs(q.y - a.y) < 0.06 * upm && Math.abs(q.h - a.h) < 0.08 * upm && Math.abs(q.x - (a.x + a.w)) < 0.06 * upm);
    if (!b) continue;
    const u = { x: a.x, y: Math.min(a.y, b.y), w: b.x + b.w - a.x, h: Math.max(a.h, b.h) };
    piece(u, "bed");
    take(a);
    take(b);
    for (const q of rects) if (inside(q, u)) taken.add(q);
  }
  // Sofas: cushions in a row in the living room.
  const cushions = order.filter((r) => {
    if (taken.has(r)) return false;
    const [s, l] = dims(r);
    return roomKindAt(r.x + r.w / 2, r.y + r.h / 2) === "living" && s >= 40 && s <= 66 && l >= 45 && l <= 100 && !isTile(r);
  });
  const used = new Set<Rect>();
  for (const c of cushions) {
    if (used.has(c)) continue;
    const vertical = c.h > c.w;
    const row = cushions.filter(
      (q) =>
        !used.has(q) &&
        (vertical ? Math.abs(q.x - c.x) < 0.04 * upm && Math.abs(q.w - c.w) < 0.06 * upm : Math.abs(q.y - c.y) < 0.04 * upm && Math.abs(q.h - c.h) < 0.06 * upm),
    );
    // Contiguous along the row.
    row.sort((p, q) => (vertical ? p.y - q.y : p.x - q.x));
    const chain = [row[0]!];
    for (const q of row.slice(1)) {
      const last = chain[chain.length - 1]!;
      const gap = vertical ? q.y - (last.y + last.h) : q.x - (last.x + last.w);
      if (gap < 0.08 * upm && gap > -0.5 * (vertical ? q.h : q.w)) chain.push(q);
    }
    if (chain.length < 2) continue;
    const x0 = Math.min(...chain.map((q) => q.x));
    const y0 = Math.min(...chain.map((q) => q.y));
    const x1 = Math.max(...chain.map((q) => q.x + q.w));
    const y1 = Math.max(...chain.map((q) => q.y + q.h));
    const u = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (Math.max(cm(u.w), cm(u.h)) < 120) continue;
    if (out.some((p) => overlap(p.rect, u) > 0.5)) continue;
    // Three or more deep boxes in a row are cabinets — a bookcase, a sideboard — not cushions.
    const deepRow = chain.length >= 3 && chain.every((q) => dims(q)[0] >= 50 && dims(q)[1] >= 70);
    piece(u, deepRow ? "storage" : "seat");
    for (const q of chain) used.add(q);
    for (const q of cushions) if (overlap(q, u) > 0.5) used.add(q);
    for (const q of rects) if (inside(q, u)) taken.add(q);
  }
  // Desks in bedrooms: 50–70 deep, 90–160 long, nothing across them.
  for (const r of order) {
    if (taken.has(r) || used.has(r) || labelled(r)) continue;
    const [s, l] = dims(r);
    const room = roomKindAt(r.x + r.w / 2, r.y + r.h / 2);
    // A desk is drawn as a bare white box: one with the floor's hatch through it is the floor.
    const hatch = sheet.segments.filter((sg) => Math.abs(sg.x2 - sg.x1) > 0.01 * upm && Math.abs(sg.y2 - sg.y1) > 0.01 * upm && (sg.x1 + sg.x2) / 2 > r.x && (sg.x1 + sg.x2) / 2 < r.x + r.w && (sg.y1 + sg.y2) / 2 > r.y && (sg.y1 + sg.y2) / 2 < r.y + r.h).length;
    const plain = hatch <= 10 && sheet.segments.filter((sg) => Math.min(sg.x1, sg.x2) >= r.x - 1 && Math.max(sg.x1, sg.x2) <= r.x + r.w + 1 && Math.min(sg.y1, sg.y2) >= r.y - 1 && Math.max(sg.y1, sg.y2) <= r.y + r.h + 1).length < 60;
    if ((room === "bedroom" || room === "mmd") && s >= 45 && s <= 80 && l >= 90 && l <= 165 && plain && !isTile(r) && !out.some((p) => inside(r, p.rect))) {
      piece(r, "desk");
      take(r);
    }
  }
  // Worktops: an open kitchen's run is drawn as a single line 55–65 cm off
  // the wall it stands against, in the living room. Where two runs meet they
  // make an L.
  if (wallAt) {
    const step = 0.05 * upm;
    for (const seg of sheet.segments) {
      const horizontal = Math.abs(seg.y2 - seg.y1) < 0.01 * upm;
      const vertical = Math.abs(seg.x2 - seg.x1) < 0.01 * upm;
      if (!horizontal && !vertical) continue;
      const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      const room = roomKindAt(mx, my);
      // A bedroom's wardrobe is drawn the same way: its doors' line 40–70 cm off the wall, closed at its ends to the wall.
      const sleepingRoom = room === "bedroom" || room === "mmd";
      if (len < (sleepingRoom ? 0.4 : 1.0) * upm || len > 7 * upm) continue;
      if (room !== "living" && room !== "kitchen" && !sleepingRoom) continue;
      const at = (t: number) => [seg.x1 + (seg.x2 - seg.x1) * t, seg.y1 + (seg.y2 - seg.y1) * t] as const;
      if (!inFlat(...at(0.08)) || !inFlat(...at(0.92))) continue;
      for (const side of [-1, 1]) {
        // The wall's face at 55–65 cm, clear floor before it, all along.
        let hits = 0;
        let samples = 0;
        for (let t = 0.1; t <= 0.9; t += 0.1) {
          const px = seg.x1 + (seg.x2 - seg.x1) * t;
          const py = seg.y1 + (seg.y2 - seg.y1) * t;
          samples++;
          let face = -1;
          for (let d = step; d <= 0.75 * upm; d += step / 2) {
            const qx = horizontal ? px : px + side * d;
            const qy = horizontal ? py + side * d : py;
            if (wallAt(qx, qy)) { face = d; break; }
          }
          if (face >= (sleepingRoom ? 0.4 : 0.5) * upm && face <= 0.7 * upm) hits++;
        }
        if (hits < samples * 0.7) continue;
        if (sleepingRoom) {
          // Closed at an end: a line from the doors' line to the wall.
          const ends = horizontal ? [Math.min(seg.x1, seg.x2), Math.max(seg.x1, seg.x2)] : [Math.min(seg.y1, seg.y2), Math.max(seg.y1, seg.y2)];
          const closed = sheet.segments.some((o) => {
            const ov = horizontal ? Math.abs(o.x2 - o.x1) < 0.01 * upm : Math.abs(o.y2 - o.y1) < 0.01 * upm;
            if (!ov) return false;
            const at2 = horizontal ? o.x1 : o.y1;
            if (!ends.some((e) => Math.abs(e - at2) < 0.03 * upm)) return false;
            const [o0, o1] = horizontal ? [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)] : [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)];
            const line = horizontal ? seg.y1 : seg.x1;
            return o1 - o0 >= 0.35 * upm && Math.abs((side > 0 ? o0 : o1) - line) < 0.03 * upm;
          });
          if (!closed) continue;
        }
        // A floor's tiling repeats the line every 60 cm, a worktop's front
        // does not: a line with its like beyond it, away from the wall, is
        // the tiling — read as a worktop it stood a counter along a living
        // room's party wall (Gottlieb A).
        const tiled = sheet.segments.some((o) => {
          if (o === seg) return false;
          const oh = Math.abs(o.y2 - o.y1) < 0.01 * upm;
          if (oh !== horizontal) return false;
          const off = horizontal ? (o.y1 - seg.y1) * -side : (o.x1 - seg.x1) * -side;
          if (off < 0.5 * upm || off > 0.7 * upm) return false;
          const [p0, p1] = horizontal ? [Math.min(seg.x1, seg.x2), Math.max(seg.x1, seg.x2)] : [Math.min(seg.y1, seg.y2), Math.max(seg.y1, seg.y2)];
          const [q0, q1] = horizontal ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
          return Math.min(p1, q1) - Math.max(p0, q0) > 0.7 * (p1 - p0);
        });
        // Or any tiling's grid: like lines repeating at one spacing, 25–70 cm,
        // away from the wall — Gottlieb A's 38 cm tiles stood a shelf in a
        // bedroom where the sheet draws only its floor (12/10/2026).
        const offsets = sheet.segments
          .filter((o) => o !== seg && (Math.abs(o.y2 - o.y1) < 0.01 * upm) === horizontal)
          .filter((o) => {
            const [p0, p1] = horizontal ? [Math.min(seg.x1, seg.x2), Math.max(seg.x1, seg.x2)] : [Math.min(seg.y1, seg.y2), Math.max(seg.y1, seg.y2)];
            const [q0, q1] = horizontal ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
            return Math.min(p1, q1) - Math.max(p0, q0) > 0.7 * (p1 - p0);
          })
          .map((o) => (horizontal ? (o.y1 - seg.y1) * -side : (o.x1 - seg.x1) * -side) / upm)
          .filter((d) => d > 0.2 && d < 1.5);
        const grid = offsets.some((d) => d >= 0.25 && d <= 0.7 && offsets.some((e) => Math.abs(e - 2 * d) < 0.03));
        if (tiled || grid) break;
        const depth = 0.6 * upm;
        const x0 = Math.min(seg.x1, seg.x2);
        const y0 = Math.min(seg.y1, seg.y2);
        const r = horizontal
          ? { x: x0, y: side > 0 ? y0 : y0 - depth, w: len, h: depth }
          : { x: side > 0 ? x0 : x0 - depth, y: y0, w: depth, h: len };
        if (out.some((p) => overlap(p.rect, r) > 0.4)) continue;
        if (sleepingRoom) {
          // As deep as drawn: to the wall.
          let face = 0.55 * upm;
          for (let d = step; d <= 0.75 * upm; d += step / 2) {
            const [qx, qy] = horizontal ? [mx, my + side * d] : [mx + side * d, my];
            if (wallAt(qx, qy)) { face = d; break; }
          }
          const w = horizontal ? { x: x0, y: side > 0 ? y0 : y0 - face, w: len, h: face } : { x: side > 0 ? x0 : x0 - face, y: y0, w: face, h: len };
          // A wardrobe's inside is not drawn: the floor's hatch running on through the box is the floor, the line something else.
          const hatched = sheet.segments.filter((sg) => Math.abs(sg.x2 - sg.x1) > 0.01 * upm && Math.abs(sg.y2 - sg.y1) > 0.01 * upm && Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) < 0.5 * upm && (sg.x1 + sg.x2) / 2 > w.x && (sg.x1 + sg.x2) / 2 < w.x + w.w && (sg.y1 + sg.y2) / 2 > w.y && (sg.y1 + sg.y2) / 2 < w.y + w.h).length;
          if (hatched <= 6 && !out.some((p) => overlap(p.rect, w) > 0.3)) piece(w, "storage");
          break;
        }
        piece(r, "counter");
        break;
      }
    }
    // A tall box a fridge's size beside a worktop.
    for (const r of order) {
      if (taken.has(r) || labelled(r)) continue;
      const [s2, l2] = dims(r);
      const room = roomKindAt(r.x + r.w / 2, r.y + r.h / 2);
      if ((room === "kitchen" || (room === "living" && !sheet.arcs?.length)) && s2 >= 60 && s2 <= 90 && l2 >= 65 && l2 <= 95) {
        const near = out.some((p) => p.kind === "counter" && Math.hypot(p.x + p.w / 2 - (r.x + r.w / 2), p.y + p.h / 2 - (r.y + r.h / 2)) < 3.5 * upm);
        if (near) {
          piece(r, "storage");
          take(r);
        }
      }
    }
  }
  // A kitchen as a house's sheet draws it, read off its arcs — the pieces
  // drawn with rounded corners that the rectangle finder does not close
  // (Gottlieb's kitchens): a sink is a rounded box round its drain, a small
  // circle; a hob, its burners, three or four rings close together; a chair,
  // four small rounded corners. A table drawn narrower than a dining table's
  // 75 cm is a table where its chairs are drawn at its sides.
  // A worktop's pieces stand by the wall, where the room's own pixels may stop
  // short of them: an arc is the kitchen's where the room is at it or 40 cm
  // off it — Gottlieb's hob, on the worktop at the wall, fell out of its flat.
  const kitchenNear = (x: number, y: number) => {
    const d = 0.4 * upm;
    return ([[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]] as const).some(([dx, dy]) => {
      const room = roomKindAt(x + dx, y + dy);
      // A kitchen the sheet draws in a room it does not name one — an upper
      // floor's second kitchen (Gottlieb B) — is a kitchen all the same: any
      // room but a wet room or a bedroom.
      return room !== "bathroom" && room !== "utility" && room !== "bedroom" && room !== "mmd" && inFlat(x + dx, y + dy);
    });
  };
  const arcs = (sheet.arcs ?? []).filter((a) => kitchenNear(a.cx, a.cy));
  const rcm = (a: { r: number }) => cm(a.r);
  const smallest = (x: number, y: number, lo: number, hi: number) =>
    rects
      .filter((r) => !taken.has(r) && x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h && dims(r)[0] >= lo && dims(r)[1] <= hi)
      .sort((p, q) => p.w * p.h - q.w * q.h)[0];
  // Chairs: four rounded corners of 1.2–6.5 cm radius — a dining chair's back
  // corners are drawn larger than its front ones — their centres a 20–40 cm square.
  const corners = arcs.filter((a) => rcm(a) >= 1.2 && rcm(a) <= 6.5);
  const chairs: Rect[] = [];
  const cornerUsed = new Set<(typeof corners)[number]>();
  for (const a of corners) {
    void cornerUsed;
    // A chair's corners: this one, and the nearest corner column and row beyond it — a chair beside another shares a column.
    const near0 = corners.filter((b) => Math.abs(b.cx - a.cx) <= 0.42 * upm && Math.abs(b.cy - a.cy) <= 0.42 * upm && b.cx >= a.cx - 0.01 * upm && b.cy >= a.cy - 0.01 * upm);
    const key = (v: number) => Math.round(v / (0.02 * upm));
    // At least 12 cm on: a chair's inner and outer corners lie a few centimetres apart.
    const nx = [...new Set(near0.map((b) => key(b.cx)))].filter((v) => v >= key(a.cx) + 6).sort((p, q) => p - q)[0];
    const ny = [...new Set(near0.map((b) => key(b.cy)))].filter((v) => v >= key(a.cy) + 6).sort((p, q) => p - q)[0];
    if (nx == null || ny == null) continue;
    const near = near0.filter((b) => (Math.abs(key(b.cx) - key(a.cx)) <= 2 || Math.abs(key(b.cx) - nx) <= 2) && (Math.abs(key(b.cy) - key(a.cy)) <= 2 || Math.abs(key(b.cy) - ny) <= 2));
    if (near.length < 4) continue;
    const rr = Math.max(...near.map((b) => b.r));
    const x0 = Math.min(...near.map((b) => b.cx)) - rr;
    const y0 = Math.min(...near.map((b) => b.cy)) - rr;
    const x1 = Math.max(...near.map((b) => b.cx)) + rr;
    const y1 = Math.max(...near.map((b) => b.cy)) + rr;
    // A dining chair's back alone may be drawn: 15 cm across is a chair. It stands as a chair, 40 cm at least, round where it is drawn.
    if (cm(x1 - x0) < 15 || cm(x1 - x0) > 60 || cm(y1 - y0) < 15 || cm(y1 - y0) > 60) continue;
    // 38 cm a side at most along a row of chairs: three to a 180 cm table stand apart, as drawn, not touching.
    const seatM = 0.38 * upm;
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const [w, h] = [Math.min(Math.max(x1 - x0, seatM), 0.45 * upm), Math.min(Math.max(y1 - y0, seatM), 0.45 * upm)];
    if (!chairs.some((c) => Math.abs(c.x + c.w / 2 - cx) < 0.05 * upm && Math.abs(c.y + c.h / 2 - cy) < 0.05 * upm)) chairs.push({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  // A sofa drawn with rounded arms: two arcs of 20–30 cm on one line, 1–3 m
  // apart, in a living room — its cushions between them (Gottlieb's salons,
  // where the rectangle finder saw no cushions in a row).
  const arms = arcs.filter((q) => rcm(q) >= 20 && rcm(q) <= 30 && roomKindAt(q.cx, q.cy) === "living");
  const armUsed = new Set<(typeof arms)[number]>();
  for (const a of arms) {
    if (armUsed.has(a)) continue;
    const pair = arms.find((b) => b !== a && !armUsed.has(b) && Math.abs(b.r - a.r) < 0.02 * upm && (
      (Math.abs(b.cy - a.cy) < 0.03 * upm && Math.abs(b.cx - a.cx) >= 1 * upm && Math.abs(b.cx - a.cx) <= 3 * upm) ||
      (Math.abs(b.cx - a.cx) < 0.03 * upm && Math.abs(b.cy - a.cy) >= 1 * upm && Math.abs(b.cy - a.cy) <= 3 * upm)));
    if (!pair) continue;
    // Cushions drawn between the arms: small rounded corners on the line between them.
    const between = arcs.filter((q) => rcm(q) >= 3 && rcm(q) <= 7 && (Math.abs(pair.cy - a.cy) < 0.03 * upm ? Math.abs(q.cy - a.cy) < 0.45 * upm && q.cx > Math.min(a.cx, pair.cx) && q.cx < Math.max(a.cx, pair.cx) : Math.abs(q.cx - a.cx) < 0.45 * upm && q.cy > Math.min(a.cy, pair.cy) && q.cy < Math.max(a.cy, pair.cy))).length;
    if (between < 2) continue;
    armUsed.add(a);
    armUsed.add(pair);
    const along = Math.abs(pair.cy - a.cy) < 0.03 * upm;
    const box = along
      ? { x: Math.min(a.cx, pair.cx) - a.r, y: a.cy - a.r, w: Math.abs(pair.cx - a.cx) + 2 * a.r, h: 2 * a.r }
      : { x: a.cx - a.r, y: Math.min(a.cy, pair.cy) - a.r, w: 2 * a.r, h: Math.abs(pair.cy - a.cy) + 2 * a.r };
    // Its back against the wall it stands by.
    if (wallAt) {
      const reach = 0.5 * upm;
      const probe = (dx: number, dy: number) => {
        for (let d = 0.02 * upm; d <= reach; d += 0.02 * upm) if (wallAt(a.cx + dx * (a.r + d), a.cy + dy * (a.r + d))) return d;
        return null;
      };
      const [lo, hi] = along ? [probe(0, -1), probe(0, 1)] : [probe(-1, 0), probe(1, 0)];
      const back = hi != null && (lo == null || hi <= lo) ? { side: 1, d: hi } : lo != null ? { side: -1, d: lo } : null;
      if (back) {
        if (along) {
          if (back.side > 0) box.h += back.d;
          else { box.y -= back.d; box.h += back.d; }
        } else if (back.side > 0) box.w += back.d;
        else { box.x -= back.d; box.w += back.d; }
      }
    }
    // A sofa is 80–90 cm deep: one whose back no wall was found behind grows to it towards the side the room ends.
    const deep = 0.85 * upm;
    if ((along ? box.h : box.w) < deep) {
      const grow = deep - (along ? box.h : box.w);
      const out1 = along ? roomKindAt(a.cx, box.y + box.h + 0.3 * upm) !== "living" : roomKindAt(box.x + box.w + 0.3 * upm, a.cy) !== "living";
      if (along) {
        if (out1) box.h += grow;
        else { box.y -= grow; box.h += grow; }
      } else if (out1) box.w += grow;
      else { box.x -= grow; box.w += grow; }
    }
    if (out.some((p) => p.kind === "seat" && overlap(p.rect, box) > 0.3)) continue;
    out.push({ ...box, kind: "seat", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
  }
  // A table the sheet draws its chairs round is the room's: a "table" read off
  // a bare rectangle near it is the floor's tiling (Gottlieb's salons are
  // tiled in 112 cm squares, a dining table's size) and is dropped.
  const drawnTables = out.filter((p) => p.kind === "table" && (p as { drawnSeats?: boolean }).drawnSeats);
  for (let i = out.length - 1; i >= 0; i--) {
    const p = out[i]!;
    if (p.kind !== "table" || (p as { drawnSeats?: boolean }).drawnSeats) continue;
    const kind = roomKindAt(p.x + p.w / 2, p.y + p.h / 2);
    if (drawnTables.some((t) => roomKindAt(t.x + t.w / 2, t.y + t.h / 2) === kind && Math.hypot(t.x + t.w / 2 - (p.x + p.w / 2), t.y + t.h / 2 - (p.y + p.h / 2)) <= 4 * upm)) out.splice(i, 1);
  }
  // A table and the chairs the sheet draws round it. The chairs are counted
  // side by side: the small rounded corners drawn within 60 cm off each side
  // of the table, their places along that side merged where 6 cm apart (a
  // chair's back drawn twice, inside and out); a chair is two such places.
  // Each stands where its corners are drawn, 40 cm square, its back away
  // from the table. Grouped corner by corner, chairs side by side shared
  // their corners and were lost (Gottlieb's dining tables).
  // Not a sofa's own: its cushions' corners are no chairs.
  const smallArcs = arcs.filter((q) => rcm(q) >= 1.2 && rcm(q) <= 7 && !out.some((p) => p.kind === "seat" && q.cx >= p.x - 0.1 * upm && q.cx <= p.x + p.w + 0.1 * upm && q.cy >= p.y - 0.5 * upm && q.cy <= p.y + p.h + 0.5 * upm));
  const chairsAt = (t: Rect): Rect[] => {
    const found: Rect[] = [];
    const sides = [
      { along: "x" as const, lo: t.y - 0.6 * upm, hi: t.y, out: -1 },
      { along: "x" as const, lo: t.y + t.h, hi: t.y + t.h + 0.6 * upm, out: 1 },
      { along: "y" as const, lo: t.x - 0.6 * upm, hi: t.x, out: -1 },
      { along: "y" as const, lo: t.x + t.w, hi: t.x + t.w + 0.6 * upm, out: 1 },
    ];
    for (const sd of sides) {
      const [a0, a1] = sd.along === "x" ? [t.x - 0.1 * upm, t.x + t.w + 0.1 * upm] : [t.y - 0.1 * upm, t.y + t.h + 0.1 * upm];
      const here = smallArcs.filter((q) => {
        const [u, v] = sd.along === "x" ? [q.cx, q.cy] : [q.cy, q.cx];
        return u >= a0 && u <= a1 && v >= sd.lo && v <= sd.hi;
      });
      const pos = here.map((q) => (sd.along === "x" ? q.cx : q.cy)).sort((p, q) => p - q);
      const places: number[] = [];
      for (const v of pos) if (!places.length || v - places[places.length - 1]! > 0.06 * upm) places.push(v);
      for (let i = 0; i + 1 < places.length; i += 2) {
        const mid = (places[i]! + places[i + 1]!) / 2;
        const seat = 0.4 * upm;
        const off = sd.out < 0 ? sd.hi - 0.05 * upm - seat : sd.lo + 0.05 * upm;
        found.push(sd.along === "x" ? { x: mid - seat / 2, y: off, w: seat, h: seat } : { x: off, y: mid - seat / 2, w: seat, h: seat });
      }
    }
    return found;
  };
  const candidates = order
    .filter((r) => {
      // A table is drawn over the floor's tiling, crossed by its lines: its chairs, not its box, tell it from a tile.
      if (taken.has(r) || labelled(r)) return false;
      const [s4, l4] = dims(r);
      if (s4 < 55 || s4 > 115 || l4 < 90 || l4 > 260) return false;
      // Not a strip of the floor with chairs in it: a table holds none of its chairs' corners.
      const inset = 0.08 * upm;
      if (smallArcs.some((q) => q.cx > r.x + inset && q.cx < r.x + r.w - inset && q.cy > r.y + inset && q.cy < r.y + r.h - inset)) return false;
      const set = chairsAt(r);
      const n = set.length;
      // Chairs on one side only: the table stands with its other side to a wall, as a kitchen's does; else the box is the floor beside another table.
      const side = (c: Rect) => (c.y + c.h <= r.y + 0.01 * upm ? "n" : c.y >= r.y + r.h - 0.01 * upm ? "s" : c.x + c.w <= r.x + 0.01 * upm ? "w" : "e");
      const sides = new Set(set.map(side));
      // Chairs on one side only: they fill that side — a strip of the floor beside another table has them only along a part of it.
      if (sides.size === 1) {
        const s0 = [...sides][0];
        const span = s0 === "n" || s0 === "s" ? r.w : r.h;
        const used = set.reduce((t, c) => t + (s0 === "n" || s0 === "s" ? c.w : c.h), 0);
        if (used < 0.6 * span) return false;
      }
      // Four chairs round a box make it a dining table in whatever room the reader took it for.
      return (kitchenNear(r.x + r.w / 2, r.y + r.h / 2) && n >= 2) || (n >= 4 && roomKindAt(r.x + r.w / 2, r.y + r.h / 2) !== "bathroom");
    })
    .sort((p, q) => chairsAt(q).length - chairsAt(p).length || p.w * p.h - q.w * q.h);
  const seated: Rect[] = [];
  for (const r of candidates) {
    if (taken.has(r)) continue;
    if (out.some((p) => p.kind === "table" && overlap(p.rect, r) > 0.3)) continue;
    // Each chair is one table's: a box beside a table already set, sharing its chairs, is the floor.
    const round = chairsAt(r).filter((c) => !seated.some((q) => Math.hypot(q.x + q.w / 2 - (c.x + c.w / 2), q.y + q.h / 2 - (c.y + c.h / 2)) < 0.45 * upm));
    if (round.length < 2) continue;
    seated.push(...round);
    out.push({ ...r, kind: "table", widthCm: cm(r.w), depthCm: cm(r.h), rect: r, drawnSeats: true } as FurniturePiece & { rect: Rect });
    take(r);
    for (const c of round) out.push({ ...c, kind: "seat", widthCm: cm(c.w), depthCm: cm(c.h), rect: c });
  }
  const nearSeatArc = (q: { cx: number; cy: number }) => out.some((p) => (p.kind === "seat" || p.kind === "table") && q.cx > p.x - 0.1 * upm && q.cx < p.x + p.w + 0.1 * upm && q.cy > p.y - 0.1 * upm && q.cy < p.y + p.h + 0.1 * upm);
  // Sinks: a drain, a circle of 1.5–3.5 cm, each its own sink in the box drawn round it — not a chair's corner.
  const inChair = (q: { cx: number; cy: number }) => chairs.some((c) => q.cx >= c.x && q.cx <= c.x + c.w && q.cy >= c.y && q.cy <= c.y + c.h);
  // A drain inside an oval is a basin's — the sanitary reader's — not a kitchen sink.
  const inOval = (q: { cx: number; cy: number }) => (sheet.arcs ?? []).some((o) => cm(o.r) >= 8 && cm(o.r) <= 45 && Math.hypot(o.cx - q.cx, o.cy - q.cy) <= 0.2 * upm);
  // In a room the reader took for a kitchen or a living room: a drain in a hall is a basin's or the floor's.
  const drains = arcs.filter((q) => rcm(q) >= 1.5 && rcm(q) <= 3.5);
  // A kitchen sink has a drain a bowl, 50 cm and more from the next: three within 35 cm of each other are a fitting's, not sinks.
  const crowded = (q: { cx: number; cy: number }) => drains.filter((d) => d !== q && Math.hypot(d.cx - q.cx, d.cy - q.cy) > 0.02 * upm && Math.hypot(d.cx - q.cx, d.cy - q.cy) <= 0.42 * upm).length >= 2;
  for (const a of arcs.filter((q) => rcm(q) >= 1.5 && rcm(q) <= 3.5 && !inChair(q) && !nearSeatArc(q) && !inOval(q) && !crowded(q))) {
    if (out.some((p) => p.kind === "sink" && a.cx > p.rect.x && a.cx < p.rect.x + p.rect.w && a.cy > p.rect.y && a.cy < p.rect.y + p.rect.h)) continue;
    const box = smallest(a.cx, a.cy, 25, 75) ?? { x: a.cx - 0.25 * upm, y: a.cy - 0.2 * upm, w: 0.5 * upm, h: 0.4 * upm };
    out.push({ ...box, kind: "sink", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
    if (rects.includes(box as Rect)) take(box as Rect);
  }
  // A hand basin in a hall or a WC drawn as a box round its drain and its
  // tap — the crowded drains above: the smallest box drawn round them.
  {
    const seenB = new Set<(typeof drains)[number]>();
    for (const d of drains.filter((q) => crowded(q) && inFlat(q.cx, q.cy))) {
      if (seenB.has(d)) continue;
      const group = drains.filter((q) => Math.hypot(q.cx - d.cx, q.cy - d.cy) <= 0.4 * upm);
      for (const q of group) seenB.add(q);
      const [gx, gy] = [group.reduce((n, q) => n + q.cx, 0) / group.length, group.reduce((n, q) => n + q.cy, 0) / group.length];
      const box = rects.filter((r) => gx > r.x && gx < r.x + r.w && gy > r.y && gy < r.y + r.h && dims(r)[0] >= 20 && dims(r)[1] <= 65).sort((p, q) => p.w * p.h - q.w * q.h)[0];
      if (!box || out.some((p) => overlap(p.rect, box) > 0.3) || sanitary.some((f) => overlap(f, box) > 0.3)) continue;
      out.push({ ...box, kind: "fixture", fixture: "basin", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
      take(box);
    }
  }
  // A hob: three or four rings of 6–12 cm within 60 cm of each other, no chair's corners among them.
  const nearSeat = (q: { cx: number; cy: number }) => out.some((p) => (p.kind === "seat" || p.kind === "table") && q.cx > p.x - 0.2 * upm && q.cx < p.x + p.w + 0.2 * upm && q.cy > p.y - 0.2 * upm && q.cy < p.y + p.h + 0.2 * upm);
  const rings = arcs.filter((q) => rcm(q) >= 6 && rcm(q) <= 12 && !nearSeat(q) && !chairs.some((c) => q.cx > c.x - 0.15 * upm && q.cx < c.x + c.w + 0.15 * upm && q.cy > c.y - 0.15 * upm && q.cy < c.y + c.h + 0.15 * upm));
  const ringUsed = new Set<(typeof rings)[number]>();
  for (const a of rings) {
    if (ringUsed.has(a)) continue;
    const group = rings.filter((b) => !ringUsed.has(b) && Math.hypot(b.cx - a.cx, b.cy - a.cy) <= 0.6 * upm);
    if (group.length < 3) continue;
    // A hob's burners stand two by two: rings in one line are something else's rounded corners.
    const gx = new Set(group.map((b) => Math.round(b.cx / (0.05 * upm))));
    const gy = new Set(group.map((b) => Math.round(b.cy / (0.05 * upm))));
    if (gx.size < 2 || gy.size < 2) continue;
    for (const b of group) ringUsed.add(b);
    const cx = group.reduce((s5, b) => s5 + b.cx, 0) / group.length;
    const cy = group.reduce((s5, b) => s5 + b.cy, 0) / group.length;
    const box = smallest(cx, cy, 45, 80) ?? { x: cx - 0.3 * upm, y: cy - 0.3 * upm, w: 0.6 * upm, h: 0.6 * upm };
    out.push({ ...box, kind: "hob", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
    if (rects.includes(box as Rect)) take(box as Rect);
  }

  // A washing machine: a 55–70 cm square box round its drum, a ring of
  // 10–25 cm — in whatever room it stands; Gottlieb's stand in the stair
  // hall's laundry nook, a room the reader takes for a passage.
  for (const drum of (sheet.arcs ?? []).filter((q) => cm(q.r) >= 10 && cm(q.r) <= 25 && inFlat(q.cx, q.cy))) {
    const box = rects
      .filter((r) => drum.cx > r.x && drum.cx < r.x + r.w && drum.cy > r.y && drum.cy < r.y + r.h && dims(r)[0] >= 45 && dims(r)[1] <= 70 && dims(r)[1] - dims(r)[0] <= 15)
      .sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (!box || out.some((p) => overlap(p.rect, box) > 0.4)) continue;
    out.push({ ...box, kind: "fixture", fixture: "washer", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
    take(box);
  }
  // Against a bedroom's wall: a shelf or a shallow wardrobe, 30–45 cm deep and
  // 90–200 cm long; a bedside table, 35–60 by 40–65. In a wet room, a vanity
  // 40–65 deep and 90–200 long round its basin. Each stands where it is drawn.
  const againstWall = (r: Rect) =>
    !!wallAt &&
    [0.04, 0.1, 0.16].some((d) =>
      [[r.x - d * upm, r.y + r.h / 2], [r.x + r.w + d * upm, r.y + r.h / 2], [r.x + r.w / 2, r.y - d * upm], [r.x + r.w / 2, r.y + r.h + d * upm]].some(([x, y]) => wallAt!(x!, y!)),
    );
  for (const r of order) {
    if (taken.has(r) || labelled(r) || isTile(r) || out.some((p) => overlap(p.rect, r) > 0.3)) continue;
    const [s6, l6] = dims(r);
    const room = roomKindAt(r.x + r.w / 2, r.y + r.h / 2);
    const sleeping = room === "bedroom" || room === "mmd";
    const wet = room === "bathroom" || room === "utility";
    if (sleeping && s6 >= 18 && s6 < 30 && l6 >= 90 && l6 <= 200 && againstWall(r)) {
      // A wardrobe drawn as its doors' line along a wall: 55 cm deep, out from the wall.
      const wide = r.w >= r.h;
      const deep = 0.55 * upm;
      const wallLow = wide ? (wallAt?.(r.x + r.w / 2, r.y - 0.08 * upm) ?? false) : (wallAt?.(r.x - 0.08 * upm, r.y + r.h / 2) ?? false);
      const box = wide ? { x: r.x, y: wallLow ? r.y : r.y + r.h - deep, w: r.w, h: deep } : { x: wallLow ? r.x : r.x + r.w - deep, y: r.y, w: deep, h: r.h };
      if (!out.some((p) => overlap(p.rect, box) > 0.2)) {
        out.push({ ...box, kind: "storage", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
        take(r);
      }
    } else if (sleeping && s6 >= 30 && s6 <= 65 && l6 >= 90 && l6 <= 260 && againstWall(r)) {
      out.push({ ...r, kind: "storage", widthCm: cm(r.w), depthCm: cm(r.h), rect: r });
      take(r);
    } else if (sleeping && s6 >= 35 && s6 <= 60 && l6 >= 40 && l6 <= 65 && againstWall(r)) {
      out.push({ ...r, kind: "storage", widthCm: cm(r.w), depthCm: cm(r.h), rect: r });
      take(r);
    } else if (wet && s6 >= 40 && s6 <= 65 && l6 >= 90 && l6 <= 200 && againstWall(r)) {
      out.push({ ...r, kind: "storage", widthCm: cm(r.w), depthCm: cm(r.h), rect: r });
      take(r);
    }
  }
  // A sink is a kitchen's, by its hob: a drain with no hob within 3 m is a
  // basin's, or a floor drain, in a hall (Gottlieb A's corridor by its
  // bathrooms), and stood a worktop there.
  if ((sheet.arcs ?? []).length) {
    const hobs = out.filter((p) => p.kind === "hob");
    for (let i = out.length - 1; i >= 0; i--) {
      const p = out[i]!;
      if (p.kind !== "sink") continue;
      // On the hob's worktop: near it, or along the same run.
      const onRun = (h: FurniturePiece) => {
        const [dx, dy] = [Math.abs(h.x + h.w / 2 - (p.x + p.w / 2)), Math.abs(h.y + h.h / 2 - (p.y + p.h / 2))];
        return Math.hypot(dx, dy) <= 2 * upm || (Math.min(dx, dy) <= 0.5 * upm && Math.max(dx, dy) <= 3 * upm);
      };
      // In a hall — a room of no kind, or a passage — only right beside the hob: drains there are basins' and the floor's.
      const hall = ["circulation", ""].includes(roomKindAt(p.x + p.w / 2, p.y + p.h / 2) ?? "");
      const close = hobs.some((h) => Math.hypot(h.x + h.w / 2 - (p.x + p.w / 2), h.y + h.h / 2 - (p.y + p.h / 2)) <= 1.6 * upm);
      if (!hobs.some(onRun) || (hall && !close)) out.splice(i, 1);
    }
  }
  // A worktop in a living room is an open kitchen's: it stands within 2 m of
  // the sink or the hob the sheet draws. One with neither near is a line the
  // sheet draws for something else — a step, a floor's edge — and Gottlieb's
  // salons had a counter standing along the party wall from one.
  const cooking = out.filter((p) => p.kind === "sink" || p.kind === "hob");
  for (let i = out.length - 1; i >= 0; i--) {
    const p = out[i]!;
    if (p.kind !== "counter" || roomKindAt(p.x + p.w / 2, p.y + p.h / 2) !== "living") continue;
    const near = cooking.some((c) => Math.hypot(Math.max(c.x - (p.x + p.w), p.x - (c.x + c.w), 0), Math.max(c.y - (p.y + p.h), p.y - (c.y + c.h), 0)) <= 2 * upm);
    if (!near && sheet.arcs?.length) out.splice(i, 1);
  }
  // A sink or a hob stands on a worktop: where none was read under it — a run
  // the sheet closes with the wall rather than with a line of its own — the
  // run is laid along the wall it stands at, 60 cm deep, from the first piece
  // on it to the last, and on to the run it meets where that is near.
  if (wallAt) {
    const onCounter = (c: Rect) => out.some((p) => p.kind === "counter" && overlap(p.rect, c) > 0.3);
    const loose = out.filter((p) => (p.kind === "sink" || p.kind === "hob") && !onCounter(p.rect));
    const wallSide = (c: Rect): { dx: number; dy: number; d: number } | null => {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      let best: { dx: number; dy: number; d: number } | null = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let d = 0.02 * upm; d <= 0.7 * upm; d += 0.02 * upm) {
          if (wallAt(cx + dx * d, cy + dy * d)) {
            if (!best || d < best.d) best = { dx, dy, d };
            break;
          }
        }
      }
      return best;
    };
    const groups = new Map<string, { side: { dx: number; dy: number }; face: number; lo: number; hi: number }>();
    for (const p of loose) {
      const w = wallSide(p.rect);
      if (!w) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const vertical = w.dx !== 0;
      const face = vertical ? cx + w.dx * w.d : cy + w.dy * w.d;
      const key = `${w.dx},${w.dy},${Math.round(face / (0.1 * upm))}`;
      const [lo, hi] = vertical ? [p.y, p.y + p.h] : [p.x, p.x + p.w];
      const g0 = groups.get(key);
      if (g0) {
        g0.lo = Math.min(g0.lo, lo);
        g0.hi = Math.max(g0.hi, hi);
      } else groups.set(key, { side: { dx: w.dx, dy: w.dy }, face, lo, hi });
    }
    const deep = 0.6 * upm;
    for (const g0 of groups.values()) {
      const vertical = g0.side.dx !== 0;
      let [lo, hi] = [g0.lo, g0.hi];
      // Every loose piece standing in the run's band is on it.
      const [b0, b1] = [Math.min(g0.face, g0.face - (vertical ? g0.side.dx : g0.side.dy) * deep), Math.max(g0.face, g0.face - (vertical ? g0.side.dx : g0.side.dy) * deep)];
      for (const p of loose) {
        const c = vertical ? p.x + p.w / 2 : p.y + p.h / 2;
        if (c < b0 || c > b1) continue;
        lo = Math.min(lo, vertical ? p.y : p.x);
        hi = Math.max(hi, vertical ? p.y + p.h : p.x + p.w);
      }
      lo -= 0.05 * upm;
      hi += 0.05 * upm;
      // On to a run it meets within 1.2 m, and to the room's end within 70 cm.
      const band = (r: Rect) => (vertical ? r.x < Math.max(g0.face, g0.face - g0.side.dx * deep) && r.x + r.w > Math.min(g0.face, g0.face - g0.side.dx * deep) : r.y < Math.max(g0.face, g0.face - g0.side.dy * deep) && r.y + r.h > Math.min(g0.face, g0.face - g0.side.dy * deep));
      for (const c of out.filter((p) => p.kind === "counter" && band(p.rect))) {
        const [clo, chi] = vertical ? [c.y, c.y + c.h] : [c.x, c.x + c.w];
        if (clo > hi && clo - hi <= 1.2 * upm) hi = clo;
        if (chi < lo && lo - chi <= 1.2 * upm) lo = chi;
      }
      // An L: a run at right angles ending at this run's band, within 1.2 m of its end — the corner is worktop, and the run is laid on to the far side of it.
      const [b0c, b1c] = [Math.min(g0.face, g0.face - (vertical ? g0.side.dx : g0.side.dy) * deep), Math.max(g0.face, g0.face - (vertical ? g0.side.dx : g0.side.dy) * deep)];
      for (const c of out.filter((p) => p.kind === "counter")) {
        const [a0, a1] = vertical ? [c.x, c.x + c.w] : [c.y, c.y + c.h];
        const meets = Math.abs(a1 - b0c) <= 0.15 * upm || Math.abs(a0 - b1c) <= 0.15 * upm || (a0 < b1c && a1 > b0c);
        if (!meets) continue;
        const [clo, chi] = vertical ? [c.y, c.y + c.h] : [c.x, c.x + c.w];
        if (chi <= lo && lo - chi <= 1.2 * upm) lo = clo;
        if (clo >= hi && clo - hi <= 1.2 * upm) hi = chi;
      }
      const across = g0.face - (vertical ? g0.side.dx : g0.side.dy) * deep / 2;
      const end = (from: number, dir: 1 | -1) => {
        for (let d = 0; d <= 0.7 * upm; d += 0.02 * upm) if (vertical ? wallAt(across, from + dir * d) : wallAt(from + dir * d, across)) return from + dir * d;
        return from;
      };
      lo = end(lo, -1);
      hi = end(hi, 1);
      const x0 = vertical ? Math.min(g0.face, g0.face - g0.side.dx * deep) : lo;
      const y0 = vertical ? lo : Math.min(g0.face, g0.face - g0.side.dy * deep);
      const box = vertical ? { x: x0, y: y0, w: deep, h: hi - lo } : { x: x0, y: y0, w: hi - lo, h: deep };
      out.push({ ...box, kind: "counter", widthCm: cm(box.w), depthCm: cm(box.h), rect: box });
    }
  }
  // Pans and basins, drawn with curves. A basin's vanity may already have
  // been read as a cupboard; the basin is what it is.
  for (const f of sanitary) {
    const clash = out.findIndex((p) => overlap(p.rect, f) > 0.5);
    if (clash >= 0 && out[clash]!.kind === "fixture") continue;
    if (clash >= 0) out.splice(clash, 1);
    out.push({ ...f, rect: { x: f.x, y: f.y, w: f.w, h: f.h } });
  }
  const pieces = out.map(({ rect: _rect, ...p }) => p);
  // One dining table to a room. A permit sheet draws the chairs, the rug and
  // the dimension box as more rectangles of the same size.
  // A table its chairs are drawn round is certain: it is neither merged into
  // another nor takes one in — Gottlieb A's left kitchen table went into the
  // living room's cluster of chair-sized "tables" 2.5 m off, and was lost.
  const tables = pieces.filter((p) => p.kind === "table" && !(p as { drawnSeats?: boolean }).drawnSeats);
  const grouped = new Set<FurniturePiece>();
  for (const t of tables) {
    if (grouped.has(t)) continue;
    const cluster = tables.filter((q) => Math.hypot(q.x + q.w / 2 - (t.x + t.w / 2), q.y + q.h / 2 - (t.y + t.h / 2)) < 2.5 * upm);
    for (const q of cluster) grouped.add(q);
    cluster.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const q of cluster.slice(1)) {
      const i = pieces.indexOf(q);
      if (i >= 0) pieces.splice(i, 1);
    }
  }
  // One tub drawn as several nested rectangles.
  const baths = pieces.filter((p) => p.fixture === "bath");
  const seenBath = new Set<FurniturePiece>();
  for (const t of baths) {
    if (seenBath.has(t)) continue;
    const cluster = baths.filter((q) => {
      const iw = Math.min(t.x + t.w, q.x + q.w) - Math.max(t.x, q.x);
      const ih = Math.min(t.y + t.h, q.y + q.h) - Math.max(t.y, q.y);
      if (iw <= 0 || ih <= 0) return false;
      return (iw * ih) / Math.min(t.w * t.h, q.w * q.h) >= 0.4;
    });
    for (const q of cluster) seenBath.add(q);
    cluster.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const q of cluster.slice(1)) {
      const i = pieces.indexOf(q);
      if (i >= 0) pieces.splice(i, 1);
    }
  }
  // A house's sheet draws its tables with their chairs: a table read off a
  // bare box, chairs made up round it, is a box of the floor's — a hall's
  // stair run, a tile row (Gottlieb B, C upper floors).
  if ((sheet.arcs ?? []).length) {
    for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i]!.kind === "table" && !(pieces[i] as { drawnSeats?: boolean }).drawnSeats) pieces.splice(i, 1);
  }
  // Dining chairs are drawn as open shapes; they are set round the table as the sheet draws them.
  for (const t of pieces.filter((p) => p.kind === "table" && !(p as { drawnSeats?: boolean }).drawnSeats)) pieces.push(...seatsAroundTable(t, upm));
  return pieces;
}
