/**
 * The model's plan lines for one storey, sampled every 0.2 m, from a scene's
 * primitives (model.json). Only what a plan sheet draws as a cut line is
 * sampled: the two long faces of a wall box (not its ends, not lintels and
 * sills lower than 1 m), and the rings of prisms.
 */

import { samplePolyline, type KindPoint, type P2 } from "./sheet-fit";

type Box = { type: "box"; centre: { x: number; y: number; z: number }; size: { x: number; y: number; z: number }; rotY?: number; tag?: string };
type Prism = { type: "prism"; ring: P2[]; tag?: string };
export type ScenePrimitive = Box | Prism | { type: string; tag?: string };

/** Maps a primitive's tag (after the storey prefix) to a kind, or null to skip it. */
export type KindOf = (tagRest: string) => string | null;

/** The factory's kinds (live research 5.37): shell, room walls, corridor walls, ovens, stairs/lifts. */
export const FACTORY_KINDS: KindOf = (t) => {
  if (/^shell(?!:base)/.test(t)) return "מעטפת";
  if (/^room$/.test(t)) return "קירות חדרים";
  if (/^corridor-wall/.test(t)) return "קירות מסדרון";
  if (/^oven$/.test(t)) return "תנורים";
  if (/^stair|^elevator/.test(t)) return "מדרגות ומעליות";
  return null;
};

export function storeyPlanPoints(primitives: ScenePrimitive[], storey: string, kindOf: KindOf, step = 0.2): KindPoint[] {
  const pts: KindPoint[] = [];
  const prefix = `${storey}:`;
  for (const p of primitives) {
    if (!p.tag?.startsWith(prefix)) continue;
    const k = kindOf(p.tag.slice(prefix.length));
    if (!k) continue;
    if (p.type === "prism") {
      pts.push(...samplePolyline((p as Prism).ring, k, step));
    } else if (p.type === "box") {
      const b = p as Box;
      if (b.size.y < 1.0) continue; // lintels and sills: the plan cuts through the wall, not over them
      const r = -(b.rotY ?? 0);
      const ux = Math.cos(r);
      const uz = Math.sin(r);
      const vx = -uz;
      const vz = ux;
      const hx = b.size.x / 2;
      const hz = b.size.z / 2;
      const c = (sx: number, sz: number): P2 => [b.centre.x + ux * hx * sx + vx * hz * sz, b.centre.z + uz * hx * sx + vz * hz * sz];
      if (b.size.x >= b.size.z) {
        pts.push(...samplePolyline([c(-1, -1), c(1, -1)], k, step, false), ...samplePolyline([c(-1, 1), c(1, 1)], k, step, false));
      } else {
        pts.push(...samplePolyline([c(-1, -1), c(-1, 1)], k, step, false), ...samplePolyline([c(1, -1), c(1, 1)], k, step, false));
      }
    }
  }
  return pts;
}
