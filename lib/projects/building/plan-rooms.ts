import { insidePolygon, type Outline } from "@/lib/projects/building/assemble";
import type { PlanOpening } from "@/lib/projects/building/plan-openings";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { label } from "@/lib/projects/building/raster";

/**
 * A floor's rooms: its free space flooded between the walls, every opening
 * shut, within the floor's outline — each region named by the label the
 * sheet sets in it.
 */
export type RoomKind =
  | "hall"
  | "classroom"
  | "computers"
  | "design"
  | "workshop"
  | "office"
  | "lobby"
  | "corridor"
  | "kitchen"
  | "wc"
  | "mmd"
  | "stair"
  | "lift"
  | "store"
  | "void";

export type RoomLabel = {
  x: number;
  y: number;
  name: string;
  kind: RoomKind;
  /** The area the sheet prints for the room, m²: an open plan's rooms are grown to it. */
  areaM2?: number;
};

export type PlanRoom = {
  name: string;
  kind: RoomKind;
  /** The open region the room is part of: rooms sharing one are one floor. */
  region: number;
  areaM2: number;
  /** Rows of spans, metres: the room's floor. */
  rows: Array<{ y: number; spans: Array<[number, number]> }>;
  bounds: { x: number; y: number; w: number; h: number };
};

export function readPlanRooms(walls: PlanWalls, openings: PlanOpening[], outline: Outline, labels: RoomLabel[]): PlanRoom[] {
  const { cols, rows } = walls.mask;
  const m = walls.cm / 100;
  const blocked = { cols, rows, data: new Uint8Array(walls.mask.data) };
  // Shut every opening, and everything outside the floor.
  for (const o of openings) {
    for (let y = Math.floor(o.y / m); y <= Math.ceil((o.y + o.h) / m); y++) {
      for (let x = Math.floor(o.x / m); x <= Math.ceil((o.x + o.w) / m); x++) {
        if (x >= 0 && y >= 0 && x < cols && y < rows) blocked.data[y * cols + x] = 1;
      }
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (!insidePolygon(outline, x * m, y * m)) blocked.data[y * cols + x] = 1;
  }
  const regions = label(blocked, 0);
  // An open plan — a movable partition, a counter, a wide opening — is one
  // region under several names. It is shared out by walking distance: each
  // pixel to the name nearest it through the room. Where the sheet prints a
  // room's area, a name's reach is lengthened or shortened until the room
  // is the area printed (the open plan draws no outline of its own).
  const assign = (reachPx: number[]): Int32Array => {
    const owner = new Int32Array(cols * rows);
    const time = new Int32Array(cols * rows).fill(0x7fffffff);
    const maxReach = Math.max(0, ...reachPx);
    const buckets: number[][] = [];
    const push = (t: number, c: number) => (buckets[t] ??= []).push(c);
    labels.forEach((l, i) => {
      const k = Math.round(l.y / m) * cols + Math.round(l.x / m);
      if (!regions.ids[k] || owner[k]) return;
      const t0 = Math.round(maxReach - reachPx[i]!);
      owner[k] = i + 1;
      time[k] = t0;
      push(t0, k);
    });
    for (let t = 0; t < buckets.length; t++) {
      const list = buckets[t];
      if (!list) continue;
      for (let h = 0; h < list.length; h++) {
        const c = list[h]!;
        if (time[c] !== t) continue;
        const x = c % cols;
        const y = (c - x) / cols;
        for (const n of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
          if (n < 0 || regions.ids[n] !== regions.ids[c] || time[n]! <= t + 1) continue;
          time[n] = t + 1;
          owner[n] = owner[c]!;
          push(t + 1, n);
        }
      }
    }
    return owner;
  };
  const reach = labels.map(() => 0);
  let owner = assign(reach);
  if (labels.some((l) => l.areaM2)) {
    for (let round = 0; round < 24; round++) {
      const area = new Float64Array(labels.length + 1);
      for (let i = 0; i < owner.length; i++) if (owner[i]) area[owner[i]!]! += m * m;
      // Only rooms of an open plan can move: a region with one name is what its walls make it.
      const share = new Map<number, number>();
      labels.forEach((l, i) => {
        const at = Math.round(l.y / m) * cols + Math.round(l.x / m);
        const r = regions.ids[at];
        if (r) share.set(r, (share.get(r) ?? 0) + 1);
      });
      let worst = 0;
      labels.forEach((l, i) => {
        const at = Math.round(l.y / m) * cols + Math.round(l.x / m);
        if (!l.areaM2 || (share.get(regions.ids[at]!) ?? 0) < 2) return;
        const have = area[i + 1]!;
        worst = Math.max(worst, Math.abs(have - l.areaM2) / l.areaM2);
        reach[i] = reach[i]! + ((Math.sqrt(l.areaM2) - Math.sqrt(have)) * 0.7) / m;
      });
      if (worst < 0.03) break;
      owner = assign(reach);
    }
  }
  const out: PlanRoom[] = [];
  for (const [index, l] of labels.entries()) {
    const id = index + 1;
    if (!owner.includes(id)) continue;
    const rowsOut: PlanRoom["rows"] = [];
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let area = 0;
    for (let y = 0; y < rows; y++) {
      const spans: Array<[number, number]> = [];
      let start = -1;
      for (let x = 0; x <= cols; x++) {
        const on = x < cols && owner[y * cols + x] === id;
        if (on && start < 0) start = x;
        else if (!on && start >= 0) {
          spans.push([start * m, x * m]);
          area += x - start;
          x0 = Math.min(x0, start * m);
          x1 = Math.max(x1, x * m);
          start = -1;
        }
      }
      if (spans.length) {
        rowsOut.push({ y: y * m, spans });
        y0 = Math.min(y0, y * m);
        y1 = Math.max(y1, (y + 1) * m);
      }
    }
    const at = Math.round(l.y / m) * cols + Math.round(l.x / m);
    out.push({ name: l.name, kind: l.kind, region: regions.ids[at]!, areaM2: area * m * m, rows: rowsOut, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  }
  return out;
}

/** The room's floor merged into rectangles: runs of rows with the same spans. */
export function roomRects(room: PlanRoom, step: number): Array<{ x: number; y: number; w: number; h: number }> {
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  let open: Array<{ x: number; y: number; w: number; h: number; key: string }> = [];
  for (const row of room.rows) {
    const next: typeof open = [];
    for (const [a, b] of row.spans) {
      const key = `${a.toFixed(3)}:${b.toFixed(3)}`;
      const run = open.find((r) => r.key === key && Math.abs(r.y + r.h - row.y) < step * 0.5);
      if (run) {
        run.h += step;
        next.push(run);
      } else next.push({ x: a, y: row.y, w: b - a, h: step, key });
    }
    for (const r of open) if (!next.includes(r)) out.push(r);
    open = next;
  }
  out.push(...open);
  return out.map(({ x, y, w, h }) => ({ x, y, w, h }));
}
