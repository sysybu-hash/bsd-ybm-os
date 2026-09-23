import type { Facing } from "@/lib/projects/scene3d/orientation";
import type { MaterialId } from "@/lib/projects/scene3d/types";

/**
 * A piece of furniture, built from the box that was measured.
 *
 * The contract every constructor keeps, and a test enforces: the parts it
 * returns fit inside {wM, dM, hM}. A drawing says a bed is 0.90 by 2.00 and
 * the render must not make it 0.95 because a model looked better that way —
 * that is exactly the liberty this engine exists to take away.
 *
 * Parts are authored facing north — the piece's back towards the top of the
 * page — and rotated afterwards, so each constructor is written once.
 */

export type PieceSpec = {
  /** The measured box, metres. wM runs along the page's x, dM along its y. */
  wM: number;
  dM: number;
  /** Standing height from standards.ts. */
  hM: number;
  facing: Facing;
  /** Modesty rules, applied by the constructors that have to obey them. */
  haredi?: boolean;
};

export type PiecePart = {
  tag: string;
  material: MaterialId;
  /** Centre, relative to the piece's own centre; y is metres above the floor. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
};

export function part(
  tag: string,
  material: MaterialId,
  box: { x: number; y: number; z: number; w: number; h: number; d: number },
): PiecePart {
  return { tag, material, ...box };
}

/** Rotate a part from "facing north" into the facing the piece actually has. */
export function rotatePart(p: PiecePart, facing: Facing): PiecePart {
  switch (facing) {
    case "north":
      return p;
    case "south":
      return { ...p, x: -p.x, z: -p.z };
    case "east":
      return { ...p, x: -p.z, z: p.x, w: p.d, d: p.w };
    case "west":
      return { ...p, x: p.z, z: -p.x, w: p.d, d: p.w };
  }
}

/** The measured box as the constructors see it, with north as the back. */
export function facingBox(spec: PieceSpec): { w: number; d: number; h: number } {
  const swapped = spec.facing === "east" || spec.facing === "west";
  return { w: swapped ? spec.dM : spec.wM, d: swapped ? spec.wM : spec.dM, h: spec.hM };
}
