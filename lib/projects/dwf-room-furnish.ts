import type { DwfFloor } from "@/lib/projects/dwf-floor";
import { seatsAroundTable, type FurniturePiece } from "@/lib/projects/floorplan-furniture";

/**
 * Furniture for a room whose use is known and whose drawn furniture the
 * reader could not take up.
 *
 * A private house's sheet draws its beds as hatched blankets with a pillow
 * too narrow for the bed reader and outlines that do not close, and the
 * sales-sheet reader that finds the tables looks for closed rectangles: a
 * bedroom the sheet furnishes came out of the model bare, and a bare room
 * renders as an empty box. A room that has none of what its use needs is
 * fitted with it here, on the floor's own grid: a piece stands with its back
 * to a wall, clear of the doors and the swing of each, with room in front of
 * it to use it, and a size steps down until one fits. What the sheet's reader
 * did find stays as found, but for two things a kitchen cannot do without: a
 * bare counter is fitted with its sink and hob, and a chair standing at no
 * table — a stair's treads, read as seats where the stair shares the kitchen —
 * gives way to the worktop. `dropped` is what the caller takes out.
 */
export function furnishBareRooms(
  floor: DwfFloor,
  ids: number[],
  furniture: FurniturePiece[],
  rooms: ReadonlySet<number>,
): { added: FurniturePiece[]; dropped: FurniturePiece[] } {
  const added: FurniturePiece[] = [];
  const dropped = new Set<FurniturePiece>();
  const standing = () => [...furniture, ...added].filter((p) => !dropped.has(p));
  const upm = floor.unitsPerMetre;
  for (const id of ids) {
    if (!rooms.has(id)) continue;
    const kind = floor.rooms.find((r) => r.id === id)?.kind;
    if (!kind) continue;
    let fit = roomFitter(floor, id, standing());
    if (!fit) continue;
    const has = (test: (p: FurniturePiece) => boolean) => fit!.contents.some((p) => !dropped.has(p) && test(p));
    const put = (pieces: FurniturePiece[]) => {
      for (const p of pieces) {
        added.push(p);
        fit!.take(p);
      }
    };
    if (kind === "bedroom" || kind === "mmd") {
      if (!has((p) => p.kind === "bed")) put(fit.beds());
      if (!has((p) => p.kind === "storage")) put(fit.wall("storage", 60, [180, 150, 120, 90], { clearCm: 70, tall: true, corner: true }));
    } else if (kind === "living") {
      // A salon takes its sofa against a wall first and the longest table the
      // rest will hold; a smaller room is its table's, and a sofa only if one fits.
      const sofa = () => {
        if (!has((p) => p.kind === "seat" && Math.max(p.widthCm, p.depthCm) > 100)) put(fit!.wall("seat", 90, [220, 200, 160], { clearCm: 80 }));
      };
      if (fit.areaM2 >= 18) sofa();
      if (!has((p) => p.kind === "table")) put(fit.table([240, 220, 200, 180, 160, 140], 100));
      if (!has((p) => p.kind === "storage")) put(fit.wall("storage", 40, [200, 160, 120, 90], { clearCm: 60, tall: true }));
      if (fit.areaM2 < 18) sofa();
    } else if (kind === "kitchen") {
      const runs = fit.contents.filter((p) => p.kind === "counter");
      const longest = runs.reduce<FurniturePiece | null>((a, p) => (!a || Math.max(p.w, p.h) > Math.max(a.w, a.h) ? p : a), null);
      if (!has((p) => p.kind === "hob" || p.kind === "sink")) {
        if (longest && Math.max(longest.w, longest.h) >= 1.2 * upm) {
          dropped.add(longest);
          put(withSinkAndHob(longest, upm));
        } else {
          let worktop = fit.worktop(WORKTOP_CM);
          const tables = fit.contents.filter((p) => p.kind === "table");
          const stray = fit.contents.filter(
            (p) => p.kind === "seat" && Math.max(p.widthCm, p.depthCm) <= 70 && !tables.some((t) => gapBetween(p, t) <= 0.6 * upm),
          );
          if (worktop.length === 0 && stray.length > 0) {
            for (const p of stray) dropped.add(p);
            const refit = roomFitter(floor, id, standing());
            worktop = refit?.worktop(WORKTOP_CM) ?? [];
            if (worktop.length > 0) fit = refit!;
            else for (const p of stray) dropped.delete(p);
          }
          put(worktop);
        }
      }
      // A fridge: a tall unit a door wide, into a corner where it can.
      if (fit.areaM2 >= 5 && !has((p) => p.kind === "storage")) put(fit.wall("storage", 65, [60], { clearCm: 80, tall: true, corner: true }));
      if (fit.areaM2 >= 8 && !has((p) => p.kind === "table")) put(fit.table([120, 100], 80));
    } else if (kind === "utility") {
      if (fit.areaM2 >= 1.2 && !has((p) => p.kind === "fixture")) put(fit.wall("fixture", 60, [60], { clearCm: 60, fixture: "washer" }));
    }
  }
  return { added: added.filter((p) => !dropped.has(p)), dropped: [...dropped].filter((p) => !added.includes(p)) };
}

const WORKTOP_CM = [360, 300, 270, 240, 210, 180, 150, 120];

/** How far apart two pieces stand; 0 where they touch or overlap. */
function gapBetween(a: FurniturePiece, b: FurniturePiece): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * A run of worktop as a kitchen has it: a sink and a hob a unit wide each,
 * counter either side and between. A run under two units is left as it is.
 */
export function withSinkAndHob(run: FurniturePiece, upm: number): FurniturePiece[] {
  const across = run.w >= run.h;
  const len = across ? run.w : run.h;
  const unit = 0.6 * upm;
  if (len < 2 * unit - 0.01 * upm) return [run];
  const s = (len - 2 * unit) / 3;
  const layout: Array<[FurniturePiece["kind"], number, number]> =
    s < 0.08 * upm
      ? [
          ["sink", 0, len / 2],
          ["hob", len / 2, len],
        ]
      : [
          ["counter", 0, s],
          ["sink", s, s + unit],
          ["counter", s + unit, 2 * s + unit],
          ["hob", 2 * s + unit, 2 * s + 2 * unit],
          ["counter", 2 * s + 2 * unit, len],
        ];
  return layout.map(([kind, a, b]) => {
    const x = across ? run.x + a : run.x;
    const y = across ? run.y : run.y + a;
    const w = across ? b - a : run.w;
    const h = across ? run.h : b - a;
    return { x, y, w, h, kind, widthCm: (w / upm) * 100, depthCm: (h / upm) * 100 };
  });
}

type Side = "north" | "south" | "east" | "west";
const SIDES: Side[] = ["north", "south", "east", "west"];

/** What a room offers a piece: its floor, its walls, its doors, what already stands in it. */
function roomFitter(floor: DwfFloor, id: number, furniture: FurniturePiece[]) {
  const { cols, rows, cm, room, wall } = floor;
  const upm = floor.unitsPerMetre;
  const unitsPerPx = (upm * cm) / 100;
  let x0 = cols;
  let y0 = rows;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let k = 0; k < room.length; k++) {
    if (room[k] !== id) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
    count++;
  }
  if (count === 0) return null;
  const px = (c: number) => Math.round(c / cm);
  const reach = px(80);
  // The grid round the room, with a margin for the doors beside it.
  const gx0 = Math.max(0, x0 - reach);
  const gy0 = Math.max(0, y0 - reach);
  const W = Math.min(cols - 1, x1 + reach) - gx0 + 1;
  const H = Math.min(rows - 1, y1 + reach) - gy0 + 1;
  const at = (x: number, y: number) => (y + gy0) * cols + (x + gx0);
  const inRoom = new Uint8Array(W * H);
  const gap = new Uint8Array(W * H);
  const door = new Uint8Array(W * H);
  const glass = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = at(x, y);
      if (room[k] === id) inRoom[y * W + x] = 1;
      const v = wall[k]!;
      if (v === 3 || v === 4 || v === 5) gap[y * W + x] = 1;
      else if (v === 2) glass[y * W + x] = 1;
    }
  }
  // A house sheet closes its windows as it closes its doorways: a gap is a
  // door where another room lies across it, a window where the world does.
  const across = px(50);
  for (const g of components(gap, W, H)) {
    const flat = g.x1 - g.x0 >= g.y1 - g.y0;
    const [a0, a1] = flat ? [g.x0, g.x1] : [g.y0, g.y1];
    const inset = Math.floor((a1 - a0) * 0.2);
    let into = false;
    for (let t = a0 + inset; t <= a1 - inset && !into; t++) {
      for (let d = -across; d <= across + (flat ? g.y1 - g.y0 : g.x1 - g.x0) && !into; d++) {
        const x = flat ? t : g.x0 + d;
        const y = flat ? g.y0 + d : t;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const r = room[at(x, y)]!;
        into = r !== id && r !== 0 && r !== floor.outside;
      }
    }
    for (const k of g.pixels) (into ? door : glass)[k] = 1;
  }
  // A door's swing and the step in front of a doorway; a tall piece off the glass.
  const doorZone = dilate(door, W, H, px(75));
  const glassZone = dilate(glass, W, H, px(25));
  const pieces = new Uint8Array(W * H);
  const contents: FurniturePiece[] = [];
  const mark = (p: FurniturePiece, padCm: number) => {
    const pad = px(padCm);
    const a = Math.floor(p.x / unitsPerPx) - gx0 - pad;
    const b = Math.floor(p.y / unitsPerPx) - gy0 - pad;
    const c = Math.ceil((p.x + p.w) / unitsPerPx) - gx0 + pad;
    const d = Math.ceil((p.y + p.h) / unitsPerPx) - gy0 + pad;
    for (let y = Math.max(0, b); y < Math.min(H, d); y++) for (let x = Math.max(0, a); x < Math.min(W, c); x++) pieces[y * W + x] = 1;
  };
  for (const p of furniture) {
    const cx = Math.round((p.x + p.w / 2) / unitsPerPx);
    const cy = Math.round((p.y + p.h / 2) / unitsPerPx);
    if (cx >= 0 && cy >= 0 && cx < cols && cy < rows && room[cy * cols + cx] === id) contents.push(p);
    mark(p, 5);
  }
  let blocked = sum(W, H, (k) => !inRoom[k] || pieces[k]);
  let soft = sum(W, H, (k) => doorZone[k]);
  const tallOff = sum(W, H, (k) => glassZone[k]);
  const outside = sum(W, H, (k) => !inRoom[k]);
  const refresh = () => {
    blocked = sum(W, H, (k) => !inRoom[k] || pieces[k]);
    soft = sum(W, H, (k) => doorZone[k]);
  };
  const free = (x: number, y: number, w: number, h: number, tall = false) =>
    x >= 0 && y >= 0 && x + w <= W && y + h <= H && area(blocked, W, x, y, w, h) === 0 && area(soft, W, x, y, w, h) === 0 && (!tall || area(tallOff, W, x, y, w, h) === 0);
  const clear = (x: number, y: number, w: number, h: number) => x >= 0 && y >= 0 && x + w <= W && y + h <= H && area(blocked, W, x, y, w, h) === 0;
  // A side of a box is against a wall when what lies just past it is not the room.
  const backed = (x: number, y: number, w: number, h: number, side: Side) => {
    const [sx, sy, sw, sh] =
      side === "north" ? [x, y - 2, w, 2] : side === "south" ? [x, y + h, w, 2] : side === "west" ? [x - 2, y, 2, h] : [x + w, y, 2, h];
    if (sx < 0 || sy < 0 || sx + sw > W || sy + sh > H) return false;
    return area(outside, W, sx, sy, sw, sh) >= 0.85 * sw * sh;
  };
  const front = (x: number, y: number, w: number, h: number, side: Side, depth: number): [number, number, number, number] =>
    side === "north" ? [x, y + h, w, depth] : side === "south" ? [x, y - depth, w, depth] : side === "west" ? [x + w, y, depth, h] : [x - depth, y, depth, h];
  const piece = (x: number, y: number, w: number, h: number, kind: FurniturePiece["kind"]): FurniturePiece => ({
    x: (x + gx0) * unitsPerPx,
    y: (y + gy0) * unitsPerPx,
    w: w * unitsPerPx,
    h: h * unitsPerPx,
    kind,
    widthCm: w * cm,
    depthCm: h * cm,
  });
  const centre = { x: (x0 + x1) / 2 - gx0, y: (y0 + y1) / 2 - gy0 };

  /** The best place against a wall for a box `along` by `deep` pixels, its back to the wall. */
  const against = (along: number, deep: number, o: { clear: number; tall?: boolean; corner?: boolean }) => {
    let best: { x: number; y: number; w: number; h: number; side: Side; score: number } | null = null;
    for (const side of SIDES) {
      const w = side === "north" || side === "south" ? along : deep;
      const h = side === "north" || side === "south" ? deep : along;
      for (let y = 0; y + h <= H; y += 2) {
        for (let x = 0; x + w <= W; x += 2) {
          if (!free(x, y, w, h, o.tall) || !backed(x, y, w, h, side)) continue;
          const [fx, fy, fw, fh] = front(x, y, w, h, side, o.clear);
          if (!clear(fx, fy, fw, fh)) continue;
          const corner = SIDES.some((s) => s !== side && backed(x, y, w, h, s));
          const off = Math.hypot(x + w / 2 - centre.x, y + h / 2 - centre.y);
          const score = (corner === !!o.corner ? 1000 : 0) - off;
          if (!best || score > best.score) best = { x, y, w, h, side, score };
        }
      }
    }
    return best;
  };

  return {
    contents,
    areaM2: (count * cm * cm) / 10_000,
    take(p: FurniturePiece) {
      mark(p, 2);
      refresh();
    },
    /** Two single beds, their heads to one wall with a path between; one where two will not go. */
    beds(): FurniturePiece[] {
      for (const [n, wCm, lCm, gapCm] of [
        [2, 90, 200, 50],
        [2, 90, 190, 40],
        [1, 90, 200, 0],
        [1, 80, 190, 0],
      ] as const) {
        const along = px(n * wCm + gapCm * (n - 1));
        const spot = against(along, px(lCm), { clear: px(55) });
        if (!spot) continue;
        const across = spot.side === "north" || spot.side === "south";
        return Array.from({ length: n }, (_, i) => {
          const offset = px(i * (wCm + gapCm));
          const bed = across
            ? piece(spot.x + offset, spot.y, px(wCm), spot.h, "bed")
            : piece(spot.x, spot.y + offset, spot.w, px(wCm), "bed");
          return { ...bed, head: spot.side };
        });
      }
      return [];
    },
    /** One piece against a wall, the first of the lengths that fits. */
    wall(kind: FurniturePiece["kind"], depthCm: number, lengths: number[], o: { clearCm: number; tall?: boolean; corner?: boolean; fixture?: FurniturePiece["fixture"] }): FurniturePiece[] {
      for (const len of lengths) {
        const spot = against(px(len), px(depthCm), { clear: px(o.clearCm), tall: o.tall, corner: o.corner });
        if (!spot) continue;
        return [{ ...piece(spot.x, spot.y, spot.w, spot.h, kind), ...(o.fixture ? { fixture: o.fixture } : {}) }];
      }
      return [];
    },
    /** A worktop along a wall with its sink and its hob, into a corner where it can. */
    worktop(lengths: number[]): FurniturePiece[] {
      for (const len of lengths) {
        const spot = against(px(len), px(60), { clear: px(80), corner: true });
        if (spot) return withSinkAndHob(piece(spot.x, spot.y, spot.w, spot.h, "counter"), upm);
      }
      return [];
    },
    /**
     * A table standing free along the room's long way, as long as fits with
     * its chairs and a way round them, and a chair every 60 cm of its sides.
     */
    table(lengths: number[], widthCm: number): FurniturePiece[] {
      const ring = px(80);
      const roomLong = x1 - x0 >= y1 - y0;
      for (const len of lengths) {
        const wide = len <= 120 ? Math.min(widthCm, 80) : len <= 160 ? Math.min(widthCm, 90) : widthCm;
        let best: { x: number; y: number; w: number; h: number; score: number } | null = null;
        for (const along of [roomLong, !roomLong]) {
          const w = px(along ? len : wide);
          const h = px(along ? wide : len);
          for (let y = 0; y + h <= H; y += 2) {
            for (let x = 0; x + w <= W; x += 2) {
              if (!free(x, y, w, h) || !clear(x - ring, y - ring, w + 2 * ring, h + 2 * ring)) continue;
              const score = -Math.hypot(x + w / 2 - centre.x, y + h / 2 - centre.y) - (along === roomLong ? 0 : 50);
              if (!best || score > best.score) best = { x, y, w, h, score };
            }
          }
        }
        if (!best) continue;
        const table = piece(best.x, best.y, best.w, best.h, "table");
        const perSide = Math.max(2, Math.floor(len / 60));
        return [table, ...seatsAroundTable(table, upm, { perSide })];
      }
      return [];
    },
  };
}

/** Each four-connected run of set pixels, with its box. */
function components(mask: Uint8Array, W: number, H: number): Array<{ x0: number; y0: number; x1: number; y1: number; pixels: number[] }> {
  const seen = new Uint8Array(mask.length);
  const out: Array<{ x0: number; y0: number; x1: number; y1: number; pixels: number[] }> = [];
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k] || seen[k]) continue;
    const c = { x0: W, y0: H, x1: -1, y1: -1, pixels: [] as number[] };
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W;
      const y = (q - x) / W;
      c.pixels.push(q);
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
        if (n < 0 || !mask[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    out.push(c);
  }
  return out;
}

/** A summed-area table of the pixels that pass. */
function sum(W: number, H: number, on: (k: number) => unknown): Int32Array {
  const s = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += on(y * W + x) ? 1 : 0;
      s[(y + 1) * (W + 1) + x + 1] = s[y * (W + 1) + x + 1]! + row;
    }
  }
  return s;
}

/** How many pixels of a box pass, from a summed-area table. */
function area(s: Int32Array, W: number, x: number, y: number, w: number, h: number): number {
  const a = Math.max(0, x);
  const b = Math.max(0, y);
  const c = x + w;
  const d = y + h;
  if (c <= a || d <= b) return 0;
  const r = W + 1;
  return s[d * r + c]! - s[b * r + c]! - s[d * r + a]! + s[b * r + a]!;
}

/** The mask grown by `r` pixels, square. */
function dilate(src: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const along = new Uint8Array(src.length);
  for (let y = 0; y < H; y++) {
    let last = -Infinity;
    for (let x = 0; x < W; x++) {
      if (src[y * W + x]) last = x;
      if (x - last <= r) along[y * W + x] = 1;
    }
    last = Infinity;
    for (let x = W - 1; x >= 0; x--) {
      if (src[y * W + x]) last = x;
      if (last - x <= r) along[y * W + x] = 1;
    }
  }
  const out = new Uint8Array(src.length);
  for (let x = 0; x < W; x++) {
    let last = -Infinity;
    for (let y = 0; y < H; y++) {
      if (along[y * W + x]) last = y;
      if (y - last <= r) out[y * W + x] = 1;
    }
    last = Infinity;
    for (let y = H - 1; y >= 0; y--) {
      if (along[y * W + x]) last = y;
      if (last - y <= r) out[y * W + x] = 1;
    }
  }
  return out;
}
