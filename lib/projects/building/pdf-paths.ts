/**
 * Every painted path on one PDF page, with how it was painted.
 *
 * The flat readers keep a page's strokes as loose segments and forget whether
 * a path was filled — right for a sales sheet, where a wall is two faces with
 * hatch between. An architect's booklet paints its walls instead: the
 * structure a solid fill, the partitions another, each wall one closed shape.
 * So this keeps each path whole — its outline in page points, y down — with
 * the operator that painted it and the colours in force.
 */
export type PaintedPath = {
  /** Sub-paths, each a polyline; curves are flattened to their end points. */
  rings: Array<Array<[number, number]>>;
  filled: boolean;
  stroked: boolean;
  /** 0xRRGGBB, or null where none was set. */
  fill: number | null;
  stroke: number | null;
  lineWidth: number;
};

export type PdfPage = { width: number; height: number; paths: PaintedPath[] };

type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const colour = (raw: unknown): number | null => {
  if (typeof raw === "number") return raw;
  // pdfjs hands a colour over as three bytes, r, g, b.
  if (raw && typeof raw === "object" && 0 in raw) {
    const c = raw as Record<number, number>;
    return ((c[0]! & 255) << 16) | ((c[1]! & 255) << 8) | (c[2]! & 255);
  }
  if (typeof raw === "string" && /^#[0-9a-f]{6}$/i.test(raw)) return parseInt(raw.slice(1), 16);
  return null;
};

export async function readPdfPage(pdf: Uint8Array, pageNumber: number): Promise<PdfPage> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: pdf.slice(), verbosity: 0, isEvalSupported: false }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const OPS = pdfjs.OPS;

  let ctm = viewport.transform.slice() as Matrix;
  let lineWidth = 1;
  let fill: number | null = null;
  let stroke: number | null = null;
  const stack: Array<{ ctm: Matrix; lineWidth: number; fill: number | null; stroke: number | null }> = [];
  let pending: Array<Array<[number, number]>> = [];
  const paths: PaintedPath[] = [];

  const at = (x: number, y: number): [number, number] => [
    ctm[0] * x + ctm[2] * y + ctm[4],
    ctm[1] * x + ctm[3] * y + ctm[5],
  ];
  const paint = (filled: boolean, stroked: boolean) => {
    const rings = pending.filter((r) => r.length >= 2);
    pending = [];
    if (rings.length === 0 || (!filled && !stroked)) return;
    paths.push({ rings, filled, stroked, fill, stroke, lineWidth: lineWidth * Math.hypot(ctm[0], ctm[1]) });
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ctm: ctm.slice() as Matrix, lineWidth, fill, stroke });
        break;
      case OPS.restore: {
        const prev = stack.pop();
        if (prev) ({ ctm, lineWidth, fill, stroke } = prev);
        break;
      }
      case OPS.transform:
        ctm = multiply(ctm, args as Matrix);
        break;
      case OPS.setLineWidth:
        lineWidth = Number(args[0]) || 0;
        break;
      case OPS.setFillRGBColor:
        fill = colour(args.length >= 3 ? args : args[0]);
        break;
      case OPS.setStrokeRGBColor:
        stroke = colour(args.length >= 3 ? args : args[0]);
        break;
      case OPS.constructPath: {
        const [cmds, coords] = args as [number[], number[]];
        let k = 0;
        let ring: Array<[number, number]> | null = null;
        for (const cmd of cmds) {
          if (cmd === OPS.moveTo) {
            ring = [at(coords[k]!, coords[k + 1]!)];
            pending.push(ring);
            k += 2;
          } else if (cmd === OPS.lineTo) {
            if (!ring) pending.push((ring = []));
            ring.push(at(coords[k]!, coords[k + 1]!));
            k += 2;
          } else if (cmd === OPS.curveTo) {
            if (!ring) pending.push((ring = []));
            ring.push(at(coords[k + 4]!, coords[k + 5]!));
            k += 6;
          } else if (cmd === OPS.curveTo2 || cmd === OPS.curveTo3) {
            if (!ring) pending.push((ring = []));
            ring.push(at(coords[k + 2]!, coords[k + 3]!));
            k += 4;
          } else if (cmd === OPS.rectangle) {
            const [x, y, w, h] = [coords[k]!, coords[k + 1]!, coords[k + 2]!, coords[k + 3]!];
            pending.push((ring = [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h), at(x, y)]));
            k += 4;
          } else if (cmd === OPS.closePath) {
            if (ring && ring.length) ring.push(ring[0]!);
          }
        }
        break;
      }
      case OPS.fill:
      case OPS.eoFill:
        paint(true, false);
        break;
      case OPS.stroke:
      case OPS.closeStroke:
        paint(false, true);
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        paint(true, true);
        break;
      case OPS.endPath:
        pending = [];
        break;
    }
  }
  return { width: viewport.width, height: viewport.height, paths };
}

/** The page with every point mapped by x' = s·x + tx, y' = s·y + ty: another sheet's frame. */
export function transformPage(page: PdfPage, s: number, tx: number, ty: number): PdfPage {
  return {
    width: page.width * s,
    height: page.height * s,
    paths: page.paths.map((p) => ({
      ...p,
      // The pen, not the drawn width: pens are told apart by it.
      lineWidth: p.lineWidth,
      rings: p.rings.map((r) => r.map(([x, y]) => [s * x + tx, s * y + ty] as [number, number])),
    })),
  };
}
