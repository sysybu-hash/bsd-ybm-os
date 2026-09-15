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
const RISE = 0.40;

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
  /**
   * Paved outdoor areas, grown from the areas the sheet prints inside them.
   * Painted in stone and railed, so a terrace is not left reading as a room
   * with a missing wall — or, where it falls outside the wall bodies, as a slab
   * floating beside the flat.
   */
  terraces?: SpanRow[][];
};

type Box = { x: number; y: number; width: number; height: number };

const PAPER = "#f4efe6";
const RAILING = "#9a958c";
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
  // Pale aqua, not white. At #fbfbfa a fixture was two parts in 255 away from
  // the bed's #fdfdfc, and the key had to separate them on wording alone — an
  // off-white block that is long is a bed, a white block that is long is a
  // bath. The model read the beds in דירה 14's bedroom wing as a bathtub and
  // set a toilet and a basin beside them out of the bedside tables, which is
  // the "bathrooms where the bedrooms are" this plan keeps coming back with.
  // Glazed ceramic carries a cool cast in daylight, so this still needs no
  // decoding into a material; it is simply far enough from warm bed linen to
  // be a different thing.
  //
  // Paled to #e8f4f6 for a while, when the tint was surviving into the finish
  // and the bath and basins came out mint. That put a fixture 21 parts from the
  // bed's #fdfdfc and the beds started coming back as baths again — the very
  // failure the aqua exists to prevent. The bleed had a different cause: the
  // recolour pass was carrying a stale legend and undoing nothing. With that
  // fixed the residue is 0.03% of the frame, so the separation can be spent on
  // the job it is for. 37 parts now.
  fixture: { top: "#d6ecf1", face: "#a9ccd4" },
  table: { top: "#a9764a", face: "#8b5e39" },
  // Dark steel, so a cooktop and its basins read as the kitchen rather than as
  // plumbing — the hob is four burners in a 64 cm square and was being taken
  // for a toilet.
  hob: { top: "#5a5f66", face: "#43474d" },
  sink: { top: "#8e959c", face: "#6e747a" },
  // Light enough to sit clearly on the floor it stands on. At #cfc6b6 a seat was
  // 25 parts from the floor's own #c3b49d, and a low block in a near-floor tone
  // reads as floor.
  seat: { top: "#e6dccb", face: "#c6b9a4" },
  unknown: { top: "#cbb79c", face: "#a8917a" },
};
function quad(
  points: Array<[number, number]>,
  fill: string,
  stroke: string,
  extra = "",
): string {
  const d = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `<polygon points="${d}" fill="${fill}" stroke="${stroke}" stroke-width="0.6" stroke-linejoin="round"${extra}/>`;
}

function brochureDefs(upm: number): string {
  const plank = Math.max(1.6, upm * 0.1);
  const tile = Math.max(2.4, upm * 0.18);
  return (
    `<defs>` +
    `<pattern id="fp-oak" patternUnits="userSpaceOnUse" width="${plank.toFixed(1)}" height="${(plank * 6).toFixed(1)}">` +
    `<rect width="100%" height="100%" fill="#c4a574"/>` +
    `<rect x="0" y="0" width="${(plank * 0.45).toFixed(1)}" height="100%" fill="#b89564" opacity="0.45"/>` +
    `<rect x="0" y="0" width="100%" height="0.35" fill="#a88854" opacity="0.35"/>` +
    `</pattern>` +
    `<pattern id="fp-stone" patternUnits="userSpaceOnUse" width="${tile.toFixed(1)}" height="${tile.toFixed(1)}">` +
    `<rect width="100%" height="100%" fill="#d8d2c6"/>` +
    `<path d="M0 0H${tile.toFixed(1)}M0 0V${tile.toFixed(1)}" stroke="#c4beb2" stroke-width="0.35" fill="none"/>` +
    `</pattern>` +
    `<filter id="fp-shadow" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="0.3" dy="0.7" stdDeviation="0.55" flood-color="#2c2418" flood-opacity="0.22"/>` +
    `</filter>` +
    `<linearGradient id="fp-gold" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#f6c98a" stop-opacity="0.18"/>` +
    `<stop offset="1" stop-color="#c47a3a" stop-opacity="0.08"/>` +
    `</linearGradient>` +
    `</defs>`
  );
}

function pieceGlyph(piece: FurniturePiece, lift: number, colour: { top: string; face: string }): string {
  const { x, y, w, h, kind } = piece;
  const near = y + h;
  const inset = Math.min(w, h) * 0.12;
  const bits: string[] = [];
  if (kind === "hob") {
    const r = Math.min(w, h) * 0.14;
    const cells: Array<[number, number]> = [
      [x + w * 0.3, y + h * 0.3],
      [x + w * 0.7, y + h * 0.3],
      [x + w * 0.3, y + h * 0.7],
      [x + w * 0.7, y + h * 0.7],
    ];
    for (const [cx, cy] of cells) {
      bits.push(
        `<circle cx="${cx.toFixed(1)}" cy="${(cy - lift).toFixed(1)}" r="${r.toFixed(1)}" fill="#3a3d42" stroke="#2a2c30" stroke-width="0.4"/>`,
      );
    }
  } else if (kind === "sink") {
    bits.push(
      `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2 - lift).toFixed(1)}" rx="${(w * 0.32).toFixed(1)}" ry="${(h * 0.28).toFixed(1)}" fill="#c5ccd2" stroke="#6e747a" stroke-width="0.5"/>`,
    );
  } else if (kind === "fixture") {
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    if (long > short * 1.6) {
      bits.push(
        `<rect x="${(x + inset).toFixed(1)}" y="${(y + inset - lift).toFixed(1)}" width="${(w - inset * 2).toFixed(1)}" height="${(h - inset * 2).toFixed(1)}" rx="${(short * 0.18).toFixed(1)}" fill="#f4f8f9" stroke="#a9ccd4" stroke-width="0.5"/>`,
      );
    } else {
      bits.push(
        `<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2 - lift).toFixed(1)}" rx="${(w * 0.34).toFixed(1)}" ry="${(h * 0.3).toFixed(1)}" fill="#f4f8f9" stroke="#a9ccd4" stroke-width="0.5"/>`,
      );
    }
  } else if (kind === "storage") {
    const split = w >= h;
    if (split) {
      bits.push(
        `<line x1="${(x + w / 2).toFixed(1)}" y1="${(y - lift).toFixed(1)}" x2="${(x + w / 2).toFixed(1)}" y2="${(near - lift).toFixed(1)}" stroke="${colour.face}" stroke-width="0.7"/>`,
      );
    } else {
      bits.push(
        `<line x1="${x.toFixed(1)}" y1="${(y + h / 2 - lift).toFixed(1)}" x2="${(x + w).toFixed(1)}" y2="${(y + h / 2 - lift).toFixed(1)}" stroke="${colour.face}" stroke-width="0.7"/>`,
      );
    }
  } else if (kind === "seat") {
    bits.push(
      `<rect x="${(x + inset).toFixed(1)}" y="${(y + inset - lift).toFixed(1)}" width="${(w - inset * 2).toFixed(1)}" height="${(h - inset * 2).toFixed(1)}" rx="${(Math.min(w, h) * 0.18).toFixed(1)}" fill="${colour.top}" stroke="${colour.face}" stroke-width="0.4"/>`,
    );
  } else if (kind === "table") {
    bits.push(
      `<rect x="${(x + inset * 0.6).toFixed(1)}" y="${(y + inset * 0.6 - lift).toFixed(1)}" width="${(w - inset * 1.2).toFixed(1)}" height="${(h - inset * 1.2).toFixed(1)}" fill="url(#fp-oak)" stroke="${colour.face}" stroke-width="0.5"/>`,
    );
  }
  return bits.join("");
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
    brochureDefs(options.unitsPerMetre),
    `<rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${PAPER}"/>`,
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
    parts.push(`<g fill="url(#fp-oak)" shape-rendering="crispEdges">${runs}</g>`);
  } else {
    parts.push(
      `<rect x="${bounds.x.toFixed(1)}" y="${bounds.y.toFixed(1)}" width="${bounds.width.toFixed(1)}" height="${bounds.height.toFixed(1)}" fill="url(#fp-oak)"/>`,
    );
  }

  // Terraces over the floor slab, then a railing around each. The rail is drawn
  // as a low upstand rather than a wall so the model does not read it as one and
  // roof the terrace over.
  for (const rows of options.terraces ?? []) {
    if (!rows.length) continue;
    const rowHeight = rows.length > 1 ? rows[1]!.y - rows[0]!.y : 2;
    const paving = rows
      .flatMap((row) =>
        row.spans.map(
          ([a, b]) =>
            `<rect x="${a.toFixed(1)}" y="${row.y.toFixed(1)}" width="${(b - a).toFixed(1)}" height="${(rowHeight + 0.4).toFixed(1)}"/>`,
        ),
      )
      .join("");
    parts.push(`<g fill="url(#fp-stone)" shape-rendering="crispEdges">${paving}</g>`);

    let tx0 = Infinity;
    let tx1 = -Infinity;
    let ty0 = Infinity;
    let ty1 = -Infinity;
    for (const row of rows) {
      ty0 = Math.min(ty0, row.y);
      ty1 = Math.max(ty1, row.y + rowHeight);
      for (const [a, b] of row.spans) {
        tx0 = Math.min(tx0, a);
        tx1 = Math.max(tx1, b);
      }
    }
    const rail = Math.max(1.5, options.unitsPerMetre * 0.04);
    parts.push(
      `<rect x="${tx0.toFixed(1)}" y="${ty0.toFixed(1)}" width="${(tx1 - tx0).toFixed(1)}" height="${(ty1 - ty0).toFixed(1)}" fill="none" stroke="${RAILING}" stroke-width="${rail.toFixed(1)}"/>`,
    );
  }

  const wetPad = options.unitsPerMetre * 0.16;
  for (const piece of options.furniture ?? []) {
    if (piece.kind !== "fixture" && piece.kind !== "sink") continue;
    parts.push(
      `<rect x="${(piece.x - wetPad).toFixed(1)}" y="${(piece.y - wetPad).toFixed(1)}" ` +
        `width="${(piece.w + wetPad * 2).toFixed(1)}" height="${(piece.h + wetPad * 2).toFixed(1)}" ` +
        `fill="url(#fp-stone)"/>`,
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
    hob: 0.92,
    sink: 0.9,
    table: 0.75,
    // A seat, not a seat back. At 0.85 a chair stood as tall as a worktop at
    // 0.9, and the model read the blocks as what they matched: the island's
    // four stools came out as a length of counter and the living-room suite as
    // a wall. Half a metre is what you sit on, and nothing else in the flat is
    // that low.
    seat: 0.45,
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
        ` filter="url(#fp-shadow)"`,
      ),
    );
    parts.push(pieceGlyph(piece, lift, colour));

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

  parts.push(
    `<rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#fp-gold)" pointer-events="none"/>`,
  );

  const width = options.width ?? 1400;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" ` +
    `width="${width}" height="${Math.round((width * h) / w)}">${parts.join("")}</svg>`
  );
}
