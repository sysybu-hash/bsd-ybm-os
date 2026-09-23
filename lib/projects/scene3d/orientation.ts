import { FACING_REACH_M } from "@/lib/projects/scene3d/standards";
import type { Rect } from "@/lib/projects/scene3d/floors";

/**
 * Which way a piece of furniture faces.
 *
 * The measurement has no rotation field: a piece is an axis-aligned box, and
 * that is all the drawing gives. But a bed has a head, a sink has a tap and a
 * chair has a back, and putting them on the wrong side is the difference
 * between a render and a doll's house. So facing is derived, by rule, from
 * things that were measured — never sampled, never guessed at random.
 *
 * "Facing" names the direction the piece's BACK is turned: a bed whose
 * headboard is against the top wall of the page faces "north".
 */

export type Facing = "north" | "east" | "south" | "west";

/** Page axes: north is up the page (-y), east is +x. */
const ORDER: Facing[] = ["north", "east", "south", "west"];

function gapTo(piece: Rect, other: Rect, side: Facing): number | null {
  const overlapsX = other.x < piece.x + piece.w && other.x + other.w > piece.x;
  const overlapsY = other.y < piece.y + piece.h && other.y + other.h > piece.y;
  switch (side) {
    case "north":
      return overlapsX ? piece.y - (other.y + other.h) : null;
    case "south":
      return overlapsX ? other.y - (piece.y + piece.h) : null;
    case "west":
      return overlapsY ? piece.x - (other.x + other.w) : null;
    case "east":
      return overlapsY ? other.x - (piece.x + piece.w) : null;
  }
}

function nearestSide(piece: Rect, others: Rect[], reach: number): Facing | null {
  let best: { side: Facing; gap: number } | null = null;
  for (const side of ORDER) {
    for (const other of others) {
      const gap = gapTo(piece, other, side);
      if (gap == null || gap < -reach || gap > reach) continue;
      // The first side in ORDER wins a tie, which is what keeps this stable.
      if (!best || gap < best.gap - 1e-9) best = { side, gap };
    }
  }
  return best?.side ?? null;
}

export type FacingInput = {
  piece: Rect;
  /** Wall rectangles on the page. */
  walls: Rect[];
  /** Other measured pieces a back can be turned to — counters and tables. */
  anchors: Rect[];
  /** The centre of the room the piece stands in, page units. */
  roomCentre: { x: number; y: number };
  unitsPerMetre: number;
};

/**
 * The ordered rules, each one reading only measured geometry:
 *
 * 1. a wall within reach of one side — the back goes to the wall;
 * 2. else a counter or table within reach — the back goes to it, which puts a
 *    tap at the back of a sink and a chair's back away from the table;
 * 3. else away from the middle of the room;
 * 4. and where nothing decides, north, east, south, west in that order.
 */
export function facingFor(input: FacingInput): Facing {
  const reach = FACING_REACH_M * input.unitsPerMetre;
  const wall = nearestSide(input.piece, input.walls, reach);
  if (wall) return wall;
  const anchor = nearestSide(input.piece, input.anchors, reach);
  if (anchor) return anchor;

  const cx = input.piece.x + input.piece.w / 2;
  const cy = input.piece.y + input.piece.h / 2;
  const dx = cx - input.roomCentre.x;
  const dy = cy - input.roomCentre.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return "north";
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "north" : "south";
  return dx > 0 ? "east" : "west";
}

/** True when the piece's long axis runs down the page. */
export function runsDownThePage(piece: Rect): boolean {
  return piece.h > piece.w;
}
