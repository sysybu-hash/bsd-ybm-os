import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import type { PlanItem } from "@/lib/projects/building/plan-furniture";
import { roomRects, type PlanRoom, type RoomKind } from "@/lib/projects/building/plan-rooms";

/**
 * A floor furnished and finished room by room.
 *
 * The floor finish, the ceiling and its lights follow each room's use. The
 * furniture is what the sheet draws, each item named by its size and the
 * room it stands in — a 50 cm square in a classroom is a chair, a 3.4 m by
 * 1.2 m bench in a computer room is a row of workstations — and built from a
 * few parts. Where the sheet draws only the chairs of a table, two facing
 * rows of chairs, the table between them is put back.
 */
const FLOOR: Record<RoomKind, BuildingMaterial> = {
  hall: "floorWood",
  classroom: "floorVinyl",
  computers: "carpet",
  design: "floorWood",
  workshop: "floorVinyl",
  office: "floorWood",
  lobby: "floorStone",
  corridor: "floorStone",
  kitchen: "floorStone",
  wc: "ceramic",
  mmd: "floorVinyl",
  stair: "floorStone",
  lift: "floorStone",
  store: "floorVinyl",
  void: "floorStone",
};

export type FurnishOptions = {
  level: number;
  tag: string;
  /** Clear height under the suspended ceiling. */
  ceilingM: number;
  /** Rooms that open to the floor above: no ceiling. */
  openAbove?: RoomKind[];
  /** Where the floor above is open — a double-height hall: no ceiling under it. */
  voids?: Array<{ x: number; y: number; w: number; h: number }>;
};

type Piece = { kind: string; x: number; y: number; length: number; width: number; angle: number };

export function furnishFloor(rooms: PlanRoom[], items: PlanItem[], options: FurnishOptions): Primitive[] {
  const out: Primitive[] = [];
  const { level, tag } = options;
  const step = 0.02;

  for (const room of rooms) {
    const rects = roomRects(room, step).filter((r) => r.w > 0.05 && r.h > 0.05);
    if (room.kind !== "void") {
      for (const r of mergeRects(rects)) {
        out.push({ type: "box", centre: { x: r.x + r.w / 2, y: level + 0.025, z: r.y + r.h / 2 }, size: { x: r.w, y: 0.01, z: r.h }, material: FLOOR[room.kind], tag: `${tag}:finish` });
      }
    }
    const open = room.kind === "void" || room.kind === "stair" || (options.openAbove ?? []).includes(room.kind);
    if (!open) {
      const underVoid = (r: { x: number; y: number; w: number; h: number }) =>
        (options.voids ?? []).some((v) => r.x < v.x + v.w && r.x + r.w > v.x && r.y < v.y + v.h && r.y + r.h > v.y);
      for (const whole of mergeRects(rects)) {
        for (const r of cutAway(whole, options.voids ?? [])) {
          out.push({ type: "box", centre: { x: r.x + r.w / 2, y: level + options.ceilingM + 0.01, z: r.y + r.h / 2 }, size: { x: r.w, y: 0.02, z: r.h }, material: "ceiling", tag: `${tag}:ceiling` });
        }
      }
      // Light panels, 60 cm square, on a 2.4 m grid across the room.
      const b = room.bounds;
      for (let y = b.y + 1.2; y < b.y + b.h - 0.6; y += 2.4) {
        for (let x = b.x + 1.2; x < b.x + b.w - 0.6; x += 2.4) {
          if (!inRoom(room, x, y) || underVoid({ x: x - 0.3, y: y - 0.3, w: 0.6, h: 0.6 })) continue;
          out.push({ type: "box", centre: { x, y: level + options.ceilingM - 0.005, z: y }, size: { x: 0.6, y: 0.012, z: 0.6 }, material: "lightPanel", tag: `${tag}:light` });
        }
      }
    }
  }

  const pieces: Piece[] = [];
  for (const it of items) {
    const room = rooms.find((r) => inRoom(r, it.x, it.y));
    if (!room || room.kind === "stair" || room.kind === "lift" || room.kind === "wc" || room.kind === "void") continue;
    const kind = classify(it, room.kind);
    if (kind) pieces.push({ kind, x: it.x, y: it.y, length: it.length, width: it.width, angle: it.angle });
  }
  pieces.push(...tablesBetweenRows(pieces));
  for (const p of pieces) out.push(...build(p, level, `${tag}:furniture`));
  return out;
}

function classify(it: PlanItem, room: RoomKind): string | null {
  const { length: L, width: W, roundness } = it;
  if (L >= 0.38 && L <= 0.75 && W >= 0.3) return room === "lobby" && L > 0.65 ? "armchair" : "chair";
  if (L > 0.75 && L <= 1.0 && W >= 0.6) return room === "lobby" || room === "design" || room === "classroom" ? "armchair" : "table";
  if (roundness >= 0.8 && L >= 0.9 && L <= 2.2) return "roundTable";
  if (room === "computers" && L >= 2.4 && L <= 4.2 && W >= 0.9 && W <= 1.6) return "computerBench";
  if (room === "office" && L >= 1.4 && L <= 2.4 && W >= 1.1 && W <= 1.8) return "workstation";
  if ((room === "lobby" || room === "design" || room === "classroom") && L >= 1.2 && L <= 3.0 && W >= 0.7 && W <= 1.0) return "sofa";
  if (L >= 1.0 && L <= 3.6 && W >= 0.55 && W <= 1.6) return "table";
  return null;
}

/** Two rows of three and more chairs facing across a gap a table wide: the table. */
function tablesBetweenRows(pieces: Piece[]): Piece[] {
  const chairs = pieces.filter((p) => p.kind === "chair");
  const rows: Piece[][] = [];
  for (const c of chairs) {
    const row = rows.find((r) => Math.abs(r[0]!.y - c.y) < 0.12 && r.some((o) => Math.abs(o.x - c.x) < 0.75));
    if (row) row.push(c);
    else rows.push([c]);
  }
  const long = rows.filter((r) => r.length >= 3).map((r) => r.sort((a, b) => a.x - b.x));
  const out: Piece[] = [];
  const used = new Set<Piece[]>();
  for (const a of long) {
    if (used.has(a)) continue;
    for (const b of long) {
      if (a === b || used.has(b)) continue;
      const gap = b[0]!.y - a[0]!.y;
      if (gap < 0.8 || gap > 1.7) continue;
      const x0 = Math.max(a[0]!.x, b[0]!.x) - 0.3;
      const x1 = Math.min(a[a.length - 1]!.x, b[b.length - 1]!.x) + 0.3;
      if (x1 - x0 < 1.2) continue;
      // Clear of any table already drawn there.
      const y = (a[0]!.y + b[0]!.y) / 2;
      if (pieces.some((p) => p.kind === "table" && Math.abs(p.y - y) < 0.4 && p.x > x0 && p.x < x1)) continue;
      out.push({ kind: "table", x: (x0 + x1) / 2, y, length: x1 - x0, width: gap - 0.5, angle: 0 });
      used.add(a);
      used.add(b);
      break;
    }
  }
  return out;
}

/** A piece from a few parts, stood at the floor's level. */
function build(p: Piece, level: number, tag: string): Primitive[] {
  const out: Primitive[] = [];
  const ca = Math.cos(p.angle);
  const sa = Math.sin(p.angle);
  /** A part at (u, v) in the piece's own frame, u along its length. */
  const part = (u: number, v: number, lu: number, lv: number, y0: number, y1: number, material: BuildingMaterial) => {
    out.push({
      type: "box",
      centre: { x: p.x + u * ca - v * sa, y: level + (y0 + y1) / 2, z: p.y + u * sa + v * ca },
      size: { x: lu, y: y1 - y0, z: lv },
      rotY: -p.angle,
      material,
      tag,
    });
  };
  const legs = (lu: number, lv: number, h: number, inset = 0.04, t = 0.04) => {
    for (const su of [-1, 1]) for (const sv of [-1, 1]) part(su * (lu / 2 - inset), sv * (lv / 2 - inset), t, t, 0, h, "metal");
  };
  switch (p.kind) {
    case "chair": {
      const s = Math.min(0.5, p.length);
      legs(s * 0.9, s * 0.9, 0.44, 0.04, 0.025);
      part(0, 0, s * 0.95, s * 0.95, 0.44, 0.48, "upholstery");
      part(0, s * 0.45, s * 0.95, 0.04, 0.48, 0.86, "upholstery");
      break;
    }
    case "armchair":
      part(0, 0, p.length, p.width, 0.1, 0.42, "upholsteryAccent");
      part(0, p.width / 2 - 0.08, p.length, 0.16, 0.42, 0.8, "upholsteryAccent");
      part(-p.length / 2 + 0.07, 0, 0.14, p.width, 0.42, 0.6, "upholsteryAccent");
      part(p.length / 2 - 0.07, 0, 0.14, p.width, 0.42, 0.6, "upholsteryAccent");
      break;
    case "sofa":
      part(0, 0, p.length, p.width, 0.1, 0.42, "upholstery");
      part(0, p.width / 2 - 0.1, p.length, 0.2, 0.42, 0.82, "upholstery");
      part(-p.length / 2 + 0.08, 0, 0.16, p.width, 0.42, 0.62, "upholstery");
      part(p.length / 2 - 0.08, 0, 0.16, p.width, 0.42, 0.62, "upholstery");
      break;
    case "table":
      legs(p.length, p.width, 0.72);
      part(0, 0, p.length, p.width, 0.72, 0.75, "timber");
      break;
    case "roundTable":
      out.push({ type: "cylinder", centre: { x: p.x, y: level + 0.36, z: p.y }, radius: 0.05, height: 0.72, material: "metal", tag });
      out.push({ type: "cylinder", centre: { x: p.x, y: level + 0.735, z: p.y }, radius: Math.min(p.length, 1.8) / 2, height: 0.03, material: "timber", tag });
      break;
    case "workstation":
      legs(1.6, 0.8, 0.72);
      part(0, -p.width / 2 + 0.4, 1.6, 0.8, 0.72, 0.75, "timber");
      part(0, -p.width / 2 + 0.2, 0.55, 0.03, 0.78, 1.12, "screen");
      part(0, p.width / 2 - 0.3, 0.5, 0.5, 0.44, 0.48, "upholstery");
      part(0, p.width / 2 - 0.08, 0.5, 0.05, 0.48, 1.0, "upholstery");
      break;
    case "computerBench": {
      legs(p.length, p.width, 0.72);
      part(0, 0, p.length, p.width, 0.72, 0.75, "worktop");
      // Screens back to back down the middle, a chair at each.
      const n = Math.max(2, Math.floor(p.length / 0.85));
      for (let i = 0; i < n; i++) {
        const u = -p.length / 2 + (p.length / n) * (i + 0.5);
        for (const side of [-1, 1]) {
          part(u, side * 0.1, 0.52, 0.03, 0.8, 1.12, "screen");
          part(u, side * (p.width / 2 + 0.3), 0.48, 0.48, 0.44, 0.48, "upholstery");
          part(u, side * (p.width / 2 + 0.52), 0.48, 0.05, 0.48, 0.95, "upholstery");
        }
      }
      break;
    }
  }
  return out;
}

export function inRoom(room: PlanRoom, x: number, y: number): boolean {
  const row = room.rows.find((r) => Math.abs(r.y - y) < 0.011);
  return !!row && row.spans.some(([a, b]) => x >= a && x < b);
}

/** A rectangle less the parts of it under any void: up to four pieces round each. */
function cutAway(r: { x: number; y: number; w: number; h: number }, voids: Array<{ x: number; y: number; w: number; h: number }>) {
  let pieces = [r];
  for (const v of voids) {
    const next: typeof pieces = [];
    for (const p of pieces) {
      const ix0 = Math.max(p.x, v.x);
      const ix1 = Math.min(p.x + p.w, v.x + v.w);
      const iy0 = Math.max(p.y, v.y);
      const iy1 = Math.min(p.y + p.h, v.y + v.h);
      if (ix0 >= ix1 || iy0 >= iy1) {
        next.push(p);
        continue;
      }
      if (iy0 > p.y) next.push({ x: p.x, y: p.y, w: p.w, h: iy0 - p.y });
      if (iy1 < p.y + p.h) next.push({ x: p.x, y: iy1, w: p.w, h: p.y + p.h - iy1 });
      if (ix0 > p.x) next.push({ x: p.x, y: iy0, w: ix0 - p.x, h: iy1 - iy0 });
      if (ix1 < p.x + p.w) next.push({ x: ix1, y: iy0, w: p.x + p.w - ix1, h: iy1 - iy0 });
    }
    pieces = next;
  }
  return pieces;
}

/** Merge thin row rectangles that share their x span into larger ones. */
function mergeRects(rects: Array<{ x: number; y: number; w: number; h: number }>) {
  const sorted = [...rects].sort((a, b) => a.x - b.x || a.y - b.y);
  const out: typeof rects = [];
  for (const r of sorted) {
    const last = out.find((o) => Math.abs(o.x - r.x) < 1e-6 && Math.abs(o.w - r.w) < 1e-6 && Math.abs(o.y + o.h - r.y) < 0.03);
    if (last) last.h = r.y + r.h - last.y;
    else out.push({ ...r });
  }
  return out;
}
