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
};

export type FloorplanVectorGeometry = {
  pageWidth: number;
  pageHeight: number;
  /** Every drawn segment, already through the transform stack. */
  segments: VectorSegment[];
  /** Long axis-aligned runs — the wall candidates. */
  walls: VectorSegment[];
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
export async function extractFloorplanVectorGeometry(
  pdf: Buffer | Uint8Array,
  options?: { minWallLength?: number },
): Promise<FloorplanVectorGeometry | null> {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch (err: unknown) {
    log.warn("pdfjs unavailable", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  try {
    // A Node Buffer is a Uint8Array subclass, and pdfjs rejects it by name, so
    // always hand over a plain view rather than testing instanceof.
    const data = new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false })
      .promise;
    const page = await doc.getPage(1);
    // scale 1 with the page's own rotation applied, so a /Rotate 270 sheet — nine
    // of the ten in that batch — comes back the way it is meant to be read.
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const OPS = pdfjs.OPS;

    const segments: VectorSegment[] = [];
    let ctm = viewport.transform.slice() as Matrix;
    const stack: Matrix[] = [];

    const push = (ax: number, ay: number, bx: number, by: number) => {
      const [x1, y1] = apply(ctm, ax, ay);
      const [x2, y2] = apply(ctm, bx, by);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return;
      if (x1 === x2 && y1 === y2) return;
      segments.push({ x1, y1, x2, y2 });
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === OPS.save) {
        stack.push(ctm.slice() as Matrix);
        continue;
      }
      if (fn === OPS.restore) {
        ctm = (stack.pop() ?? viewport.transform.slice()) as Matrix;
        continue;
      }
      if (fn === OPS.transform) {
        ctm = multiply(ctm, ops.argsArray[i] as Matrix);
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
          // Walls are straight; a curve only has to leave the pen in the right place.
          k += 6;
          cx = coords[k - 2] ?? cx;
          cy = coords[k - 1] ?? cy;
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
    const walls = segments.filter((s) =>
      isWallCandidate(s, page2, options?.minWallLength ?? 12),
    );
    return { pageWidth: viewport.width, pageHeight: viewport.height, segments, walls };
  } catch (err: unknown) {
    log.warn("vector extraction failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
