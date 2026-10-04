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
const OPPOSITE: Record<Facing, Facing> = { north: "south", south: "north", east: "west", west: "east" };

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
    // Overlapping a wall is standing against it, however deep the overlap
    // short of the piece's own middle: 14's sofa ran 15 cm into the wall
    // behind it, past the reach, and was turned to face that wall.
    const half = (side === "north" || side === "south" ? piece.h : piece.w) / 2;
    for (const other of others) {
      const gap = gapTo(piece, other, side);
      if (gap == null || gap < -Math.max(reach, half) || gap > reach) continue;
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
  /**
   * A seat: its back goes AWAY from the table it stands at. Rule 2 turns a
   * piece's back to the counter beside it, which is right for a sink's tap
   * and backwards for a chair — דירה 21's dining chairs sat facing out.
   */
  seat?: boolean;
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
  // A chair at a table faces the table, even where a wall is as near.
  if (input.seat) {
    const table = nearestSide(input.piece, input.anchors, reach);
    if (table) return OPPOSITE[table];
  }
  const wall = nearestSide(input.piece, input.walls, reach);
  if (wall) return wall;
  const anchor = nearestSide(input.piece, input.anchors, reach);
  if (anchor) return input.seat ? OPPOSITE[anchor] : anchor;

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

/**
 * A bed's head goes at a short end, whatever the room would otherwise say.
 *
 * Nobody sleeps across a mattress, and the oblique plate already puts the
 * pillow at the short end by the same rule — so the two renderers put the head
 * of every bed at the same end of the same rectangle.
 */
export function headFacing(piece: Rect, facing: Facing, walls: Rect[] = []): Facing {
  const down = runsDownThePage(piece);
  const alongLongAxis = down ? facing === "north" || facing === "south" : facing === "east" || facing === "west";
  if (alongLongAxis) return facing;
  // Its long side is against the wall: the head goes to whichever short end
  // is nearer a wall. North by default turned דירה 14's shelter bed, pillow
  // drawn at the south wall, end for end.
  const ends: [Facing, Facing] = down ? ["north", "south"] : ["west", "east"];
  const distance = (side: Facing) => {
    let best = Infinity;
    for (const wall of walls) {
      const gap = gapTo(piece, wall, side);
      if (gap != null && gap > -(down ? piece.h : piece.w) / 2) best = Math.min(best, Math.max(0, gap));
    }
    return best;
  };
  const [a, b] = [distance(ends[0]), distance(ends[1])];
  if (b < a) return ends[1];
  return ends[0];
}
