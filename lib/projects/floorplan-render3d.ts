import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import {
  bodyRect,
  openingRect,
  type Opening,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";

/**
 * Draws the flat from its geometry, instead of asking a model to imagine it.
 *
 * The projection is oblique, not perspective: a point at height z is drawn at
 * (x, y - z * RISE). That keeps plan coordinates as screen coordinates, so a
 * wall lands exactly where the CAD puts it and the footprint is correct by
 * construction — the property that no amount of prompting bought. It also means
 * the drawing cannot invent a room, an opening or a wing, because it only ever
 * draws bodies that came out of the file.
 */

/**
 * How far height leans down the page, as a fraction of the height itself.
 *
 * 0.55 was the first guess and made a 2.6 m wall lean a ninth of the flat's
 * width, so the render read as a forest of towers rather than a floor seen from
 * above. A sales still is close to top-down: enough lean to see the inside face
 * of a wall and read the room as a room, not enough to hide the floor behind it.
 */
const RISE = 0.30;

export type Render3dOptions = {
  /** Page units per metre, so wall height is a real 2.6 m rather than a guess. */
  unitsPerMetre: number;
  wallHeightM?: number;
  width?: number;
  padding?: number;
  /** The enclosed interior as row spans, painted as the floor slab. */
  floor?: SpanRow[];
  /** Pieces read out of the CAD, extruded at the height their kind stands. */
  furniture?: FurniturePiece[];
  /** The doorways, drawn so the model has no reason to cut its own. */
  openings?: Opening[];
};

type Box = { x: number; y: number; width: number; height: number };

const FLOOR = "#c3b49d";
/**
 * Grey, not white. Wall tops were pure white and a bed's linen is off-white, so
 * the two were within a shade of each other and the model could not tell a bed
 * from a wall: given four bed blocks it drew three, and two bedrooms where the
 * plan has four. Furniture has to read as furniture at a glance.
 */
const WALL_TOP = "#d7d2ca";
const WALL_FACE = "#8d8377";
const WALL_EDGE = "#6f665c";
/** A doorway threshold: reads as floor, not as wall, and not as furniture. */
const THRESHOLD = "#b9ad9b";
/** The head end of a bed, so its width cannot be mistaken. */
const PILLOW = "#ffffff";
/**
 * Furniture blocks are colour-coded, and the prompt names the code.
 *
 * Rendered in one neutral tone the model read five bed blocks and produced two
 * beds, and turned a block standing on the service terrace into a bathroom. The
 * blocks carry their kind in the geometry; there is no reason to make the model
 * infer it from proportions.
 */
export const PIECE_COLOURS: Record<string, { top: string; face: string }> = {
  // Distinct enough to tell apart, and already the material each will become.
  // Saturated key colours worked for placement and then would not come out: a
  // second pass asked to restate them in real materials left green chairs and
  // orange tables standing in the finished frame. A palette that is its own
  // answer needs no decoding.
  bed: { top: "#fdfdfc", face: "#e6e2da" },
  storage: { top: "#c9a678", face: "#a8875b" },
  counter: { top: "#eae6df", face: "#b9b2a6" },
  fixture: { top: "#fbfbfa", face: "#dfe3e4" },
  table: { top: "#a9764a", face: "#8b5e39" },
  seat: { top: "#cfc6b6", face: "#aca392" },
  unknown: { top: "#cbb79c", face: "#a8917a" },
};
function quad(points: Array<[number, number]>, fill: string, stroke: string): string {
  const d = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `<polygon points="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.6" stroke-linejoin="round"/>`;
}

/**
 * The flat as an SVG, walls extruded from the plan.
 *
 * Bodies are painted back to front — a wall nearer the bottom of the page is
 * nearer the viewer and must cover the one behind it. Without that the far side
 * of a room draws over the near side and the walls read inside out.
 */
export function renderFlatSvg(
  bodies: WallBody[],
  bounds: Box,
  options: Render3dOptions,
): string {
  const heightM = options.wallHeightM ?? 2.6;
  const rise = heightM * options.unitsPerMetre * RISE;
  const pad = options.padding ?? 30;

  // The lean pushes wall tops upward, so the frame needs room above the plan.
  const minX = bounds.x - pad;
  const minY = bounds.y - rise - pad;
  const w = bounds.width + pad * 2;
  const h = bounds.height + rise + pad * 2;

  const parts: string[] = [
    `<rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#ffffff"/>`,
  ];

  // Floor, as the rows the interior actually occupies. The bounding box would
  // paint floor outside the flat wherever the outline steps in, and a stepped
  // outline is the whole point of this exercise.
  if (options.floor?.length) {
    const rowHeight = options.floor.length > 1 ? options.floor[1]!.y - options.floor[0]!.y : 2;
    const runs = options.floor
      .flatMap((row) =>
        row.spans.map(
          ([a, b]) =>
            `<rect x="${a.toFixed(1)}" y="${row.y.toFixed(1)}" width="${(b - a).toFixed(1)}" height="${(rowHeight + 0.4).toFixed(1)}"/>`,
        ),
      )
      .join("");
    parts.push(`<g fill="${FLOOR}" shape-rendering="crispEdges">${runs}</g>`);
  } else {
    parts.push(
      `<rect x="${bounds.x.toFixed(1)}" y="${bounds.y.toFixed(1)}" width="${bounds.width.toFixed(1)}" height="${bounds.height.toFixed(1)}" fill="${FLOOR}"/>`,
    );
  }

  const painted = bodies
    .map((b) => ({ body: b, rect: bodyRect(b) }))
    .sort((a, c) => a.rect.y + a.rect.h - (c.rect.y + c.rect.h));

  for (const { rect } of painted) {
    const { x, y, w: bw, h: bh } = rect;
    const near = y + bh;
    // Front face: the side of the wall that faces the viewer, from floor to top.
    parts.push(
      quad(
        [
          [x, near],
          [x + bw, near],
          [x + bw, near - rise],
          [x, near - rise],
        ],
        WALL_FACE,
        WALL_EDGE,
      ),
    );
    // Top face: the wall's footprint, lifted by the full wall height.
    parts.push(
      quad(
        [
          [x, y - rise],
          [x + bw, y - rise],
          [x + bw, near - rise],
          [x, near - rise],
        ],
        WALL_TOP,
        WALL_EDGE,
      ),
    );
  }

  // Furniture, after the walls so a piece standing against a wall reads in front
  // of it, and painted back to front among themselves for the same reason.
  const heights: Record<string, number> = {
    bed: 0.5,
    storage: 2.0,
    counter: 0.9,
    fixture: 0.55,
    table: 0.75,
    seat: 0.85,
    unknown: 0.5,
  };
  for (const piece of [...(options.furniture ?? [])].sort(
    (a, b) => a.y + a.h - (b.y + b.h),
  )) {
    const lift = (heights[piece.kind] ?? 0.5) * options.unitsPerMetre * RISE;
    const colour = PIECE_COLOURS[piece.kind] ?? PIECE_COLOURS.unknown!;
    const near = piece.y + piece.h;
    parts.push(
      quad(
        [
          [piece.x, near],
          [piece.x + piece.w, near],
          [piece.x + piece.w, near - lift],
          [piece.x, near - lift],
        ],
        colour.face,
        WALL_EDGE,
      ),
    );
    parts.push(
      quad(
        [
          [piece.x, piece.y - lift],
          [piece.x + piece.w, piece.y - lift],
          [piece.x + piece.w, near - lift],
          [piece.x, near - lift],
        ],
        colour.top,
        WALL_EDGE,
      ),
    );

    // A pillow at the head of a bed. The block alone is a rectangle, and the
    // model widened it into a double — which for this client is a hard failure.
    // A pillow says which end is the head and, by its width, how wide the bed is.
    if (piece.kind === "bed") {
      const alongY = piece.h > piece.w;
      const band = (alongY ? piece.h : piece.w) * 0.16;
      const pillow = alongY
        ? { x: piece.x, y: piece.y, w: piece.w, h: band }
        : { x: piece.x, y: piece.y, w: band, h: piece.h };
      parts.push(
        quad(
          [
            [pillow.x, pillow.y - lift],
            [pillow.x + pillow.w, pillow.y - lift],
            [pillow.x + pillow.w, pillow.y + pillow.h - lift],
            [pillow.x, pillow.y + pillow.h - lift],
          ],
          PILLOW,
          WALL_EDGE,
        ),
      );
    }
  }

  // Doorways, drawn as a threshold on the floor between the two pieces of wall.
  // A shell whose walls simply stop says nothing about which breaks are doors,
  // and the model cut two openings דירה 14 does not have.
  for (const opening of options.openings ?? []) {
    const r = openingRect(opening);
    parts.push(
      `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" ` +
        `fill="${THRESHOLD}" stroke="${WALL_EDGE}" stroke-width="0.5"/>`,
    );
  }

  const width = options.width ?? 1400;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" ` +
    `width="${width}" height="${Math.round((width * h) / w)}">${parts.join("")}</svg>`
  );
}
