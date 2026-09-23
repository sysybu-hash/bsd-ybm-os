/**
 * A wall, with the holes the drawing cuts in it.
 *
 * The measurement gives walls and openings as separate axis-aligned bands, each
 * a run along its own axis. Drawing a wall whole bricks up every door, so the
 * run is split around each overlapping opening — and the parts of the wall that
 * remain above and below a hole are walls too: the head over a door, the sill
 * under a window. Those bands are what make an opening read as a door or a
 * window rather than as a gap.
 */

export type Band = {
  orientation: "h" | "v";
  centre: number;
  thickness: number;
  from: number;
  to: number;
};

/** An opening placed in a wall, with the heights it spans. */
export type WallHole = {
  id: string;
  hole: Band;
  /** Metres. A door starts at the floor; a window at its sill. */
  sillM: number;
  headM: number;
};

export type WallBandRole = "wall" | "head" | "sill";

export type WallBand = {
  role: WallBandRole;
  /** Along the wall's own axis, in drawing units. */
  from: number;
  to: number;
  /** Metres, floor upwards. */
  y0: number;
  y1: number;
  /** Set on a head or a sill: which opening it belongs to. */
  openingId?: string;
};

/** Does this opening sit in this wall? Same axis, same line, overlapping run. */
export function holeIsInWall(wall: Band, hole: Band): boolean {
  return (
    hole.orientation === wall.orientation &&
    Math.abs(hole.centre - wall.centre) <= Math.max(wall.thickness, hole.thickness) &&
    hole.to > wall.from &&
    hole.from < wall.to
  );
}

/**
 * A wall with its doorways taken out.
 *
 * Moved here from the 3D viewer component so the scene model and the viewer
 * cannot drift apart; the viewer's own test still covers it through the
 * re-export.
 */
export function wallPieces(wall: Band, openings: Band[]): Array<{ from: number; to: number }> {
  const holes = openings
    .filter((hole) => holeIsInWall(wall, hole))
    .map((hole) => ({ from: Math.max(hole.from, wall.from), to: Math.min(hole.to, wall.to) }))
    .sort((a, b) => a.from - b.from);

  const pieces: Array<{ from: number; to: number }> = [];
  let cursor = wall.from;
  for (const hole of holes) {
    if (hole.from > cursor) pieces.push({ from: cursor, to: hole.from });
    cursor = Math.max(cursor, hole.to);
  }
  if (cursor < wall.to) pieces.push({ from: cursor, to: wall.to });
  return pieces;
}

/**
 * Every solid band of one wall: the full-height pieces between its openings,
 * and the head and sill bands that close each opening above and below.
 *
 * Volume is conserved by construction — the bands are exactly the wall minus
 * the holes — which is what the scene test asserts over the reference plans.
 */
export function wallBands(wall: Band, holes: WallHole[], wallHeightM: number): WallBand[] {
  const mine = holes.filter((h) => holeIsInWall(wall, h.hole));
  const bands: WallBand[] = wallPieces(
    wall,
    mine.map((h) => h.hole),
  ).map((piece) => ({ role: "wall" as const, from: piece.from, to: piece.to, y0: 0, y1: wallHeightM }));

  for (const { id, hole, sillM, headM } of mine) {
    const from = Math.max(hole.from, wall.from);
    const to = Math.min(hole.to, wall.to);
    if (!(to > from)) continue;
    if (sillM > 0) {
      bands.push({ role: "sill", from, to, y0: 0, y1: Math.min(sillM, wallHeightM), openingId: id });
    }
    if (headM < wallHeightM) {
      bands.push({ role: "head", from, to, y0: headM, y1: wallHeightM, openingId: id });
    }
  }
  // A stable order, so two runs of the same flat emit the same scene.
  return bands.sort((a, b) => a.from - b.from || a.y0 - b.y0 || a.role.localeCompare(b.role));
}

/** The rectangle a band covers on the page: x, y, width, height in drawing units. */
export function bandRect(
  wall: Band,
  band: { from: number; to: number },
): { x: number; y: number; w: number; h: number } {
  const half = wall.thickness / 2;
  return wall.orientation === "h"
    ? { x: band.from, y: wall.centre - half, w: band.to - band.from, h: wall.thickness }
    : { x: wall.centre - half, y: band.from, w: wall.thickness, h: band.to - band.from };
}
