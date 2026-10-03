import type { PdfPage } from "@/lib/projects/building/pdf-paths";
import {
  boxes,
  dilate,
  drawLine,
  emptyMask,
  erode,
  fillPolygon,
  label,
  runLengths,
  type Box,
  type Mask,
} from "@/lib/projects/building/raster";

/**
 * The walls of one floor of an architect's plan, as a raster and as boxes.
 *
 * The booklet draws each wall in its outline pen — red for what is built new —
 * and hatches the concrete ones in the structure's colour. Those strokes are
 * rasterised at 2 cm a pixel, closed so the hatch runs solid, and the thin
 * space an outline encloses (a partition's core) filled. What is left is
 * every wall, whatever its thickness or angle, and nothing else the sheet
 * draws in those pens is that dense.
 */
export type PlanWalls = {
  /** The part of the page read, in points. */
  box: { x: number; y: number; width: number; height: number };
  unitsPerMetre: number;
  cm: number;
  mask: Mask;
  /** Each wall run as an axis-aligned band, in metres from the box's corner, x right and y down. */
  bands: Array<{ orientation: "h" | "v"; x: number; y: number; w: number; h: number }>;
};

export type WallPens = {
  /** Colours an outline or a hatch of a wall is drawn in, 0xRRGGBB. */
  colours: number[];
};

export function readPlanWalls(
  page: PdfPage,
  region: { x: number; y: number; width: number; height: number },
  options: { unitsPerMetre: number; pens: WallPens; cm?: number },
): PlanWalls {
  const cm = options.cm ?? 2;
  const k = 100 / options.unitsPerMetre / cm;
  const cols = Math.ceil(region.width * k);
  const rows = Math.ceil(region.height * k);
  const ink = emptyMask(cols, rows);
  const pens = new Set(options.pens.colours);
  const px = ([x, y]: [number, number]): [number, number] => [(x - region.x) * k, (y - region.y) * k];
  for (const path of page.paths) {
    const inPen = (path.stroked && path.stroke != null && pens.has(path.stroke)) || (path.filled && path.fill != null && pens.has(path.fill));
    if (!inPen) continue;
    for (const ring of path.rings) {
      const pts = ring.map(px);
      if (pts.every(([x, y]) => x < 0 || y < 0 || x >= cols || y >= rows)) continue;
      if (path.filled && path.fill != null && pens.has(path.fill)) fillPolygon(ink, pts);
      for (let i = 1; i < pts.length; i++) drawLine(ink, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]);
    }
  }

  // The hatch closed into a solid band: strokes 3 to 8 cm apart.
  const closed = erode(dilate(ink, 2), 2);
  // A partition's core: a narrow space its two outlines enclose. Only spaces
  // under 0.4 m² and no wider than a thick wall are filled — a shaft or a
  // store left open is a room.
  const holes = label(closed, 0);
  const holeBox = new Map<number, Box>();
  for (let i = 0; i < holes.ids.length; i++) {
    const id = holes.ids[i]!;
    if (!id) continue;
    const x = i % cols;
    const y = (i - x) / cols;
    const b = holeBox.get(id) ?? { x0: x, y0: y, x1: x, y1: y };
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
    holeBox.set(id, b);
  }
  const maxCore = Math.round(40 / cm);
  const fill = new Set<number>();
  for (const [id, b] of holeBox) {
    if (holes.touchesEdge[id]) continue;
    const thin = Math.min(b.x1 - b.x0, b.y1 - b.y0) + 1 <= maxCore;
    if (thin && holes.sizes[id]! * cm * cm <= 4000) fill.add(id);
  }
  const solid = emptyMask(cols, rows);
  for (let i = 0; i < solid.data.length; i++) solid.data[i] = closed.data[i] || fill.has(holes.ids[i]!) ? 1 : 0;

  // Scraps: a tick, a stray mark.
  const parts = label(solid, 1);
  const mask = emptyMask(cols, rows);
  const minPx = Math.round(200 / (cm * cm));
  for (let i = 0; i < mask.data.length; i++) mask.data[i] = parts.sizes[parts.ids[i]!]! >= minPx ? 1 : 0;

  return { box: region, unitsPerMetre: options.unitsPerMetre, cm, mask, bands: bandsOf(mask, cm) };
}

/**
 * The wall mask as axis-aligned bands: each pixel goes to the direction its
 * run is longer in, and each connected run of one direction is one band.
 */
export function bandsOf(mask: Mask, cm: number): PlanWalls["bands"] {
  const runX = runLengths(mask, true);
  const runY = runLengths(mask, false);
  const horizontal = emptyMask(mask.cols, mask.rows);
  const vertical = emptyMask(mask.cols, mask.rows);
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    if (runX[i]! >= runY[i]!) horizontal.data[i] = 1;
    else vertical.data[i] = 1;
  }
  const m = cm / 100;
  const out: PlanWalls["bands"] = [];
  for (const [part, orientation] of [
    [horizontal, "h"],
    [vertical, "v"],
  ] as const) {
    for (const b of boxes(part)) {
      out.push({ orientation, x: b.x0 * m, y: b.y0 * m, w: (b.x1 - b.x0 + 1) * m, h: (b.y1 - b.y0 + 1) * m });
    }
  }
  return out;
}
