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
    if (sleeping && s >= 60 && s <= 200 && l >= 175 && l <= 215) {
      piece(r, "bed");
      take(r);
      continue;
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
    if ((room === "living" || room === "kitchen") && s >= 75 && s <= 115 && l >= 120 && l <= 240) {
      piece(r, "table");
      take(r);
      continue;
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
    return roomKindAt(r.x + r.w / 2, r.y + r.h / 2) === "living" && s >= 40 && s <= 66 && l >= 45 && l <= 100;
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
    piece(u, "seat");
    for (const q of chain) used.add(q);
    for (const q of cushions) if (overlap(q, u) > 0.5) used.add(q);
    for (const q of rects) if (inside(q, u)) taken.add(q);
  }
  // Desks in bedrooms: 50–70 deep, 90–160 long, nothing across them.
  for (const r of order) {
    if (taken.has(r) || used.has(r) || labelled(r)) continue;
    const [s, l] = dims(r);
    const room = roomKindAt(r.x + r.w / 2, r.y + r.h / 2);
    if ((room === "bedroom" || room === "mmd") && s >= 45 && s <= 72 && l >= 90 && l <= 165 && !out.some((p) => inside(r, p.rect))) {
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
      if (len < 1.0 * upm || len > 7 * upm) continue;
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      const room = roomKindAt(mx, my);
      if (room !== "living" && room !== "kitchen") continue;
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
          if (face >= 0.5 * upm && face <= 0.7 * upm) hits++;
        }
        if (hits < samples * 0.7) continue;
        const depth = 0.6 * upm;
        const x0 = Math.min(seg.x1, seg.x2);
        const y0 = Math.min(seg.y1, seg.y2);
        const r = horizontal
          ? { x: x0, y: side > 0 ? y0 : y0 - depth, w: len, h: depth }
          : { x: side > 0 ? x0 : x0 - depth, y: y0, w: depth, h: len };
        if (out.some((p) => overlap(p.rect, r) > 0.4)) continue;
        piece(r, "counter");
        break;
      }
    }
    // A tall box a fridge's size beside a worktop.
    for (const r of order) {
      if (taken.has(r) || labelled(r)) continue;
      const [s2, l2] = dims(r);
      const room = roomKindAt(r.x + r.w / 2, r.y + r.h / 2);
      if ((room === "living" || room === "kitchen") && s2 >= 60 && s2 <= 90 && l2 >= 65 && l2 <= 95) {
        const near = out.some((p) => p.kind === "counter" && Math.hypot(p.x + p.w / 2 - (r.x + r.w / 2), p.y + p.h / 2 - (r.y + r.h / 2)) < 3.5 * upm);
        if (near) {
          piece(r, "storage");
          take(r);
        }
      }
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
  // Dining chairs are drawn as open shapes; they are set round the table as the sheet draws them.
  for (const t of pieces.filter((p) => p.kind === "table")) pieces.push(...seatsAroundTable(t, upm));
  return pieces;
}
