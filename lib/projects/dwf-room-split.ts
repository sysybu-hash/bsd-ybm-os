import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";

/**
 * A bathroom the floor reader left inside the passage it opens off.
 *
 * Where a door's swing does not close all the way, the reader takes a
 * bathroom and the landing outside it for one room — B's upper floor came out
 * with a 15.8 m² room holding a bath, a basin and a pan beside its stairs —
 * and the bathroom is lost: the whole is too large to be one and is built as
 * an empty passage. The room's shape still says where it was: its parts are
 * joined only through a doorway. The room is thinned by half a doorway's width
 * all round, which parts it at every door; each part takes back the floor
 * nearest it; and a part with a pan, a bath or a shower in it that meets the
 * rest along no more than a doorway is the bathroom, and becomes a room of its
 * own. Anything less clear-cut is left as read.
 *
 * Returns the new rooms' ids; the floor, its rooms and `own` (the flat's room
 * ids) are updated in place.
 */
export function splitWetChambers(floor: DwfFloor, own: number[], id: number, fixtures: FurniturePiece[]): number[] {
  const info = floor.rooms.find((r) => r.id === id);
  if (!info || info.areaM2 < 6) return [];
  const { cols, rows, cm, room } = floor;
  let x0 = cols;
  let y0 = rows;
  let x1 = -1;
  let y1 = -1;
  for (let k = 0; k < room.length; k++) {
    if (room[k] !== id) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return [];
  const W = x1 - x0 + 3;
  const H = y1 - y0 + 3;
  const at = (x: number, y: number) => (y + y0 - 1) * cols + (x + x0 - 1);
  const mask = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (room[at(x, y)] === id) mask[y * W + x] = 1;

  const dist = chamfer(mask, W, H);
  const r = 45 / cm;
  const label = new Int32Array(W * H);
  let parts = 0;
  const queue: number[] = [];
  for (let k = 0; k < mask.length; k++) {
    if (dist[k]! <= r || label[k]) continue;
    parts++;
    const stack = [k];
    label[k] = parts;
    while (stack.length) {
      const q = stack.pop()!;
      queue.push(q);
      for (const n of around(q, W, H)) {
        if (dist[n]! > r && !label[n]) {
          label[n] = parts;
          stack.push(n);
        }
      }
    }
  }
  if (parts < 2) return [];
  // The rest of the floor goes to the part it is nearest, by way of the room.
  for (let head = 0; head < queue.length; head++) {
    const q = queue[head]!;
    for (const n of around(q, W, H)) {
      if (mask[n] && !label[n]) {
        label[n] = label[q]!;
        queue.push(n);
      }
    }
  }

  const pixelM2 = (cm * cm) / 10_000;
  const area = new Array<number>(parts + 1).fill(0);
  const seam = new Array<number>(parts + 1).fill(0);
  for (let k = 0; k < mask.length; k++) {
    const l = label[k]!;
    if (!l) continue;
    area[l]!++;
    if (around(k, W, H).some((n) => label[n] && label[n] !== l)) seam[l]!++;
  }
  const unitsPerPx = (floor.unitsPerMetre * cm) / 100;
  const partOf = (p: FurniturePiece) => {
    const x = Math.round((p.x + p.w / 2) / unitsPerPx) - x0 + 1;
    const y = Math.round((p.y + p.h / 2) / unitsPerPx) - y0 + 1;
    return x >= 0 && y >= 0 && x < W && y < H ? label[y * W + x]! : 0;
  };
  const wet = new Set<number>();
  for (const f of fixtures) {
    if (f.fixture !== "toilet" && f.fixture !== "bath" && f.fixture !== "shower") continue;
    const l = partOf(f);
    if (l) wet.add(l);
  }
  const doorway = 110 / cm;
  const chosen = [...wet].filter((l) => {
    const m2 = area[l]! * pixelM2;
    return m2 >= 1 && m2 <= 9 && seam[l]! <= doorway;
  });
  const rest = area.reduce((s, a, l) => (l && !chosen.includes(l) ? s + a : s), 0) * pixelM2;
  if (chosen.length === 0 || rest < 3) return [];

  let next = Math.max(floor.outside, ...floor.rooms.map((q) => q.id)) + 1;
  const made: number[] = [];
  for (const l of chosen) {
    const newId = next++;
    for (let k = 0; k < mask.length; k++) {
      if (label[k] !== l) continue;
      const x = k % W;
      room[at(x, (k - x) / W)] = newId;
    }
    const m2 = Math.round(area[l]! * pixelM2 * 100) / 100;
    floor.rooms.push({ id: newId, areaM2: m2, kind: "bathroom", names: [] });
    info.areaM2 = Math.round((info.areaM2 - m2) * 100) / 100;
    own.push(newId);
    made.push(newId);
  }
  return made;
}

function around(k: number, W: number, H: number): number[] {
  const x = k % W;
  const out: number[] = [];
  if (x > 0) out.push(k - 1);
  if (x < W - 1) out.push(k + 1);
  if (k >= W) out.push(k - W);
  if (k < W * (H - 1)) out.push(k + W);
  return out;
}

/** Each set pixel's distance to the nearest unset one, in pixels (3-4 chamfer). */
function chamfer(mask: Uint8Array, W: number, H: number): Float32Array {
  const d = new Float32Array(W * H);
  for (let k = 0; k < d.length; k++) d[k] = mask[k] ? 1e9 : 0;
  const pass = (forward: boolean) => {
    const steps = forward
      ? [[-1, 0, 3], [0, -1, 3], [-1, -1, 4], [1, -1, 4]]
      : [[1, 0, 3], [0, 1, 3], [1, 1, 4], [-1, 1, 4]];
    for (let i = 0; i < H; i++) {
      const y = forward ? i : H - 1 - i;
      for (let j = 0; j < W; j++) {
        const x = forward ? j : W - 1 - j;
        const k = y * W + x;
        if (!d[k]) continue;
        let v = d[k]!;
        for (const [dx, dy, w] of steps) {
          const nx = x + dx!;
          const ny = y + dy!;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          v = Math.min(v, d[ny * W + nx]! + w!);
        }
        d[k] = v;
      }
    }
  };
  pass(true);
  pass(false);
  for (let k = 0; k < d.length; k++) d[k] = d[k]! / 3;
  return d;
}
