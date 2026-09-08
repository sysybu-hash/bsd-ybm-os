import sharp from "sharp";

import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-vector");

/**
 * Wall geometry read out of the PDF instead of guessed from the picture.
 *
 * Nine of ten sales sheets in a real batch are CAD exports carrying ~10,000
 * vector paths, so the walls are already in the file as exact coordinates. A
 * vision model asked where a wall sits answers differently every run — the same
 * sheet read six times gave four to six bedrooms — while the file gives the same
 * answer every time. Geometry comes from here; naming a room still belongs to
 * the extractor, which is what it is good at.
 *
 * The tenth sheet is a scan with a single image operator and no paths. There is
 * nothing to read there, and `extractFloorplanVectorGeometry` says so rather
 * than inventing something.
 */

export type VectorSegment = {
  /** Viewport coordinates: origin top-left, y down, matching the rendered page. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Stroke width in effect when the path was drawn — the layer signal. */
  lineWidth: number;
};

export type FloorplanVectorGeometry = {
  pageWidth: number;
  pageHeight: number;
  /** Every drawn segment, already through the transform stack. */
  segments: VectorSegment[];
  /** Long axis-aligned runs — the wall candidates. */
  walls: VectorSegment[];
  /**
   * Curves, as the straight chord from each one's start to its end.
   *
   * Curves were skipped outright — a curve only had to leave the pen in the
   * right place, since walls are straight. But sanitary ware is not: this sheet
   * draws one bath as a closed rectangle and every other pan, basin and tub as
   * curves, so the furniture pass could see a single fixture in a flat with two
   * bathrooms, and the model was left to guess where the wet rooms are. It
   * guessed bedrooms and terraces.
   *
   * Kept apart from `segments` so they cannot reach the wall detector, which has
   * no use for them and would have to filter them out again.
   */
  curves: VectorSegment[];
};

type Matrix = [number, number, number, number, number, number];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function segmentLength(s: VectorSegment): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

/** Within half a unit of horizontal or vertical. CAD walls are drawn on axis. */
export function isAxisAligned(s: VectorSegment, tolerance = 0.7): boolean {
  return Math.abs(s.x2 - s.x1) < tolerance || Math.abs(s.y2 - s.y1) < tolerance;
}

/**
 * Structural walls carry a heavier pen than the furniture drawn inside them.
 *
 * On דירה 16 the sheet uses width 2 for 6,056 paths — beds, wardrobes, counters,
 * dimension lines — and widths 4 to 17 for the walls. Filtering on length alone
 * let the furniture through, and the flood fill then treated a bed as a room
 * divider and carved the bedroom into pieces around it.
 */
export const WALL_MIN_LINE_WIDTH = 3;

/**
 * A wall is drawn as two parallel faces a wall's thickness apart.
 *
 * The heavy-pen test alone finds the partitions but loses the exterior, which
 * this CAD draws as hatched bodies outlined with the same thin pen as the
 * furniture. Thickness separates them instead: an Israeli wall is 10-35 cm, so
 * at the 33-44 units per metre these sheets use its faces sit 3-16 units apart,
 * while a bed's long sides are 30-90 units apart and a counter's 20-30.
 */
export function hasParallelFace(
  s: VectorSegment,
  others: VectorSegment[],
  gap: { min: number; max: number } = { min: 2.5, max: 18 },
): boolean {
  const horizontal = Math.abs(s.y2 - s.y1) < Math.abs(s.x2 - s.x1);
  const at = horizontal ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
  const a = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
  const b = horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
  const span = b - a;
  if (span <= 0) return false;

  for (const other of others) {
    if (other === s) continue;
    const otherHorizontal = Math.abs(other.y2 - other.y1) < Math.abs(other.x2 - other.x1);
    if (otherHorizontal !== horizontal) continue;
    const otherAt = otherHorizontal ? (other.y1 + other.y2) / 2 : (other.x1 + other.x2) / 2;
    const distance = Math.abs(otherAt - at);
    if (distance < gap.min || distance > gap.max) continue;
    // The faces have to run alongside each other, not merely share a line.
    const oa = otherHorizontal ? Math.min(other.x1, other.x2) : Math.min(other.y1, other.y2);
    const ob = otherHorizontal ? Math.max(other.x1, other.x2) : Math.max(other.y1, other.y2);
    const shared = Math.min(b, ob) - Math.max(a, oa);
    if (shared > span * 0.5) return true;
  }
  return false;
}

export function isWallCandidate(
  s: VectorSegment,
  page: { width: number; height: number },
  minLength = 12,
): boolean {
  if (!isAxisAligned(s)) return false;
  if (segmentLength(s) < minLength) return false;
  // Dimension lines and leaders run outside the drawing; the flat does not.
  const pad = 5;
  const inX = (v: number) => v > -pad && v < page.width + pad;
  const inY = (v: number) => v > -pad && v < page.height + pad;
  return inX(s.x1) && inX(s.x2) && inY(s.y1) && inY(s.y2);
}

/**
 * Reads page 1's operator list, tracking the transform stack so coordinates come
 * out in viewport space. Returns null when the page carries no vector geometry —
 * a scanned sheet, where the caller has to fall back to the generative pipeline.
 */
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

async function loadPdfjs(): Promise<Pdfjs | null> {
  try {
    return await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (err: unknown) {
    log.warn("pdfjs unavailable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** A plain view, because pdfjs rejects a Node Buffer by name. */
function asPdfBytes(pdf: Buffer | Uint8Array): Uint8Array {
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
}

export async function extractFloorplanVectorGeometry(
  pdf: Buffer | Uint8Array,
  options?: { minWallLength?: number },
): Promise<FloorplanVectorGeometry | null> {
  const pdfjs = await loadPdfjs();
  if (!pdfjs) return null;

  try {
    const doc = await pdfjs.getDocument({
      data: asPdfBytes(pdf),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
    const page = await doc.getPage(1);
    // scale 1 with the page's own rotation applied, so a /Rotate 270 sheet — nine
    // of the ten in that batch — comes back the way it is meant to be read.
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const OPS = pdfjs.OPS;

    const segments: VectorSegment[] = [];
    const curves: VectorSegment[] = [];
    let ctm = viewport.transform.slice() as Matrix;
    let lineWidth = 1;
    const stack: Array<{ ctm: Matrix; lineWidth: number }> = [];

    const push = (ax: number, ay: number, bx: number, by: number) => {
      const [x1, y1] = apply(ctm, ax, ay);
      const [x2, y2] = apply(ctm, bx, by);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return;
      if (x1 === x2 && y1 === y2) return;
      segments.push({ x1, y1, x2, y2, lineWidth });
    };

    const pushCurve = (ax: number, ay: number, bx: number, by: number) => {
      const [x1, y1] = apply(ctm, ax, ay);
      const [x2, y2] = apply(ctm, bx, by);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return;
      if (x1 === x2 && y1 === y2) return;
      curves.push({ x1, y1, x2, y2, lineWidth });
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === OPS.save) {
        stack.push({ ctm: ctm.slice() as Matrix, lineWidth });
        continue;
      }
      if (fn === OPS.restore) {
        const prev = stack.pop();
        ctm = prev?.ctm ?? (viewport.transform.slice() as Matrix);
        lineWidth = prev?.lineWidth ?? 1;
        continue;
      }
      if (fn === OPS.transform) {
        ctm = multiply(ctm, ops.argsArray[i] as Matrix);
        continue;
      }
      if (fn === OPS.setLineWidth) {
        const w = Number((ops.argsArray[i] as number[])[0]);
        if (Number.isFinite(w)) lineWidth = w;
        continue;
      }
      if (fn !== OPS.constructPath) continue;

      const args = ops.argsArray[i] as [number[], number[]];
      const [cmds, coords] = args;
      let k = 0;
      let cx = 0;
      let cy = 0;
      for (const cmd of cmds) {
        if (cmd === OPS.moveTo) {
          cx = coords[k] ?? 0;
          cy = coords[k + 1] ?? 0;
          k += 2;
        } else if (cmd === OPS.lineTo) {
          const nx = coords[k] ?? 0;
          const ny = coords[k + 1] ?? 0;
          k += 2;
          push(cx, cy, nx, ny);
          cx = nx;
          cy = ny;
        } else if (cmd === OPS.curveTo) {
          k += 6;
          const nx = coords[k - 2] ?? cx;
          const ny = coords[k - 1] ?? cy;
          pushCurve(cx, cy, nx, ny);
          cx = nx;
          cy = ny;
        } else if (cmd === OPS.rectangle) {
          const x = coords[k] ?? 0;
          const y = coords[k + 1] ?? 0;
          const w = coords[k + 2] ?? 0;
          const h = coords[k + 3] ?? 0;
          k += 4;
          push(x, y, x + w, y);
          push(x + w, y, x + w, y + h);
          push(x + w, y + h, x, y + h);
          push(x, y + h, x, y);
          cx = x;
          cy = y;
        }
      }
    }

    if (segments.length === 0) {
      log.info("sheet carries no vector geometry", { ops: ops.fnArray.length });
      return null;
    }

    const page2 = { width: viewport.width, height: viewport.height };
    // Two ways to be a wall, because this CAD draws them two ways: partitions
    // get a heavy pen, exterior bodies get a thin outline round a hatch fill.
    // Requiring both tests at once loses the exterior and rooms merge; requiring
    // neither lets every bed through and rooms fragment around the furniture.
    const geometric = segments.filter((s) => isWallCandidate(s, page2, options?.minWallLength ?? 12));
    const heavy = geometric.filter((s) => s.lineWidth >= WALL_MIN_LINE_WIDTH);
    const faced = geometric.filter((s) => hasParallelFace(s, geometric));
    // Take BOTH, not whichever looks healthier. This used to read
    // `heavy.length >= 40 ? heavy : faced`, and on דירה 14 heavy won with 172
    // segments — every one of them an internal partition, because this sheet
    // draws its exterior as a thin-outlined hatch body that the heavy pen never
    // sees. The model was handed a plan with no envelope at all and did the only
    // thing it could: invent one. That is the whole family of complaints on this
    // batch — wrong footprint, whole invented spaces down one side. The union is
    // 860 segments and closes the outline.
    const union = new Set<VectorSegment>([...heavy, ...faced]);
    const walls = largestWallCluster([...union]);
    return { pageWidth: viewport.width, pageHeight: viewport.height, segments, curves, walls };
  } catch (err: unknown) {
    log.warn("vector extraction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * The connected run of walls that is the apartment, dropping everything else.
 *
 * Taking heavy ∪ parallel-face closes the envelope but also lets the title block
 * in: a revision table is fifteen horizontal rules a few units apart, which is
 * exactly what `hasParallelFace` is looking for. Those rules sit off on their own
 * at the right of the sheet, so proximity separates them — the flat is one dense
 * connected component and the tables are their own small ones. Keeping the
 * cluster that encloses the most area took דירה 14 from 860 segments spanning
 * the full sheet width to 358 spanning the flat.
 */
export function largestWallCluster(walls: VectorSegment[], cell = 24): VectorSegment[] {
  if (walls.length === 0) return walls;

  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let node = a;
    while (parent.get(node) !== node) {
      const grand = parent.get(parent.get(node)!)!;
      parent.set(node, grand);
      node = grand;
    }
    return node;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Walk each segment, not just its endpoints: a 900-unit exterior run passes
  // through cells that touch nothing at either end.
  const cellsFor = (s: VectorSegment): string[] => {
    const steps = Math.max(2, Math.ceil(segmentLength(s) / cell) * 2);
    const out = new Set<string>();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.floor((s.x1 + (s.x2 - s.x1) * t) / cell);
      const cy = Math.floor((s.y1 + (s.y2 - s.y1) * t) / cell);
      out.add(`${cx},${cy}`);
    }
    return [...out];
  };

  const perSegment = walls.map(cellsFor);
  for (const cells of perSegment) {
    for (const c of cells) if (!parent.has(c)) parent.set(c, c);
  }
  for (const cells of perSegment) {
    for (let i = 1; i < cells.length; i++) union(cells[0]!, cells[i]!);
  }
  // Diagonal neighbours too, so a wall corner meeting at a cell diagonal joins.
  for (const k of [...parent.keys()]) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ] as const) {
      const n = `${x + dx},${y + dy}`;
      if (parent.has(n)) union(k, n);
    }
  }

  // Rank by the area the cluster encloses, not by how much line is in it. A
  // revision table is a lot of line in a thin band — twelve 250-unit rules beat
  // a four-wall flat on total length — but it encloses almost no area, while the
  // drawing is extended in both directions by definition.
  type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
  const boundsByRoot = new Map<string, Bounds>();
  const rootOf = walls.map((s, i) => {
    const root = find(perSegment[i]![0]!);
    const b = boundsByRoot.get(root) ?? {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    b.minX = Math.min(b.minX, s.x1, s.x2);
    b.maxX = Math.max(b.maxX, s.x1, s.x2);
    b.minY = Math.min(b.minY, s.y1, s.y2);
    b.maxY = Math.max(b.maxY, s.y1, s.y2);
    boundsByRoot.set(root, b);
    return root;
  });
  const area = (b: Bounds) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  let best: string | null = null;
  for (const [root, b] of boundsByRoot) {
    if (best === null || area(b) > area(boundsByRoot.get(best)!)) best = root;
  }
  return walls.filter((_, i) => rootOf[i] === best);
}

/**
 * The rectangle the walls actually occupy, which is not the page.
 *
 * A sheet is a page with a drawing on it, a title block, dimension chains and
 * a lot of white. דירה 15 is a portrait page carrying an apartment laid out
 * horizontally — asking the image model for a portrait frame there made it turn
 * the whole floor plate on its side to fill the canvas, and the audit came back
 * "completely rearranged". The frame should follow the flat, not the paper.
 */
export function wallBoundingBox(
  geometry: FloorplanVectorGeometry,
): { x: number; y: number; width: number; height: number } | null {
  if (geometry.walls.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of geometry.walls) {
    minX = Math.min(minX, w.x1, w.x2);
    maxX = Math.max(maxX, w.x1, w.x2);
    minY = Math.min(minY, w.y1, w.y2);
    maxY = Math.max(maxY, w.y1, w.y2);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;
  return { x: minX, y: minY, width, height };
}

/**
 * A clean walls-only diagram for the image model to trace.
 *
 * The model has been reading the raw sales sheet, where the wall graph competes
 * with dimension chains, hatch, furniture, a title block and Hebrew labels — and
 * it showed: footprints came back as plain rectangles, and one run grew a whole
 * extra wing. The vector pass already knows exactly where the walls are, so this
 * hands over that and nothing else, to be attached alongside the original sheet.
 *
 * This is the part of the vector work that pays off even though room detection
 * did not: guiding the model needs clean walls, not closed rooms.
 */
export function renderWallDiagramSvg(geometry: FloorplanVectorGeometry, pad = 18): string {
  const { walls } = geometry;
  // Crop to the flat. Drawing on the full page put the apartment in a third of a
  // mostly-empty portrait canvas, so the model was reading the walls at a third
  // of the resolution it could have had — and the frame it was being shown did
  // not match the aspect ratio it was being asked for.
  const box = wallBoundingBox(geometry) ?? {
    x: 0,
    y: 0,
    width: geometry.pageWidth,
    height: geometry.pageHeight,
  };
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.width + pad * 2;
  const h = box.height + pad * 2;
  const lines = walls
    .map(
      (s) =>
        `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}"/>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" ` +
    `width="${w.toFixed(0)}" height="${h.toFixed(0)}">` +
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#ffffff"/>` +
    `<g stroke="#000000" stroke-width="2.5" stroke-linecap="square">${lines}</g></svg>`
  );
}

/**
 * The wall diagram as a JPEG, ready to attach next to the original sheet.
 *
 * Falls back to null when the sheet is a scan, or when so few walls came back
 * that a nearly blank page would mislead the model more than the noisy raster
 * hint it replaces.
 */
export async function buildVectorWallJpeg(
  pdf: Buffer | Uint8Array,
  width = 1400,
): Promise<string | null> {
  try {
    const geometry = await extractFloorplanVectorGeometry(pdf);
    if (!geometry || geometry.walls.length < 25) return null;
    const svg = renderWallDiagramSvg(geometry);
    const out = await sharp(Buffer.from(svg), { density: 200 })
      .resize({ width, withoutEnlargement: false })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch (err: unknown) {
    log.warn("wall diagram failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * The dimension numbers the sheet prints, read as text rather than guessed.
 *
 * Scale was being derived from the flood fill's room boxes against the sheet's
 * gross area, and bounding boxes overstate an L-shaped room and understate what
 * they miss entirely, so דירה 14 calibrated at 43.67 units/m and its floor came
 * out 207 m² where the flat plus its terraces is about 132. A CAD export carries
 * its dimension chain as real text — 254, 272, 364, 406 — so there is nothing to
 * infer: calibrateScale matches each number against a wall run of that length.
 *
 * Only plain integers in the range a room dimension occupies are returned;
 * levels (+9.64), areas (111.29) and the title block's text are left out.
 */
export async function extractPdfDimensionStrings(
  pdf: Buffer | Uint8Array,
): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  if (!pdfjs) return [];
  try {
    const doc = await pdfjs.getDocument({
      data: asPdfBytes(pdf),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const out: string[] = [];
    for (const item of content.items) {
      const str = (item as { str?: string }).str;
      if (!str) continue;
      for (const token of str.split(/[^\d.]+/)) {
        if (!/^\d{2,4}$/.test(token)) continue;
        const n = Number(token);
        // 60 cm to 15 m: the span a printed room dimension covers.
        if (n >= 60 && n <= 1500) out.push(token);
      }
    }
    return out;
  } catch (err: unknown) {
    log.warn("dimension text unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * The scan embedded in a PDF that is a photograph of a drawing, not a CAD export.
 *
 * A real batch is not all vectors. דירה 14 is one paintImageXObject and zero
 * paths, and every raster tool downstream — the footprint silhouette, the ink
 * trace, every sharp call — needs pixels, which sharp cannot get out of a PDF.
 * Without this the sheet reaches the image model with no wall hint at all, and
 * a still came back with an entire invented wing of rooms down its right side.
 *
 * Returns null for a genuine vector sheet, where `extractFloorplanVectorGeometry`
 * is the better source, and for a page whose largest image is too small to be
 * the drawing.
 */
export async function extractPdfPageRaster(
  pdf: Buffer | Uint8Array,
): Promise<string | null> {
  const pdfjs = await loadPdfjs();
  if (!pdfjs) return null;

  try {
    const doc = await pdfjs.getDocument({
      data: asPdfBytes(pdf),
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
    const page = await doc.getPage(1);
    // Resolving an image object requires the operator list to have run first —
    // that is what puts it in page.objs.
    const ops = await page.getOperatorList();

    let best: { width: number; height: number; kind: number; data: Uint8Array } | null = null;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const args = ops.argsArray[i] as [string, number, number] | undefined;
      const id = args?.[0];
      if (!id || !page.objs.has(id)) continue;
      const obj = page.objs.get(id) as {
        width?: number;
        height?: number;
        kind?: number;
        data?: Uint8Array;
      } | null;
      if (!obj?.data || !obj.width || !obj.height || !obj.kind) continue;
      // The drawing is the big one; a logo in the title block is not.
      if (best && obj.width * obj.height <= best.width * best.height) continue;
      best = { width: obj.width, height: obj.height, kind: obj.kind, data: obj.data };
    }
    if (!best || best.width < 400 || best.height < 400) return null;

    const raw = toRgbBytes(best);
    if (!raw) return null;
    const out = await sharp(Buffer.from(raw), {
      raw: { width: best.width, height: best.height, channels: 3 },
    })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch (err: unknown) {
    log.warn("page raster extraction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** pdfjs ImageKind: 1 GRAYSCALE_1BPP (packed bits), 2 RGB_24BPP, 3 RGBA_32BPP. */
function toRgbBytes(img: {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array;
}): Uint8Array | null {
  const { width, height, kind, data } = img;
  const pixels = width * height;
  if (kind === 2) return data.length >= pixels * 3 ? data : null;
  if (kind === 3) {
    if (data.length < pixels * 4) return null;
    const out = new Uint8Array(pixels * 3);
    for (let i = 0, j = 0; i < pixels; i++, j += 4) {
      out[i * 3] = data[j]!;
      out[i * 3 + 1] = data[j + 1]!;
      out[i * 3 + 2] = data[j + 2]!;
    }
    return out;
  }
  if (kind === 1) {
    // One bit per pixel, rows padded to whole bytes. A set bit is white.
    const rowBytes = (width + 7) >> 3;
    if (data.length < rowBytes * height) return null;
    const out = new Uint8Array(pixels * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = data[y * rowBytes + (x >> 3)] ?? 0;
        const value = byte & (0x80 >> (x & 7)) ? 255 : 0;
        const o = (y * width + x) * 3;
        out[o] = value;
        out[o + 1] = value;
        out[o + 2] = value;
      }
    }
    return out;
  }
  return null;
}
