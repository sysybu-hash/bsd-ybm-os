import type { Facing } from "@/lib/projects/scene3d/orientation";
import type { MaterialId, SceneShape } from "@/lib/projects/scene3d/types";

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
  /** Which sanitary fixture, where the reading knows; otherwise told by shape. */
  fixture?: "bath" | "shower" | "toilet" | "basin" | "washer";
  /** Openings cut through a counter's top and carcass (its sinks'), in the piece's own frame: x, z of the centre and the width and depth, metres. */
  holes?: Array<{ x: number; z: number; w: number; d: number }>;
  /** A kitchen sink of two bowls: a haredi kitchen's one drawn sink (sinks.ts). */
  double?: boolean;
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
  /** Edges rounded to this radius, metres: a cushion is soft. */
  round?: number;
  /** Any other form (SceneShape): w, h, d are then its bounding box in the piece's own frame, before the piece is turned. */
  shape?: SceneShape;
  /** Turns about the vertical axis, radians, in the piece's own frame. */
  rotY?: number;
  /** Slopes about the x and z axes (a leaning back, a raked headboard), radians. */
  tiltX?: number;
  tiltZ?: number;
};

/** A part that is not an axis-aligned box: it keeps its own extents and is turned by the renderer, not by swapping w and d. */
const free = (p: PiecePart): boolean => p.shape != null || p.rotY != null || p.tiltX != null || p.tiltZ != null;

export function part(
  tag: string,
  material: MaterialId,
  box: { x: number; y: number; z: number; w: number; h: number; d: number },
  round?: number,
): PiecePart {
  return round ? { tag, material, ...box, round } : { tag, material, ...box };
}

/** Rotate a part from "facing north" into the facing the piece actually has. */
export function rotatePart(p: PiecePart, facing: Facing): PiecePart {
  // The turn a facing is, about the vertical axis (three's convention: x' = x cos + z sin, z' = −x sin + z cos).
  const turn = facing === "north" ? 0 : facing === "south" ? Math.PI : facing === "east" ? -Math.PI / 2 : Math.PI / 2;
  if (free(p)) {
    if (facing === "north") return p;
    const c = Math.cos(turn), s = Math.sin(turn);
    return { ...p, x: p.x * c + p.z * s, z: -p.x * s + p.z * c, rotY: (p.rotY ?? 0) + turn };
  }
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
