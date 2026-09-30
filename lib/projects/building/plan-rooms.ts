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

export type RoomLabel = { x: number; y: number; name: string; kind: RoomKind };

export type PlanRoom = {
  name: string;
  kind: RoomKind;
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
  // pixel to the name nearest it through the room.
  const owner = new Int32Array(cols * rows);
  const queue: number[] = [];
  labels.forEach((l, i) => {
    const k = Math.round(l.y / m) * cols + Math.round(l.x / m);
    if (regions.ids[k] && !owner[k]) {
      owner[k] = i + 1;
      queue.push(k);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    const x = c % cols;
    const y = (c - x) / cols;
    for (const n of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
      if (n < 0 || owner[n] || regions.ids[n] !== regions.ids[c]) continue;
      owner[n] = owner[c]!;
      queue.push(n);
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
    out.push({ name: l.name, kind: l.kind, areaM2: area * m * m, rows: rowsOut, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
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
