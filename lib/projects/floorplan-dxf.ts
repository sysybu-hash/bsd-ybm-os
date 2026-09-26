import sharp from "sharp";

import { createLogger } from "@/lib/logger";
import {
  WALL_MIN_LINE_WIDTH,
  type FloorplanVectorGeometry,
  type VectorSegment,
} from "@/lib/projects/floorplan-vector";

const log = createLogger("floorplan-dxf");

/**
 * A CAD drawing, as the same geometry a sales sheet's vectors produce.
 *
 * The pipeline downstream of `buildFlatFromGeometry` reads segments, curves and
 * a stroke width per segment — nothing about PDFs. A DXF carries the same
 * drawing with better provenance: layers say which lines are walls, so the
 * stroke width that a PDF forces us to infer is assigned outright here.
 *
 * Two things differ from a PDF and are handled below: DXF's y axis points up
 * where the viewport's points down, and a DXF has no page — the extent of the
 * drawing is the page.
 */

type Point = { x: number; y: number };

type DxfEntity = {
  type?: string;
  layer?: string;
  vertices?: Array<{ x?: number; y?: number; bulge?: number }>;
  center?: { x?: number; y?: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  shape?: boolean;
  closed?: boolean;
};

type DxfDocument = {
  entities?: DxfEntity[];
  header?: Record<string, unknown>;
};

/** Layer names that mean "wall" in the Hebrew and English drawings we see. */
const WALL_LAYER = /(^|[-_ ])(wall|walls|a-wall|קיר|קירות|מחיצ)/iu;

export function isWallLayer(layer?: string): boolean {
  return Boolean(layer && WALL_LAYER.test(layer));
}

/**
 * Metres per drawing unit, from the header's $INSUNITS.
 *
 * 1 = inches, 2 = feet, 4 = mm, 5 = cm, 6 = m. Anything else is unknown, and
 * the caller locks scale off the printed area the way it does for a PDF.
 */
export function metresPerUnit(header?: Record<string, unknown>): number | undefined {
  const raw = header?.["$INSUNITS"];
  const code = typeof raw === "number" ? raw : Number((raw as { value?: unknown })?.value ?? NaN);
  switch (code) {
    case 1:
      return 0.0254;
    case 2:
      return 0.3048;
    case 4:
      return 0.001;
    case 5:
      return 0.01;
    case 6:
      return 1;
    default:
      return undefined;
  }
}

function pointsOf(entity: DxfEntity): Point[] {
  const out: Point[] = [];
  for (const v of entity.vertices ?? []) {
    if (typeof v?.x === "number" && typeof v?.y === "number") out.push({ x: v.x, y: v.y });
  }
  return out;
}

/** An arc, as the straight chord the furniture pass reads it by. */
function arcChord(entity: DxfEntity): [Point, Point] | null {
  const cx = entity.center?.x;
  const cy = entity.center?.y;
  const r = entity.radius;
  if (typeof cx !== "number" || typeof cy !== "number" || typeof r !== "number" || r <= 0) {
    return null;
  }
  const from = typeof entity.startAngle === "number" ? entity.startAngle : 0;
  const to = typeof entity.endAngle === "number" ? entity.endAngle : Math.PI * 2;
  return [
    { x: cx + r * Math.cos(from), y: cy + r * Math.sin(from) },
    { x: cx + r * Math.cos(to), y: cy + r * Math.sin(to) },
  ];
}

type RawSegment = { a: Point; b: Point; layer?: string; curved: boolean };

function collect(entities: DxfEntity[]): RawSegment[] {
  const out: RawSegment[] = [];
  for (const entity of entities) {
    const type = (entity.type ?? "").toUpperCase();
    const layer = entity.layer;
    if (type === "LINE") {
      const [a, b] = pointsOf(entity);
      if (a && b) out.push({ a, b, layer, curved: false });
      continue;
    }
    if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const pts = pointsOf(entity);
      for (let i = 1; i < pts.length; i += 1) {
        out.push({ a: pts[i - 1]!, b: pts[i]!, layer, curved: false });
      }
      // `shape` is dxf-parser's name for a closed LWPOLYLINE.
      const closed = entity.closed === true || entity.shape === true;
      if (closed && pts.length > 2) {
        out.push({ a: pts[pts.length - 1]!, b: pts[0]!, layer, curved: false });
      }
      continue;
    }
    if (type === "ARC") {
      const chord = arcChord(entity);
      if (chord) out.push({ a: chord[0], b: chord[1], layer, curved: true });
      continue;
    }
    if (type === "CIRCLE") {
      // A basin or a pan: four chords keep its extent without pretending it is
      // a wall, which is exactly how a PDF's curves reach the furniture pass.
      const cx = entity.center?.x;
      const cy = entity.center?.y;
      const r = entity.radius;
      if (typeof cx !== "number" || typeof cy !== "number" || typeof r !== "number") continue;
      const at = (angle: number): Point => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
      for (let i = 0; i < 4; i += 1) {
        out.push({ a: at((i * Math.PI) / 2), b: at(((i + 1) * Math.PI) / 2), layer, curved: true });
      }
    }
  }
  return out;
}

/**
 * Build the pipeline's geometry from a parsed DXF.
 *
 * Returns null when the drawing carries nothing straight enough to be a plan —
 * an empty file, or one holding only text and dimensions.
 */
export function geometryFromDxfDocument(doc: DxfDocument): FloorplanVectorGeometry | null {
  const raw = collect(doc.entities ?? []);
  if (raw.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const row of raw) {
    for (const p of [row.a, row.b]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;

  // DXF counts y upwards from the drawing's own origin; the viewport counts it
  // down from the top-left, and every downstream test assumes the viewport.
  const toViewport = (p: Point): Point => ({ x: p.x - minX, y: maxY - p.y });

  const segments: VectorSegment[] = [];
  const curves: VectorSegment[] = [];
  for (const row of raw) {
    const a = toViewport(row.a);
    const b = toViewport(row.b);
    const seg: VectorSegment = {
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      // A DXF says what a line is for. A wall layer gets the width the wall
      // detector expects; everything else stays a thin line, as furniture does.
      lineWidth: isWallLayer(row.layer) ? WALL_MIN_LINE_WIDTH : 1,
    };
    if (row.curved) curves.push(seg);
    else segments.push(seg);
  }

  const walls = segments.filter(
    (seg) => seg.lineWidth >= WALL_MIN_LINE_WIDTH && (seg.x1 === seg.x2 || seg.y1 === seg.y2),
  );
  log.info("dxf geometry read", {
    segments: segments.length,
    curves: curves.length,
    walls: walls.length,
  });
  return { pageWidth: width, pageHeight: height, segments, walls, curves };
}

/** Parse DXF text into the pipeline's geometry. Returns null for anything unreadable. */
export async function geometryFromDxf(text: string): Promise<FloorplanVectorGeometry | null> {
  if (!text.includes("SECTION")) return null;
  try {
    const { default: DxfParser } = await import("dxf-parser");
    const doc = new DxfParser().parseSync(text) as DxfDocument | null;
    if (!doc) return null;
    return geometryFromDxfDocument(doc);
  } catch (err: unknown) {
    log.warn("dxf parse failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Rasterise a DXF page without passing the non-image DXF bytes to image/OCR
 * providers. Wall layers stay heavy, all other geometry stays legible, and
 * source text entities are retained so the raster fallback can read labels.
 */
export async function renderDxfPageJpeg(
  geometry: FloorplanVectorGeometry,
  dxfText: string,
  width = 2200,
): Promise<Buffer | null> {
  if (
    !Number.isFinite(geometry.pageWidth) ||
    !Number.isFinite(geometry.pageHeight) ||
    geometry.pageWidth <= 0 ||
    geometry.pageHeight <= 0 ||
    !Number.isFinite(width) ||
    width < 64
  ) return null;

  let doc: DxfDocument | null;
  try {
    const { default: DxfParser } = await import("dxf-parser");
    doc = new DxfParser().parseSync(dxfText) as DxfDocument | null;
  } catch (err: unknown) {
    log.warn("dxf text raster parsing failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
  if (!doc) return null;
  const raw = collect(doc.entities ?? []);
  if (raw.length === 0) return null;
  let minX = Infinity;
  let maxY = -Infinity;
  for (const item of raw) {
    minX = Math.min(minX, item.a.x, item.b.x);
    maxY = Math.max(maxY, item.a.y, item.b.y);
  }
  const height = Math.max(64, Math.round(width * geometry.pageHeight / geometry.pageWidth));
  if (height > 8192) return null;
  const scale = width / geometry.pageWidth;
  const thin = Math.max(0.45, Math.min(1.1, Math.min(width, height) * 0.00055));
  const thick = Math.max(1.1, Math.min(2.4, Math.min(width, height) * 0.0014));
  const lines = [...geometry.segments, ...geometry.curves].map((segment) => {
    const wall = segment.lineWidth >= WALL_MIN_LINE_WIDTH;
    const color = wall ? "#20252b" : "#555d66";
    const strokeWidth = wall ? thick : thin;
    return `<line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" stroke="${color}" stroke-width="${strokeWidth / scale}" stroke-linecap="round"/>`;
  }).join("");

  const point = (value: unknown): Point | null => {
    if (!value || typeof value !== "object") return null;
    const row = value as { x?: unknown; y?: unknown };
    return typeof row.x === "number" && typeof row.y === "number" ? { x: row.x, y: row.y } : null;
  };
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[char]!);
  const labels = (doc?.entities ?? []).flatMap((entity) => {
    const type = (entity.type ?? "").toUpperCase();
    if (type !== "TEXT" && type !== "MTEXT" && type !== "ATTRIB" && type !== "ATTDEF") return [];
    const row = entity as DxfEntity & {
      text?: string;
      position?: unknown;
      startPoint?: unknown;
      height?: number;
      textHeight?: number;
      rotation?: number;
    };
    const at = point(row.position) ?? point(row.startPoint);
    const text = row.text?.replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;/g, "").trim();
    if (!at || !text) return [];
    const x = at.x - minX;
    // geometryFromDxf flips Y around its maximum; reconstruct the same page point.
    const y = maxY - at.y;
    const size = Math.max(thin / scale, (row.height ?? row.textHeight ?? 2.5) * 0.72);
    const rotation = Number.isFinite(row.rotation) ? -row.rotation! : 0;
    return [`<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${size}" fill="#3d4650" direction="rtl" unicode-bidi="plaintext" transform="rotate(${rotation} ${x} ${y})">${escape(text)}</text>`];
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${geometry.pageWidth} ${geometry.pageHeight}"><rect width="100%" height="100%" fill="#fff"/>${lines}${labels}</svg>`;
  try {
    return await sharp(Buffer.from(svg)).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  } catch (err: unknown) {
    log.warn("dxf page rasterisation failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export { looksLikeDwg, looksLikeDxf } from "@/lib/projects/photo-prep/mime";
