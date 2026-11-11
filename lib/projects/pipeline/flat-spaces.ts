/**
 * A flat's spaces as a booklet names them: the rooms the sheet labels, an
 * open kitchen counted with its living room, and the balconies as the
 * terrace slabs draw them. Shared by the orientation key and the measured plan.
 */
import type { FlatScene } from "@/lib/projects/scene3d/types";

export type SpaceRect = { x: number; z: number; w: number; d: number };
export type FlatSpace = { name: string; rects: SpaceRect[]; outside?: boolean; wet?: boolean };

export const f1 = (n: number) => n.toFixed(1);
export const areaOf = (rects: SpaceRect[]) => rects.reduce((t, r) => t + r.w * r.d, 0);
const largest = (rects: SpaceRect[]) => [...rects].sort((a, b) => b.w * b.d - a.w * a.d)[0]!;

export function flatSpaces(scene: FlatScene): { rooms: FlatSpace[]; balconies: FlatSpace[]; spaces: FlatSpace[]; insideM2: number; outsideM2: number } {
  const living = scene.rooms.filter((r) => r.kind === "living").sort((a, b) => b.areaM2 - a.areaM2)[0];
  const kitchenRects = living ? scene.rooms.filter((r) => r.kind === "kitchen").flatMap((r) => r.rects) : [];
  let bedroom = 0;
  const rooms: FlatSpace[] = scene.rooms
    .filter((r) => r.kind !== "balcony" && !(living && r.kind === "kitchen"))
    .map((r) => ({
      name: r.kind === "bedroom" ? `חדר שינה ${++bedroom}` : r === living && kitchenRects.length ? "סלון ומטבח" : r.name,
      rects: r === living ? [...r.rects, ...kitchenRects] : r.rects,
      wet: r.kind === "bathroom",
    }));
  const terraces = new Map<string, SpaceRect[]>();
  for (const m of scene.meshes) {
    if (m.kind !== "terrace" || m.sourceId.includes("/") || m.size.y > 0.1) continue;
    terraces.set(m.sourceId, [...(terraces.get(m.sourceId) ?? []), { x: m.centre.x - m.size.x / 2, z: m.centre.z - m.size.z / 2, w: m.size.x, d: m.size.z }]);
  }
  const balconies: FlatSpace[] = [...terraces.values()]
    .filter((rects) => areaOf(rects) >= 1)
    .sort((a, b) => areaOf(b) - areaOf(a))
    .map((rects, i) => ({ name: `מרפסת ${i + 1}`, rects, outside: true }));
  return {
    rooms,
    balconies,
    spaces: [...rooms, ...balconies],
    insideM2: rooms.reduce((t, s) => t + areaOf(s.rects), 0),
    outsideM2: balconies.reduce((t, s) => t + areaOf(s.rects), 0),
  };
}

/** A space's size: its bounding box when it nearly fills it (a room with a niche), else its largest rectangle. */
export function sizeRect(s: FlatSpace): SpaceRect {
  const x0 = Math.min(...s.rects.map((r) => r.x));
  const z0 = Math.min(...s.rects.map((r) => r.z));
  const bb = { x: x0, z: z0, w: Math.max(...s.rects.map((r) => r.x + r.w)) - x0, d: Math.max(...s.rects.map((r) => r.z + r.d)) - z0 };
  return areaOf(s.rects) >= 0.75 * bb.w * bb.d ? bb : largest(s.rects);
}

/** Length by width for a space that is a rectangle; an open L-shaped space has no one size. */
export function dimsOf(s: FlatSpace): string {
  const r = sizeRect(s);
  return r === largest(s.rects) && s.rects.length > 1 ? "—" : `${f1(r.w)} × ${f1(r.d)}`;
}

export function centreOf(s: FlatSpace): { x: number; z: number } {
  const r = sizeRect(s);
  return { x: r.x + r.w / 2, z: r.z + r.d / 2 };
}
