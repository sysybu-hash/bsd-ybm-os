import type { FlatScene, SceneBox, SceneRoom } from "@/lib/projects/scene3d/types";

/**
 * What a measured flat must never be, checked on the scene that is painted.
 *
 * The image model only paints what the scene holds, so a fault in the still
 * is a fault in the measurement: a room with no way in, a wall standing out
 * on a terrace, a space the sheet does not have. Each is found here, on the
 * finished scene, before any paid call — a flat with one is not handed to the
 * model at all.
 */
export type LayoutFault = {
  kind: "sealed room" | "wall on a terrace" | "unlabelled space" | "floating wall";
  /** Where, in scene metres: the fault's own box. */
  at: { x: number; z: number; w: number; d: number };
  detail: string;
};

type Box = { x0: number; x1: number; z0: number; z1: number };

const boxOf = (m: SceneBox): Box => ({
  x0: m.centre.x - m.size.x / 2,
  x1: m.centre.x + m.size.x / 2,
  z0: m.centre.z - m.size.z / 2,
  z1: m.centre.z + m.size.z / 2,
});

const rectBox = (r: { x: number; z: number; w: number; d: number }): Box => ({ x0: r.x, x1: r.x + r.w, z0: r.z, z1: r.z + r.d });

const gap = (a: Box, b: Box) =>
  Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.z0 - b.z1, b.z0 - a.z1, 0));

const inBoxes = (boxes: Box[], x: number, z: number, e = 0.03) =>
  boxes.some((b) => x >= b.x0 - e && x <= b.x1 + e && z >= b.z0 - e && z <= b.z1 + e);

/** Kinds of room a person walks into, and so needs a way in. */
const ENTERED = new Set(["living", "kitchen", "bedroom", "mmd", "bathroom", "utility", "other", "circulation"]);

export function auditFlatScene(
  scene: FlatScene,
  options?: {
    /** The rooms the sheet names, in scene metres; a space none of them covers is the measurement's. */
    labelled?: Array<{ name: string; box: { x: number; z: number; w: number; d: number } }>;
  },
): LayoutFault[] {
  const faults: LayoutFault[] = [];
  const terraces = scene.meshes.filter((m) => m.kind === "terrace").map(boxOf);
  const floors = scene.meshes.filter((m) => m.kind === "floor").map(boxOf);
  const walls = scene.meshes.filter((m) => m.kind === "wall");

  // 1. Every room a person enters has a door or an opening onto it. A window
  // is not a way in.
  const ways = scene.openings.filter((o) => o.kind === "door" || o.kind === "opening" || o.kind === "slider");
  for (const room of scene.rooms) {
    if (!ENTERED.has(room.kind) || room.areaM2 < 0.8) continue;
    const boxes = room.rects.map(rectBox);
    const reachable = ways.some((o) => {
      const ob: Box = { x0: o.centre.x - o.size.x / 2, x1: o.centre.x + o.size.x / 2, z0: o.centre.z - o.size.z / 2, z1: o.centre.z + o.size.z / 2 };
      return boxes.some((b) => gap(ob, b) <= 0.35);
    });
    // Or open onto the flat's floor past it with no wall between, along 60 cm
    // or more: a corridor runs on into the hall it leaves, a doorway is a gap.
    const wallBoxes = walls.map(boxOf);
    // Onto any floor of the flat past its own: the hall a door gap opens on
    // is often floor no room claims.
    const otherRooms = [...floors, ...terraces];
    let openRun = 0;
    if (!reachable) {
      const step = 0.1;
      for (const b of boxes) {
        const edges: Array<[number, number, number, number]> = [
          [b.x0, b.z0, b.x1, b.z0],
          [b.x0, b.z1, b.x1, b.z1],
          [b.x0, b.z0, b.x0, b.z1],
          [b.x1, b.z0, b.x1, b.z1],
        ];
        for (const [x0, z0, x1, z1] of edges) {
          const len = Math.hypot(x1 - x0, z1 - z0);
          const nx = z1 === z0 ? 0 : x0 === b.x0 && x1 === b.x0 ? -1 : 1;
          const nz = z1 === z0 ? (z0 === b.z0 ? -1 : 1) : 0;
          for (let t = step / 2; t < len; t += step) {
            const x = x0 + ((x1 - x0) * t) / len;
            const z = z0 + ((z1 - z0) * t) / len;
            const ox = x + nx * 0.12;
            const oz = z + nz * 0.12;
            if (inBoxes(boxes, ox, oz, 0)) continue;
            if (inBoxes(otherRooms, ox, oz) && !inBoxes(wallBoxes, x + nx * 0.06, z + nz * 0.06, 0)) openRun += step;
          }
        }
      }
    }
    if (!reachable && openRun < 0.6) {
      faults.push({ kind: "sealed room", at: room.bounds, detail: `${room.kind} "${room.name}", ${room.areaM2.toFixed(1)} m², has no door or opening` });
    }
  }

  // 2. No wall stands out on a terrace: terrace on both sides of it, along
  // most of its length, and no floor of the flat beside it.
  for (const m of walls) {
    const alongX = m.size.x >= m.size.z;
    const length = alongX ? m.size.x : m.size.z;
    const off = (alongX ? m.size.z : m.size.x) / 2 + 0.2;
    const n = Math.max(1, Math.round(length / 0.2));
    let out = 0;
    for (let i = 0; i < n; i++) {
      const t = (alongX ? m.centre.x : m.centre.z) - length / 2 + (length * (i + 0.5)) / n;
      const sides: Array<[number, number]> = alongX
        ? [[t, m.centre.z - off], [t, m.centre.z + off]]
        : [[m.centre.x - off, t], [m.centre.x + off, t]];
      if (sides.every(([x, z]) => inBoxes(terraces, x, z) )) out++;
    }
    if (out >= Math.max(1, n * 0.5)) {
      const b = boxOf(m);
      faults.push({ kind: "wall on a terrace", at: { x: b.x0, z: b.z0, w: b.x1 - b.x0, d: b.z1 - b.z0 }, detail: `${m.sourceId}, ${length.toFixed(2)} m, terrace on both sides` });
    }
  }

  // 3. No wall stands clear of everything: no floor, terrace or other wall
  // within a hand of it.
  // A window's sill and head are wall too: a wall run cut by a window stands on them.
  const built = scene.meshes.filter((m) => m.kind === "wall" || m.kind === "wallSill" || m.kind === "wallHead" || m.kind === "wallCap");
  const others = (m: SceneBox) => built.filter((w) => w !== m).map(boxOf);
  for (const m of walls) {
    const b = boxOf(m);
    const grown: Box = { x0: b.x0 - 0.15, x1: b.x1 + 0.15, z0: b.z0 - 0.15, z1: b.z1 + 0.15 };
    const touches = (list: Box[]) => list.some((o) => gap(grown, o) <= 0);
    if (!touches(floors) && !touches(terraces) && !touches(others(m))) {
      faults.push({ kind: "floating wall", at: { x: b.x0, z: b.z0, w: b.x1 - b.x0, d: b.z1 - b.z0 }, detail: `${m.sourceId} touches nothing` });
    }
  }

  // 4. A room the sheet names nowhere, of a size a room is: the measurement
  // made it. Only where the sheet's labels are read.
  if (options?.labelled && options.labelled.length > 0) {
    const labels = options.labelled.map((l) => rectBox(l.box));
    for (const room of scene.rooms) {
      if (room.kind === "balcony" || room.kind === "circulation" || room.areaM2 < 1.5) continue;
      const covered = room.rects.some((r) => labels.some((l) => gap(rectBox(r), l) <= 0));
      if (!covered) faults.push({ kind: "unlabelled space", at: room.bounds, detail: `${room.kind} "${room.name}", ${room.areaM2.toFixed(1)} m², under no name the sheet prints` });
    }
  }
  return faults;
}

/** The faults as lines, for a log or a refusal. */
export function describeFaults(faults: LayoutFault[]): string {
  return faults.map((f) => `${f.kind}: ${f.detail}`).join("; ");
}

export type { SceneRoom };
