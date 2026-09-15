import sharp from "sharp";
import {
  inferRoomKind,
  isStorageOrServiceRoom,
  isStudyRoom,
  type FloorplanBbox,
  type FloorplanLayout,
  type FloorplanRoom,
} from "@/lib/projects/floorplan-layout";
import { isTrustworthyRoomGeometry, unitCropFromLayout } from "@/lib/projects/floorplan-locator";

const RASTER = /^image\//i;
const MAX_LONG_EDGE = 4096;
const MIN_SHORT_EDGE = 1600;
const TARGET_SHORT_EDGE = 2400;

export type PreparedFloorplanSource = {
  base64: string;
  mimeType: string;
  sourceKind: "pdf" | "photo" | "drawing";
};

export function isRasterFloorplanMime(mime: string): boolean {
  return RASTER.test(mime) && !/svg/i.test(mime);
}

export function floorplanSourceFileName(mimeType: string): string {
  if (mimeType === "application/pdf") return "floorplan.pdf";
  if (mimeType.includes("png")) return "floorplan.png";
  if (mimeType.includes("webp")) return "floorplan.webp";
  return "floorplan.jpg";
}

/** כש-Windows שולח type ריק והקובץ בכל זאת תמונה / PDF */
/** Real PDF bytes only — a JPEG stored under a .pdf name is not a sheet. */
export function bufferIfPdf(bytes: Buffer | Uint8Array | null | undefined): Buffer | null {
  if (!bytes || bytes.length < 4) return null;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return buf.subarray(0, 4).toString("latin1") === "%PDF" ? buf : null;
}

export function sniffFloorplanMime(base64: string, mimeType: string): string {
  const mime = mimeType.trim();
  if (mime && mime !== "application/octet-stream") return mime;
  try {
    const buf = Buffer.from(base64.slice(0, 48), "base64");
    if (buf.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
      return "image/webp";
    }
  } catch {
    /* ignore */
  }
  return mime || "application/pdf";
}

export function paperPixelRatio(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  threshold = 140,
): number {
  if (width < 8 || height < 8 || grey.length < width * height) return 0;
  let count = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    if ((grey[i] ?? 0) >= threshold) count++;
  }
  return count / n;
}

export function detectPaperCropBox(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  threshold = 140,
): { left: number; top: number; width: number; height: number } | null {
  if (width < 8 || height < 8 || grey.length < width * height) return null;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((grey[row + x] ?? 0) >= threshold) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const paperRatio = count / (width * height);
  if (paperRatio < 0.18 || paperRatio > 0.97) return null;
  const padX = Math.max(2, Math.round(width * 0.02));
  const padY = Math.max(2, Math.round(height * 0.02));
  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const right = Math.min(width - 1, maxX + padX);
  const bottom = Math.min(height - 1, maxY + padY);
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < width * 0.45 || cropH < height * 0.45) return null;
  if (cropW >= width * 0.98 && cropH >= height * 0.98) return null;
  return { left, top, width: cropW, height: cropH };
}

/**
 * Bounding box of dark ink, ignoring the outer frame of a sales sheet.
 * detectPaperCropBox finds the light paper — that leaves the drawing tiny
 * inside a white A4. Compare pages need the walls, not the sheet.
 */
function bandDarkRatio(
  grey: Uint8Array | Buffer,
  width: number,
  height: number,
  darkMax: number,
  axis: "row" | "col",
  index: number,
): number {
  let dark = 0;
  if (axis === "row") {
    const row = index * width;
    for (let x = 0; x < width; x += 1) {
      if ((grey[row + x] ?? 255) < darkMax) dark += 1;
    }
    return width > 0 ? dark / width : 0;
  }
  for (let y = 0; y < height; y += 1) {
    if ((grey[y * width + index] ?? 255) < darkMax) dark += 1;
  }
  return height > 0 ? dark / height : 0;
}

/**
 * Walk through a thick rounded sheet border to the paper inside.
 * Only the outer ~12% is a frame — walking to mid-page treats apartment
 * walls as a border and throws the drawing away.
 */
export function innerSheetRect(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): { left: number; top: number; width: number; height: number } {
  const walk = (axis: "row" | "col", start: number, end: number, step: number): number => {
    const limit = axis === "row" ? height : width;
    const persist = Math.max(8, Math.round(limit * 0.015));
    let seenBorder = false;
    for (let i = start; step > 0 ? i < end : i > end; i += step) {
      if (i < 0 || i >= limit) break;
      const ratio = bandDarkRatio(grey, width, height, darkMax, axis, i);
      if (!seenBorder && ratio > 0.04) seenBorder = true;
      else if (seenBorder && ratio < 0.03) {
        let paper = true;
        for (let k = 1; k <= persist; k += 1) {
          const j = i + k * step;
          if (j < 0 || j >= limit) {
            paper = false;
            break;
          }
          if (bandDarkRatio(grey, width, height, darkMax, axis, j) >= 0.03) {
            paper = false;
            break;
          }
        }
        if (paper) return i;
      }
    }
    return start;
  };
  const top = walk("row", 0, Math.floor(height * 0.16), 1);
  const bottom = walk("row", height - 1, Math.floor(height * 0.84), -1);
  const left = walk("col", 0, Math.floor(width * 0.16), 1);
  const right = walk("col", width - 1, Math.floor(width * 0.84), -1);
  const innerLeft = Math.min(left, right);
  const innerRight = Math.max(left, right);
  const innerTop = Math.min(top, bottom);
  const innerBottom = Math.max(top, bottom);
  const cropW = innerRight - innerLeft + 1;
  const cropH = innerBottom - innerTop + 1;
  if (cropW < width * 0.4 || cropH < height * 0.4) {
    return { left: 0, top: 0, width, height };
  }
  return { left: innerLeft, top: innerTop, width: cropW, height: cropH };
}

function tallClusters(
  length: number,
  cross: number,
  isTall: (index: number) => boolean,
): Array<{ a: number; b: number }> {
  const out: Array<{ a: number; b: number }> = [];
  let start = -1;
  for (let i = 0; i < length; i += 1) {
    if (isTall(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push({ a: start, b: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) out.push({ a: start, b: length - 1 });
  return out.filter((c) => c.b - c.a + 1 <= Math.max(6, Math.round(cross * 0.02)));
}

function pairedClusterEdge(
  clusters: Array<{ a: number; b: number }>,
  gap: number,
  fromStart: boolean,
): number | null {
  const list = fromStart ? clusters : [...clusters].reverse();
  for (let i = 0; i < list.length - 1; i += 1) {
    const first = list[i]!;
    const second = list[i + 1]!;
    const left = fromStart ? first : second;
    const right = fromStart ? second : first;
    if (right.a - left.b <= gap && right.a - left.b >= 1) {
      return fromStart ? right.b + 1 : left.a - 1;
    }
  }
  return null;
}

/**
 * Interior of a double rounded sales-sheet frame. Title-block rules are single
 * strokes; the sheet border is a close pair of tall/long strokes.
 */
export function innerDoubleFrameRect(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): { left: number; top: number; width: number; height: number } {
  const tallY = Math.max(12, Math.round(height * 0.32));
  const tallX = Math.max(12, Math.round(width * 0.32));
  const gapX = Math.max(4, Math.round(width * 0.035));
  const gapY = Math.max(4, Math.round(height * 0.035));
  const colClusters = tallClusters(width, height, (x) => columnLongestDarkRun(grey, width, height, x, darkMax) >= tallY);
  const rowClusters = tallClusters(height, width, (y) => {
    let run = 0;
    let longest = 0;
    for (let x = 0; x < width; x += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 0;
    }
    return longest >= tallX;
  });
  const edge = 0.2;
  const leftRaw = pairedClusterEdge(colClusters, gapX, true);
  const rightRaw = pairedClusterEdge(colClusters, gapX, false);
  const topRaw = pairedClusterEdge(rowClusters, gapY, true);
  const bottomRaw = pairedClusterEdge(rowClusters, gapY, false);
  const left = leftRaw != null && leftRaw <= width * edge ? leftRaw : null;
  const right = rightRaw != null && rightRaw >= width * (1 - edge) ? rightRaw : null;
  const top = topRaw != null && topRaw <= height * edge ? topRaw : null;
  const bottom = bottomRaw != null && bottomRaw >= height * (1 - edge) ? bottomRaw : null;
  if (left == null && right == null && top == null && bottom == null) {
    return { left: 0, top: 0, width, height };
  }
  const inset = Math.max(6, Math.round(Math.min(width, height) * 0.016));
  const x0 = Math.max(0, (left ?? 0) + inset);
  const y0 = Math.max(0, (top ?? 0) + inset);
  const x1 = Math.min(width - 1, (right ?? width - 1) - inset);
  const y1 = Math.min(height - 1, (bottom ?? height - 1) - inset);
  const cropW = x1 - x0 + 1;
  const cropH = y1 - y0 + 1;
  if (cropW < width * 0.35 || cropH < height * 0.35) {
    return { left: 0, top: 0, width, height };
  }
  return { left: x0, top: y0, width: cropW, height: cropH };
}

export function detectInkCropBox(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  options?: {
    darkMax?: number;
    edgeIgnore?: number | { left?: number; right?: number; top?: number; bottom?: number };
    padRatio?: number;
  },
): { left: number; top: number; width: number; height: number } | null {
  if (width < 8 || height < 8 || grey.length < width * height) return null;
  const darkMax = options?.darkMax ?? 170;
  const padRatio = options?.padRatio ?? 0.06;
  const ignore = options?.edgeIgnore;
  const ignoreOf = (side: "left" | "right" | "top" | "bottom", fallback: number): number => {
    if (typeof ignore === "number") return ignore;
    if (ignore && typeof ignore === "object") return ignore[side] ?? fallback;
    return fallback;
  };
  const def = 0.08;
  const x0 = Math.max(0, Math.round(width * ignoreOf("left", def)));
  const y0 = Math.max(0, Math.round(height * ignoreOf("top", def)));
  const x1 = Math.max(x0 + 1, width - Math.round(width * ignoreOf("right", def)));
  const y1 = Math.max(y0 + 1, height - Math.round(height * ignoreOf("bottom", def)));
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = y * width;
    for (let x = x0; x < x1; x += 1) {
      if ((grey[row + x] ?? 255) < darkMax) {
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const inner = (x1 - x0) * (y1 - y0);
  if (inner <= 0 || count < inner * 0.02) return null;
  const colIsSheetStroke = (x: number): boolean =>
    columnLongestDarkRun(grey, width, height, x, darkMax) >= height * 0.65;
  while (minX < maxX && colIsSheetStroke(minX)) minX += 1;
  while (maxX > minX && colIsSheetStroke(maxX)) maxX -= 1;
  const padX = Math.max(4, Math.round((maxX - minX + 1) * padRatio));
  const padY = Math.max(4, Math.round((maxY - minY + 1) * padRatio));
  const rowIsSheetStroke = (y: number): boolean => {
    let run = 0;
    let longest = 0;
    for (let x = 0; x < width; x += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 0;
    }
    return longest >= width * 0.65;
  };
  while (minY < maxY && rowIsSheetStroke(minY)) minY += 1;
  while (maxY > minY && rowIsSheetStroke(maxY)) maxY -= 1;
  let left = Math.max(0, minX - padX);
  let top = Math.max(0, minY - padY);
  let right = Math.min(width - 1, maxX + padX);
  let bottom = Math.min(height - 1, maxY + padY);
  while (left < minX && colIsSheetStroke(left)) left += 1;
  while (right > maxX && colIsSheetStroke(right)) right -= 1;
  while (top < minY && rowIsSheetStroke(top)) top += 1;
  while (bottom > maxY && rowIsSheetStroke(bottom)) bottom -= 1;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < width * 0.18 || cropH < height * 0.18) return null;
  if (cropW >= width * 0.96 && cropH >= height * 0.96) return null;
  return { left, top, width: cropW, height: cropH };
}

function bandDarkInRect(
  grey: Uint8Array | Buffer,
  width: number,
  darkMax: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  if (right <= left || bottom <= top) return 0;
  let dark = 0;
  let n = 0;
  for (let y = top; y < bottom; y += 1) {
    const row = y * width;
    for (let x = left; x < right; x += 1) {
      n += 1;
      if ((grey[row + x] ?? 255) < darkMax) dark += 1;
    }
  }
  return n > 0 ? dark / n : 0;
}

/** Thin full-span stroke + paper, not rooms/fixtures sitting in the margin. */
function bandIsFrameChrome(
  grey: Uint8Array | Buffer,
  width: number,
  darkMax: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  vertical: boolean,
): boolean {
  const bw = right - left;
  const bh = bottom - top;
  if (bw <= 0 || bh <= 0) return true;
  const ratio = bandDarkInRect(grey, width, darkMax, left, top, right, bottom);
  if (ratio < 0.02) return true;
  if (ratio > 0.12) return false;
  let span = 0;
  let spanDark = 0;
  let total = 0;
  if (vertical) {
    for (let x = left; x < right; x += 1) {
      let dark = 0;
      for (let y = top; y < bottom; y += 1) {
        total += 1;
        if ((grey[y * width + x] ?? 255) < darkMax) {
          dark += 1;
        }
      }
      if (bh > 0 && dark / bh >= 0.55) {
        span += 1;
        spanDark += dark;
      }
    }
  } else {
    for (let y = top; y < bottom; y += 1) {
      let dark = 0;
      for (let x = left; x < right; x += 1) {
        total += 1;
        if ((grey[y * width + x] ?? 255) < darkMax) {
          dark += 1;
        }
      }
      if (bw > 0 && dark / bw >= 0.55) {
        span += 1;
        spanDark += dark;
      }
    }
  }
  const maxSpan = Math.max(4, Math.round((vertical ? bw : bh) * 0.3));
  if (span === 0 || span > maxSpan) return false;
  const leftover = (ratio * total - spanDark) / Math.max(1, total);
  return leftover < 0.025;
}

/**
 * A sales-sheet frame is the outermost ink. Ignoring the outer 8% then finds
 * the apartment. The band between those boxes is a thin stroke + paper — not
 * rooms. A tight drawing has real walls/fixtures in that band; keep it.
 */
export function preferDrawingOverSheetFrame(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): { left: number; top: number; width: number; height: number } | null {
  const full = detectInkCropBox(width, height, grey, { darkMax, edgeIgnore: 0, padRatio: 0.02 });
  const inner = detectInkCropBox(width, height, grey, { darkMax, edgeIgnore: 0.08, padRatio: 0.035 });
  if (!inner) return full;
  if (!full) return inner;
  const fullArea = full.width * full.height;
  const innerArea = inner.width * inner.height;
  if (innerArea > fullArea * 0.9) return full;
  const fl = full.left;
  const ft = full.top;
  const fr = full.left + full.width;
  const fb = full.top + full.height;
  const il = Math.max(inner.left, fl);
  const it = Math.max(inner.top, ft);
  const ir = Math.min(inner.left + inner.width, fr);
  const ib = Math.min(inner.top + inner.height, fb);
  if (ir <= il || ib <= it) return full;
  const chrome =
    bandIsFrameChrome(grey, width, darkMax, fl, ft, fr, it, false) &&
    bandIsFrameChrome(grey, width, darkMax, fl, ib, fr, fb, false) &&
    bandIsFrameChrome(grey, width, darkMax, fl, it, il, ib, true) &&
    bandIsFrameChrome(grey, width, darkMax, ir, it, fr, ib, true);
  return chrome ? inner : full;
}

function columnLongestDarkRun(
  grey: Uint8Array | Buffer,
  width: number,
  height: number,
  x: number,
  darkMax: number,
): number {
  return columnLongestDarkSpan(grey, width, height, x, darkMax).length;
}

function columnLongestDarkSpan(
  grey: Uint8Array | Buffer,
  width: number,
  height: number,
  x: number,
  darkMax: number,
): { length: number; y0: number; y1: number } {
  let run = 0;
  let run0 = 0;
  let longest = 0;
  let best0 = 0;
  let best1 = -1;
  for (let y = 0; y < height; y += 1) {
    if ((grey[y * width + x] ?? 255) < darkMax) {
      if (run === 0) run0 = y;
      run += 1;
      if (run > longest) {
        longest = run;
        best0 = run0;
        best1 = y;
      }
    } else {
      run = 0;
    }
  }
  return { length: longest, y0: best0, y1: best1 };
}

/**
 * Rooms to the right of a candidate cut — another wing, not a title block.
 * A title column is a narrow slab / specks; an L-wing has wide room fills
 * or several vertical walls spread across the band (line-drawn plans).
 */
function roomsRightOfCut(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  fromX: number,
  darkMax: number,
): boolean {
  const toX = Math.min(width, fromX + Math.max(8, Math.round(width * 0.22)));
  if (toX - fromX < 6) return false;
  const mid0 = Math.round(height * 0.12);
  const mid1 = Math.max(mid0 + 1, Math.round(height * 0.88));
  const midH = mid1 - mid0;
  const runInMid = (x: number): number => {
    let run = 0;
    let longest = 0;
    for (let y = mid0; y < mid1; y += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 0;
    }
    return longest;
  };
  let minX = toX;
  let maxX = fromX;
  let minY = mid1;
  let maxY = mid0;
  for (let y = mid0; y < mid1; y += 1) {
    const row = y * width;
    for (let x = fromX; x < toX; x += 1) {
      if ((grey[row + x] ?? 255) < darkMax) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return false;
  const inkW = maxX - minX + 1;
  const inkH = maxY - minY + 1;
  if (inkW <= width * 0.17 && inkH >= midH * 0.4) return false;
  let hWalls = 0;
  let y = mid0;
  while (y < mid1) {
    let run = 0;
    let longest = 0;
    const row = y * width;
    for (let x = fromX; x < toX; x += 1) {
      if ((grey[row + x] ?? 255) < darkMax) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 0;
    }
    if (longest >= Math.max(8, Math.round(inkW * 0.5))) {
      hWalls += 1;
      y += Math.max(2, Math.round(midH * 0.04));
    } else {
      y += 1;
    }
  }
  if (hWalls >= 4 && inkW >= width * 0.1) return true;
  const wallMin = Math.max(8, Math.round(midH * 0.14));
  let walls = 0;
  let wall0 = toX;
  let wall1 = fromX;
  for (let x = fromX; x < toX; x += 1) {
    if (runInMid(x) >= wallMin) {
      walls += 1;
      if (x < wall0) wall0 = x;
      if (x > wall1) wall1 = x;
    }
  }
  return walls >= 2 && wall1 - wall0 >= Math.max(8, Math.round(width * 0.1));
}

function columnDarkTransitions(
  grey: Uint8Array | Buffer,
  width: number,
  height: number,
  x: number,
  darkMax: number,
): number {
  let n = 0;
  let prev = (grey[x] ?? 255) < darkMax;
  for (let y = 1; y < height; y += 1) {
    const dark = (grey[y * width + x] ?? 255) < darkMax;
    if (dark !== prev) n += 1;
    prev = dark;
  }
  return n;
}

/**
 * Right edge of the apartment on a portrait sales sheet.
 * A fixed 74% cut slices kitchen/living. Sparse title-block text also fails a
 * "dense text" test — drop the right strip at the white gutter after the last
 * wall, only when what follows is not another wing of the flat.
 */
export function titleBlockCutX(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): number {
  if (width < 24 || height < 24) return width;
  const mid0 = Math.round(height * 0.12);
  const mid1 = Math.max(mid0 + 1, Math.round(height * 0.88));
  const midH = mid1 - mid0;
  const wallMin = Math.max(10, Math.round(midH * 0.12));
  const textMin = Math.max(8, Math.round(midH * 0.045));
  const runInMid = (x: number): number => {
    let run = 0;
    let longest = 0;
    for (let y = mid0; y < mid1; y += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 0;
    }
    return longest;
  };
  const isWall = (x: number) => runInMid(x) >= wallMin;
  const ratioAt = (x: number) => {
    let dark = 0;
    for (let y = mid0; y < mid1; y += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    }
    return midH > 0 ? dark / midH : 0;
  };
  const isText = (x: number) => {
    if (isWall(x)) return false;
    return ratioAt(x) > 0.012 && columnDarkTransitions(grey, width, height, x, darkMax) >= textMin;
  };
  const emptyMax = 0.016;
  const minGutter = Math.max(4, Math.round(width * 0.016));
  const searchFrom = Math.floor(width * 0.36);
  const searchTo = Math.floor(width * 0.94);
  let lastCut = -1;
  let x = searchFrom;
  while (x < searchTo) {
    if (ratioAt(x) >= emptyMax) {
      x += 1;
      continue;
    }
    const start = x;
    while (x < searchTo && ratioAt(x) < emptyMax) x += 1;
    if (x - start < minGutter) continue;
    const lookL = Math.max(0, start - Math.round(width * 0.28));
    let leftWall = false;
    for (let i = lookL; i < start; i += 1) {
      if (isWall(i)) {
        leftWall = true;
        break;
      }
    }
    const lookR = Math.min(width, x + Math.round(width * 0.22));
    let rightInk = 0;
    let rightWalls = 0;
    let rightText = 0;
    for (let i = x; i < lookR; i += 1) {
      if (isWall(i)) rightWalls += 1;
      else if (isText(i)) rightText += 1;
      else if (ratioAt(i) > 0.006) rightInk += 1;
    }
    const wideGutter = x - start >= Math.round(width * 0.08);
    const titleLike = rightText >= 3 || rightInk + rightText >= 8;
    if (
      leftWall &&
      (rightInk >= 2 || rightText >= 2) &&
      (rightWalls < 3 || (wideGutter && titleLike)) &&
      !roomsRightOfCut(width, height, grey, x, darkMax)
    ) {
      const cut = start;
      if (cut >= width * 0.36 && cut < width) lastCut = cut;
    }
  }
  if (lastCut > 0) return lastCut;
  const frame = Math.max(2, Math.round(width * 0.03));
  let rightmostWall = -1;
  for (let i = 0; i < width - frame; i += 1) {
    if (isWall(i)) rightmostWall = i;
  }
  if (rightmostWall < 0 || rightmostWall < width * 0.4) return width;
  const from = rightmostWall + 1;
  let text = 0;
  let wall = 0;
  let ink = 0;
  let cols = 0;
  for (let i = from; i < width - frame; i += 1) {
    cols += 1;
    if (isWall(i)) wall += 1;
    else if (isText(i)) text += 1;
    if (ratioAt(i) > 0.006) ink += 1;
  }
  if (cols < 3) return width;
  if (wall >= 3) return width;
  if (ink < 2 && text < 2) return width;
  const pad = Math.max(3, Math.round(width * 0.012));
  const cut = Math.min(width, rightmostWall + 1 + pad);
  if (cut < width * 0.36 || cut >= width) return width;
  return cut;
}

/**
 * Vertical rule between the drawing and the title block. The first white
 * gutter inside the flat is not this — that cut takes the kitchen off.
 */
export function titleDividerCutX(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): number {
  if (width < 24 || height < 24) return width;
  const mid0 = Math.round(height * 0.12);
  const mid1 = Math.max(mid0 + 1, Math.round(height * 0.88));
  const midH = mid1 - mid0;
  const tallMin = Math.max(16, Math.round(midH * 0.55));
  const maxStroke = Math.max(4, Math.round(width * 0.012));
  const from = Math.floor(width * 0.52);
  const to = Math.floor(width * 0.9);
  const runInMid = (x: number): number => {
    let run = 0;
    let longest = 0;
    for (let y = mid0; y < mid1; y += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) {
        run += 1;
        if (run > longest) longest = run;
      } else run = 0;
    }
    return longest;
  };
  const isTall = (x: number) => runInMid(x) >= tallMin;
  let x = from;
  while (x < to) {
    if (!isTall(x)) {
      x += 1;
      continue;
    }
    const a = x;
    while (x < to && isTall(x) && x - a < maxStroke) x += 1;
    if (x - a > maxStroke) continue;
    let light = 0;
    const lookL = Math.max(from, a - Math.round(width * 0.06));
    for (let i = lookL; i < a; i += 1) {
      if (!isTall(i) && runInMid(i) < midH * 0.04) light += 1;
    }
    let titleInk = 0;
    const lookR = Math.min(width, x + Math.round(width * 0.12));
    for (let i = x; i < lookR; i += 1) {
      let dark = 0;
      for (let y = mid0; y < mid1; y += 1) {
        if ((grey[y * width + i] ?? 255) < darkMax) dark += 1;
      }
      if (dark >= 3) titleInk += 1;
    }
    if (light >= 3 && titleInk >= 4 && !roomsRightOfCut(width, height, grey, x, darkMax)) return a;
  }
  return width;
}

/**
 * Peel a leftover title-block sliver from the right — sparse text/logo, not a
 * long wall. Stops at the apartment's right facade. An isolated table rule
 * (empty gutter to its left) is skipped.
 */
export function stripRightSparseChromeX(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): number {
  if (width < 24 || height < 24) return width;
  const wallMin = Math.max(10, Math.round(height * 0.1));
  const isWall = (x: number) => columnLongestDarkRun(grey, width, height, x, darkMax) >= wallMin;
  const ratioAt = (x: number) => bandDarkRatio(grey, width, height, darkMax, "col", x);
  const leftIsGutter = (x: number): boolean => {
    const from = Math.max(0, x - Math.max(3, Math.round(width * 0.035)));
    if (from >= x) return false;
    const span = x - from;
    let empty = 0;
    let envelope = 0;
    for (let i = from; i < x; i += 1) {
      if (ratioAt(i) < 0.014) empty += 1;
    }
    for (let y = 0; y < height; y += 1) {
      let dark = 0;
      for (let i = from; i < x; i += 1) {
        if ((grey[y * width + i] ?? 255) < darkMax) dark += 1;
      }
      if (dark / span >= 0.5) envelope += 1;
    }
    return empty / span >= 0.7 && envelope < 3;
  };
  let right = width - 1;
  const stop = Math.floor(width * 0.5);
  while (right > stop) {
    if (!isWall(right)) {
      right -= 1;
      continue;
    }
    if (leftIsGutter(right)) {
      right -= 1;
      continue;
    }
    break;
  }
  const pad = Math.max(3, Math.round(width * 0.01));
  const cut = Math.min(width, right + 1 + pad);
  if (cut >= width || cut < width * 0.48) return width;
  return cut;
}

/**
 * Double sales-sheet rules on the right: tall strokes with empty paper to
 * their left. Apartment walls have rooms on the left, so they stay.
 */
export function stripRightFrameRulesX(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): number {
  if (width < 24 || height < 24) return width;
  const tallMin = Math.max(12, Math.round(height * 0.32));
  const isTallRule = (x: number) => columnLongestDarkRun(grey, width, height, x, darkMax) >= tallMin;
  const ratioAt = (x: number) => bandDarkRatio(grey, width, height, darkMax, "col", x);
  const gutterAlongRule = (x: number): boolean => {
    const span = columnLongestDarkSpan(grey, width, height, x, darkMax);
    if (span.length < tallMin || span.y1 < span.y0) return false;
    const mid0 = span.y0 + Math.round((span.y1 - span.y0) * 0.2);
    const mid1 = span.y1 - Math.round((span.y1 - span.y0) * 0.2);
    if (mid1 <= mid0) return false;
    const from = Math.max(0, x - Math.max(6, Math.round(width * 0.045)));
    const twinGap = Math.max(4, Math.round(width * 0.03));
    let dark = 0;
    let n = 0;
    for (let i = from; i < x; i += 1) {
      if (isTallRule(i) && x - i <= twinGap) continue;
      for (let y = mid0; y <= mid1; y += 1) {
        n += 1;
        if ((grey[y * width + i] ?? 255) < darkMax) dark += 1;
      }
    }
    if (n === 0) return true;
    if (dark / n >= 0.035) return false;
    const need = Math.max(4, Math.round((x - from) * 0.55));
    for (let y = mid0; y <= mid1; y += 1) {
      let run = 0;
      let longest = 0;
      const row = y * width;
      for (let i = from; i < x; i += 1) {
        if (isTallRule(i) && x - i <= twinGap) continue;
        if ((grey[row + i] ?? 255) < darkMax) {
          run += 1;
          if (run > longest) longest = run;
        } else run = 0;
      }
      if (longest >= need) return false;
    }
    return true;
  };
  let right = width - 1;
  const stop = Math.floor(width * 0.48);
  while (right > stop) {
    if (ratioAt(right) < 0.04 && !isTallRule(right)) {
      right -= 1;
      continue;
    }
    if (isTallRule(right) && gutterAlongRule(right)) {
      right -= 1;
      continue;
    }
    break;
  }
  const cut = right + 1;
  if (cut >= width || cut < width * 0.45) return width;
  return cut;
}

/**
 * Inner sheet stroke that ink-pad pulled back: nearly full raster height
 * (into the white margins). Apartment walls stop inside those margins.
 */
export function peelIsolatedEdgeFrame(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 170,
): { left: number; top: number; width: number; height: number } {
  if (width < 24 || height < 24) return { left: 0, top: 0, width, height };
  const tallMin = Math.max(16, Math.round(height * 0.55));
  const longMin = Math.max(16, Math.round(width * 0.55));
  const marginY = Math.max(4, Math.round(height * 0.12));
  const marginX = Math.max(4, Math.round(width * 0.12));
  const maxStrokeX = Math.max(5, Math.round(width * 0.02));
  const maxStrokeY = Math.max(5, Math.round(height * 0.02));
  const isEdgeStroke = (x: number): boolean => {
    const span = columnLongestDarkSpan(grey, width, height, x, darkMax);
    if (span.length < tallMin) return false;
    return span.y0 < marginY && span.y1 > height - 1 - marginY;
  };
  const isLight = (x: number): boolean =>
    !isEdgeStroke(x) && bandDarkRatio(grey, width, height, darkMax, "col", x) < 0.1;
  const rowLongest = (y: number): { length: number; x0: number; x1: number } => {
    let run = 0;
    let run0 = 0;
    let longest = 0;
    let best0 = 0;
    let best1 = -1;
    for (let x = 0; x < width; x += 1) {
      if ((grey[y * width + x] ?? 255) < darkMax) {
        if (run === 0) run0 = x;
        run += 1;
        if (run > longest) {
          longest = run;
          best0 = run0;
          best1 = x;
        }
      } else run = 0;
    }
    return { length: longest, x0: best0, x1: best1 };
  };
  const isEdgeRow = (y: number): boolean => {
    const span = rowLongest(y);
    if (span.length < longMin) return false;
    return span.x0 < marginX && span.x1 > width - 1 - marginX;
  };
  const isCenteredCap = (y: number): boolean => {
    const span = rowLongest(y);
    if (span.length < 8) return bandDarkRatio(grey, width, height, darkMax, "row", y) < 0.04;
    if (span.length >= width * 0.65) return false;
    return span.x0 > width * 0.12 && span.x1 < width * 0.88;
  };
  const isLightRow = (y: number): boolean =>
    !isEdgeRow(y) && bandDarkRatio(grey, width, height, darkMax, "row", y) < 0.1;

  const peelAxis = (
    fromStart: boolean,
    lo: number,
    hi: number,
    limit: number,
    isStroke: (i: number) => boolean,
    isLite: (i: number) => boolean,
    maxStroke: number,
  ): number => {
    let i = fromStart ? lo : hi;
    const stop = fromStart
      ? Math.min(hi, lo + Math.floor(limit * 0.2))
      : Math.max(lo, hi - Math.floor(limit * 0.2));
    const step = fromStart ? 1 : -1;
    while (fromStart ? i < stop : i > stop) {
      if (isLite(i)) {
        i += step;
        continue;
      }
      break;
    }
    if (!isStroke(i)) return fromStart ? lo : hi;
    let other = i;
    while (
      (fromStart ? other < hi : other > lo) &&
      isStroke(other + step) &&
      Math.abs(other + step - i) < maxStroke
    ) {
      other += step;
    }
    const a = Math.min(i, other);
    const b = Math.max(i, other);
    if (b - a + 1 > maxStroke) return fromStart ? lo : hi;
    return fromStart ? b + 1 : a - 1;
  };

  let left = 0;
  let right = width - 1;
  let top = 0;
  let bottom = height - 1;
  for (let pass = 0; pass < 4; pass += 1) {
    const nextLeft = peelAxis(true, left, right, width, isEdgeStroke, isLight, maxStrokeX);
    const nextRight = peelAxis(false, left, right, width, isEdgeStroke, isLight, maxStrokeX);
    const nextTop = peelAxis(true, top, bottom, height, isEdgeRow, isLightRow, maxStrokeY);
    const nextBottom = peelAxis(false, top, bottom, height, isEdgeRow, isLightRow, maxStrokeY);
    if (nextLeft === left && nextRight === right && nextTop === top && nextBottom === bottom) break;
    left = nextLeft;
    right = nextRight;
    top = nextTop;
    bottom = nextBottom;
  }
  const cap = Math.max(6, Math.round(height * 0.04));
  while (bottom > top && bottom >= height - 1 - cap && isCenteredCap(bottom)) bottom -= 1;
  while (top < bottom && top <= cap && isCenteredCap(top)) top += 1;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < width * 0.5 || cropH < height * 0.5) return { left: 0, top: 0, width, height };
  return { left, top, width: cropW, height: cropH };
}

/**
 * A rounded sales-sheet stroke that survived innerSheetRect sits only in the
 * corners. Apartment walls run through the mid-edge — those are left alone.
 */
export function stripSheetFrameCorners(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  darkMax = 90,
): { left: number; top: number; width: number; height: number } {
  const corner = Math.max(8, Math.round(Math.min(width, height) * 0.14));
  const limitX = Math.max(1, Math.floor(width * 0.08));
  const limitY = Math.max(1, Math.floor(height * 0.08));
  const midY0 = Math.round(height * 0.35);
  const midY1 = Math.max(midY0 + 1, Math.round(height * 0.65));
  const midX0 = Math.round(width * 0.35);
  const midX1 = Math.max(midX0 + 1, Math.round(width * 0.65));
  const colCornerDark = (x: number): number => {
    let dark = 0;
    for (let y = 0; y < corner; y += 1) if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    for (let y = height - corner; y < height; y += 1) if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    return dark / (corner * 2);
  };
  const rowCornerDark = (y: number): number => {
    let dark = 0;
    for (let x = 0; x < corner; x += 1) if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    for (let x = width - corner; x < width; x += 1) if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    return dark / (corner * 2);
  };
  const colMidDark = (x: number): number => {
    let dark = 0;
    for (let y = midY0; y < midY1; y += 1) if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    return dark / (midY1 - midY0);
  };
  const rowMidDark = (y: number): number => {
    let dark = 0;
    for (let x = midX0; x < midX1; x += 1) if ((grey[y * width + x] ?? 255) < darkMax) dark += 1;
    return dark / (midX1 - midX0);
  };
  let left = 0;
  while (left < limitX && colCornerDark(left) > 0.06 && colMidDark(left) < 0.05) left += 1;
  let right = width - 1;
  while (right > width - 1 - limitX && colCornerDark(right) > 0.06 && colMidDark(right) < 0.05) right -= 1;
  let top = 0;
  while (top < limitY && rowCornerDark(top) > 0.06 && rowMidDark(top) < 0.05) top += 1;
  let bottom = height - 1;
  while (bottom > height - 1 - limitY && rowCornerDark(bottom) > 0.06 && rowMidDark(bottom) < 0.05) bottom -= 1;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < width * 0.5 || cropH < height * 0.5) {
    return { left: 0, top: 0, width, height };
  }
  return { left, top, width: cropW, height: cropH };
}

export async function cropSalesSheetForCompare(
  base64: string,
  mimeType: string,
  layout?: FloorplanLayout | null,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  try {
    let buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf, { failOn: "none", unlimited: true }).metadata();
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 16 || fullH < 16) return null;
    const floor = layout && isTrustworthyRoomGeometry(layout) ? unitCropFromLayout(layout) : null;
    if (floor) {
      const greySheet = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const divider = titleDividerCutX(fullW, fullH, greySheet.data);
      const floorRight = floor.x + floor.w;
      if (divider < fullW && divider / fullW >= floorRight - 0.03) {
        const right = Math.min(1, Math.max(floorRight, divider / fullW));
        const wide = { x: floor.x, y: floor.y, w: Math.max(0.2, right - floor.x), h: floor.h };
        if (wide.w < 0.97 || wide.h < 0.97 || wide.x > 0.02 || wide.y > 0.02) {
          const unit = await cropFloorplanRasterToUnit(base64, mimeType, wide);
          if (unit) return unit;
        }
      }
    }
    let cutTitle = false;
    const floorRightPx = floor ? Math.round((floor.x + floor.w) * fullW) : 0;
    const insideFloor = (cutX: number): boolean =>
      Boolean(floor && cutX < floorRightPx - Math.round(fullW * 0.03));
    const applyTitleCut = async (): Promise<void> => {
      const g = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const gwCut = g.info.width ?? 0;
      const ghCut = g.info.height ?? 0;
      const divider = titleDividerCutX(gwCut, ghCut, g.data);
      if (divider < gwCut && !insideFloor(divider)) {
        buf = await sharp(buf).extract({ left: 0, top: 0, width: divider, height: ghCut }).toBuffer();
        cutTitle = true;
        return;
      }
      const titleCut = titleBlockCutX(gwCut, ghCut, g.data);
      if (titleCut < gwCut && !insideFloor(titleCut)) {
        buf = await sharp(buf).extract({ left: 0, top: 0, width: titleCut, height: ghCut }).toBuffer();
        cutTitle = true;
        return;
      }
      const chrome = Math.min(
        stripRightSparseChromeX(gwCut, ghCut, g.data),
        stripRightFrameRulesX(gwCut, ghCut, g.data),
      );
      if (chrome < gwCut && !insideFloor(chrome)) {
        buf = await sharp(buf).extract({ left: 0, top: 0, width: chrome, height: ghCut }).toBuffer();
      }
    };
    await applyTitleCut();
    const grey0 = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const gw = grey0.info.width ?? 0;
    const gh = grey0.info.height ?? 0;
    let peeledFrame = false;
    if (!cutTitle) {
      const inner = innerSheetRect(gw, gh, grey0.data);
      peeledFrame = inner.width < gw * 0.95 && inner.height < gh * 0.95;
      if (inner.width < gw || inner.height < gh) {
        buf = await sharp(buf).extract(inner).toBuffer();
        if (peeledFrame) {
          const insetX = Math.max(4, Math.round(inner.width * 0.02));
          const insetY = Math.max(4, Math.round(inner.height * 0.02));
          const afterInner = await sharp(buf).metadata();
          const iw = afterInner.width ?? 0;
          const ih = afterInner.height ?? 0;
          if (iw > insetX * 2 + 8 && ih > insetY * 2 + 8) {
            buf = await sharp(buf)
              .extract({
                left: insetX,
                top: insetY,
                width: iw - insetX * 2,
                height: ih - insetY * 2,
              })
              .toBuffer();
          }
        }
      }
    }
    const afterFrame = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const dbl = innerDoubleFrameRect(afterFrame.info.width ?? 0, afterFrame.info.height ?? 0, afterFrame.data);
    let peeledDbl = false;
    if (
      dbl.width < (afterFrame.info.width ?? 0) * 0.98 ||
      dbl.height < (afterFrame.info.height ?? 0) * 0.98
    ) {
      buf = await sharp(buf).extract(dbl).toBuffer();
      peeledDbl = true;
    }
    const peelFrame = async (): Promise<void> => {
      const edgeGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const peeled = peelIsolatedEdgeFrame(
        edgeGrey.info.width ?? 0,
        edgeGrey.info.height ?? 0,
        edgeGrey.data,
      );
      if (
        peeled.width < (edgeGrey.info.width ?? 0) ||
        peeled.height < (edgeGrey.info.height ?? 0)
      ) {
        buf = await sharp(buf).extract(peeled).toBuffer();
      }
    };
    await peelFrame();
    const inkCrop = async (
      edgeIgnore: number | { left?: number; right?: number; top?: number; bottom?: number },
    ): Promise<void> => {
      const innerGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
      const box = detectInkCropBox(innerGrey.info.width ?? 0, innerGrey.info.height ?? 0, innerGrey.data, {
        edgeIgnore,
        padRatio: 0.03,
      });
      if (box) buf = await sharp(buf).extract(box).toBuffer();
    };
    await inkCrop(
      cutTitle || peeledDbl
        ? { left: 0.07, right: 0.015, top: 0.1, bottom: 0.1 }
        : 0.02,
    );
    const afterInk = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const leftover = Math.min(
      stripRightSparseChromeX(afterInk.info.width ?? 0, afterInk.info.height ?? 0, afterInk.data),
      stripRightFrameRulesX(afterInk.info.width ?? 0, afterInk.info.height ?? 0, afterInk.data),
    );
    if (leftover < (afterInk.info.width ?? 0)) {
      buf = await sharp(buf)
        .extract({ left: 0, top: 0, width: leftover, height: afterInk.info.height ?? 0 })
        .toBuffer();
    }
    const finalGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const stripped = stripSheetFrameCorners(
      finalGrey.info.width ?? 0,
      finalGrey.info.height ?? 0,
      finalGrey.data,
    );
    if (stripped.width < (finalGrey.info.width ?? 0) || stripped.height < (finalGrey.info.height ?? 0)) {
      buf = await sharp(buf).extract(stripped).toBuffer();
    }
    const edgeGrey = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
    const peeled = peelIsolatedEdgeFrame(
      edgeGrey.info.width ?? 0,
      edgeGrey.info.height ?? 0,
      edgeGrey.data,
    );
    if (
      peeled.width < (edgeGrey.info.width ?? 0) ||
      peeled.height < (edgeGrey.info.height ?? 0)
    ) {
      buf = await sharp(buf).extract(peeled).toBuffer();
    }
    const out = await sharp(buf).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

function sampleCornerBackdrop(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { r: number; g: number; b: number } | null {
  const patch = Math.max(4, Math.min(12, Math.round(Math.min(width, height) * 0.04)));
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  const samples: Array<{ r: number; g: number; b: number }> = [];
  for (const [sx, sy] of corners) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = sy; y < sy + patch; y += 1) {
      for (let x = sx; x < sx + patch; x += 1) {
        const i = (y * width + x) * channels;
        r += data[i] ?? 255;
        g += data[i + 1] ?? 255;
        b += data[i + 2] ?? 255;
        n += 1;
      }
    }
    if (n === 0) return null;
    samples.push({ r: r / n, g: g / n, b: b / n });
  }
  const avg = {
    r: samples.reduce((s, c) => s + c.r, 0) / samples.length,
    g: samples.reduce((s, c) => s + c.g, 0) / samples.length,
    b: samples.reduce((s, c) => s + c.b, 0) / samples.length,
  };
  const luma = 0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b;
  if (luma < 198) return null;
  for (const sample of samples) {
    const dist = Math.max(
      Math.abs(sample.r - avg.r),
      Math.abs(sample.g - avg.g),
      Math.abs(sample.b - avg.b),
    );
    if (dist > 18) return null;
  }
  return avg;
}

function isRasterBackdropPixel(
  r: number,
  g: number,
  b: number,
  backdrop: { r: number; g: number; b: number } | null,
): boolean {
  if (r >= 242 && g >= 242 && b >= 242) return true;
  if (!backdrop) return false;
  return (
    Math.max(Math.abs(r - backdrop.r), Math.abs(g - backdrop.g), Math.abs(b - backdrop.b)) <= 32
  );
}

/** Tight crop of studio/paper margins so a still fills its plate. */
export async function trimRasterWhitespace(
  base64: string,
  mimeType: string,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  try {
    const buf = Buffer.from(base64, "base64");
    const { data, info } = await sharp(buf, { failOn: "none", unlimited: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    const channels = info.channels ?? 3;
    if (width < 16 || height < 16) return null;
    const backdrop = sampleCornerBackdrop(data, width, height, channels);
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * channels;
        const r = data[i] ?? 255;
        const g = data[i + 1] ?? 255;
        const b = data[i + 2] ?? 255;
        if (!isRasterBackdropPixel(r, g, b, backdrop)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return { base64, mimeType };
    const padX = Math.max(2, Math.round((maxX - minX + 1) * 0.02));
    const padY = Math.max(2, Math.round((maxY - minY + 1) * 0.02));
    const left = Math.max(0, minX - padX);
    const top = Math.max(0, minY - padY);
    const cropW = Math.min(width - left, maxX - minX + 1 + padX * 2);
    const cropH = Math.min(height - top, maxY - minY + 1 + padY * 2);
    if (cropW < 16 || cropH < 16) return { base64, mimeType };
    if (cropW * cropH < width * height * 0.04) return { base64, mimeType };
    if (cropW >= width * 0.995 && cropH >= height * 0.995) return { base64, mimeType };
    const out = await sharp(buf)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

/**
 * Pad with white so two floorplan rasters share an aspect ratio and
 * therefore the same scale when they sit in equal frames.
 */
export async function padRasterToAspect(
  base64: string,
  mimeType: string,
  targetAspect: number,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType) || !(targetAspect > 0)) return null;
  try {
    const buf = Buffer.from(base64, "base64");
    const meta = await sharp(buf, { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 8 || height < 8) return null;
    const current = width / height;
    if (Math.abs(current - targetAspect) < 0.02) {
      return { base64, mimeType };
    }
    let padLeft = 0;
    let padRight = 0;
    let padTop = 0;
    let padBottom = 0;
    if (current < targetAspect) {
      const nextW = Math.max(width, Math.round(height * targetAspect));
      const extra = nextW - width;
      padLeft = Math.floor(extra / 2);
      padRight = extra - padLeft;
    } else {
      const nextH = Math.max(height, Math.round(width / targetAspect));
      const extra = nextH - height;
      padTop = Math.floor(extra / 2);
      padBottom = extra - padTop;
    }
    const out = await sharp(buf)
      .extend({
        top: padTop,
        bottom: padBottom,
        left: padLeft,
        right: padRight,
        background: { r: 255, g: 255, b: 255 },
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function pairRastersForCompare(
  still: { base64: string; mimeType: string },
  plan: { base64: string; mimeType: string },
): Promise<{ still: { base64: string; mimeType: string }; plan: { base64: string; mimeType: string } }> {
  try {
    const stillBuf = Buffer.from(still.base64, "base64");
    const planBuf = Buffer.from(plan.base64, "base64");
    const stillMeta = await sharp(stillBuf, { failOn: "none", unlimited: true }).metadata();
    const planMeta = await sharp(planBuf, { failOn: "none", unlimited: true }).metadata();
    const stillW = stillMeta.width ?? 0;
    const stillH = stillMeta.height ?? 0;
    const planW = planMeta.width ?? 0;
    const planH = planMeta.height ?? 0;
    if (stillW < 8 || stillH < 8 || planW < 8 || planH < 8) return { still, plan };
    const shared = Math.min(stillW / stillH, planW / planH);
    const nextStill = (await padRasterToAspect(still.base64, still.mimeType, shared)) ?? still;
    const nextPlan = (await padRasterToAspect(plan.base64, plan.mimeType, shared)) ?? plan;
    return { still: nextStill, plan: nextPlan };
  } catch {
    return { still, plan };
  }
}

/**
 * מיישר EXIF, מגביר ניגודיות בצל, ומגדיל צילום טלפון קטן — כדי ש-OCR יקרא תוכנית מודפסת.
 */
export async function prepareFloorplanSource(
  base64: string,
  mimeType: string,
  options?: { forceDrawing?: boolean },
): Promise<PreparedFloorplanSource> {
  const mime = sniffFloorplanMime(base64, mimeType);
  if (mime === "application/pdf" || !isRasterFloorplanMime(mime)) {
    return { base64, mimeType: mime, sourceKind: "pdf" };
  }

  try {
    const input = Buffer.from(base64, "base64");
    const rotated = await sharp(input, { failOn: "none", unlimited: true }).rotate().toBuffer();
    const preview = await sharp(rotated)
      .greyscale()
      .resize(800, 800, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ratio = paperPixelRatio(preview.info.width, preview.info.height, preview.data);
    const asDrawing = options?.forceDrawing === true || ratio >= 0.88;
    const previewBox = asDrawing ? null : detectPaperCropBox(preview.info.width, preview.info.height, preview.data);
    let working = rotated;
    if (previewBox) {
      const rotMeta = await sharp(rotated).metadata();
      const sx = (rotMeta.width ?? preview.info.width) / preview.info.width;
      const sy = (rotMeta.height ?? preview.info.height) / preview.info.height;
      const fullW = rotMeta.width ?? preview.info.width;
      const fullH = rotMeta.height ?? preview.info.height;
      const left = Math.max(0, Math.min(fullW - 1, Math.round(previewBox.left * sx)));
      const top = Math.max(0, Math.min(fullH - 1, Math.round(previewBox.top * sy)));
      const width = Math.max(8, Math.min(fullW - left, Math.round(previewBox.width * sx)));
      const height = Math.max(8, Math.min(fullH - top, Math.round(previewBox.height * sy)));
      working = await sharp(rotated).extract({ left, top, width, height }).toBuffer();
    }

    const meta = await sharp(working).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);

    let pipeline = sharp(working, { failOn: "none", unlimited: true });

    if (shortEdge > 0 && shortEdge < MIN_SHORT_EDGE) {
      const scale = TARGET_SHORT_EDGE / shortEdge;
      const nextW = Math.round(width * scale);
      const nextH = Math.round(height * scale);
      const longest = Math.max(nextW, nextH);
      const clamp = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
      pipeline = pipeline.resize(Math.round(nextW * clamp), Math.round(nextH * clamp), {
        kernel: "lanczos3",
        withoutEnlargement: false,
      });
    } else if (longEdge > MAX_LONG_EDGE) {
      pipeline = pipeline.resize(MAX_LONG_EDGE, MAX_LONG_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (!asDrawing) {
      pipeline = pipeline.normalize().modulate({ brightness: 1.06, saturation: 0.92 }).sharpen({ sigma: 0.8 });
    }

    const out = await pipeline.jpeg({ quality: asDrawing ? 92 : 90, mozjpeg: true }).toBuffer();

    return {
      base64: out.toString("base64"),
      mimeType: "image/jpeg",
      sourceKind: asDrawing ? "drawing" : "photo",
    };
  } catch {
    return { base64, mimeType: mime, sourceKind: options?.forceDrawing ? "drawing" : "photo" };
  }
}

export async function isPortraitFloorplanRaster(base64: string, mimeType: string): Promise<boolean> {
  if (!isRasterFloorplanMime(mimeType)) return false;
  try {
    const meta = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    return height > width * 1.12;
  } catch {
    return false;
  }
}

/** חיתוך בלוק כותרות / איחוד חללים לפני סינתזת תלת־ממד */
export async function cropFloorplanRasterToUnit(
  base64: string,
  mimeType: string,
  bbox: FloorplanBbox,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  if (bbox.w >= 0.97 && bbox.h >= 0.97 && bbox.x <= 0.02 && bbox.y <= 0.02) {
    return { base64, mimeType };
  }
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 16 || fullH < 16) return null;
    const left = Math.max(0, Math.min(fullW - 8, Math.round(bbox.x * fullW)));
    const top = Math.max(0, Math.min(fullH - 8, Math.round(bbox.y * fullH)));
    const width = Math.max(8, Math.min(fullW - left, Math.round(bbox.w * fullW)));
    const height = Math.max(8, Math.min(fullH - top, Math.round(bbox.h * fullH)));
    const out = await sharp(input)
      .extract({ left, top, width, height })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

/** קווי קיר שחור/לבן — מטשטש ריהוט דק, משאיר קירות עבים מהשרטוט */
export async function buildInkWallJpeg(base64: string): Promise<string | null> {
  try {
    const out = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true })
      .greyscale()
      .normalize()
      .threshold(150)
      .blur(1.2)
      .threshold(70)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

const MASSING_FILL: Record<string, string> = {
  living: "#eab308",
  kitchen: "#ea580c",
  bedroom: "#2563eb",
  mmd: "#4b5563",
  bathroom: "#06b6d4",
  balcony: "#4ade80",
  circulation: "#d1d5db",
  utility: "#7c3aed",
  other: "#64748b",
};

function massingRole(room: Pick<FloorplanRoom, "name" | "kind">): string {
  if (isStudyRoom(room as FloorplanRoom)) return "office";
  if (isStorageOrServiceRoom(room as FloorplanRoom)) return "storage";
  return room.kind ?? inferRoomKind(room.name);
}

function massingFill(room: Pick<FloorplanRoom, "name" | "kind">): string {
  const role = massingRole(room);
  if (role === "office") return "#059669";
  if (role === "storage") return "#7c3aed";
  if (role === "stair") return "#9ca3af";
  return MASSING_FILL[role] ?? "#94a3b8";
}

/**
 * שכבת צבע שקופה על השרטוט עצמו — רמז לסוג חלל, בלי מספרים ובלי להחליף קירות.
 */
export async function buildRoomMassingJpeg(
  base64: string,
  rooms: Array<Pick<FloorplanRoom, "name" | "kind" | "bbox">>,
): Promise<string | null> {
  const boxes = rooms
    .map((room) => ({ fill: massingFill(room), bbox: room.bbox }))
    .filter((row): row is { fill: string; bbox: FloorplanBbox } => row.bbox != null);
  if (boxes.length === 0) return null;
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 32 || height < 32) return null;
    const stroke = Math.max(2, Math.round(width / 500));
    const marks = boxes
      .map(({ fill, bbox }) => {
        const x = Math.round(bbox.x * width);
        const y = Math.round(bbox.y * height);
        const w = Math.max(10, Math.round(bbox.w * width));
        const h = Math.max(10, Math.round(bbox.h * height));
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="0.22" stroke="${fill}" stroke-opacity="0.55" stroke-width="${stroke}"/>`;
      })
      .join("");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`;
    const out = await sharp(input)
      .composite([{ input: Buffer.from(svg), blend: "over" }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/** מספרי חללים על התוכנית — בלי שמות בעברית, כדי שההדמיה לא תצייר תוויות */
export async function buildRoomIndexOverlayJpeg(
  base64: string,
  rooms: Array<{ bbox?: FloorplanBbox }>,
): Promise<string | null> {
  const boxes = rooms
    .map((room, i) => ({ n: i + 1, bbox: room.bbox }))
    .filter((row): row is { n: number; bbox: FloorplanBbox } => row.bbox != null);
  if (boxes.length === 0) return null;
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 32 || height < 32) return null;
    const marks = boxes
      .map(({ n, bbox }) => {
        const x = Math.round(bbox.x * width);
        const y = Math.round(bbox.y * height);
        const w = Math.max(12, Math.round(bbox.w * width));
        const h = Math.max(12, Math.round(bbox.h * height));
        const cx = x + Math.min(18, Math.round(w / 2));
        const cy = y + Math.min(18, Math.round(h / 2));
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(220,38,38,0.10)" stroke="#dc2626" stroke-width="${Math.max(2, Math.round(width / 700))}"/>
<circle cx="${cx}" cy="${cy}" r="13" fill="#dc2626"/>
<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-family="Arial,sans-serif" font-weight="700" fill="#fff">${n}</text>`;
      })
      .join("");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`;
    const out = await sharp(input)
      .composite([{ input: Buffer.from(svg), blend: "over" }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/** שרטוט קווים (קירות שחור/לבן) מול תמונת ריהוט / תלת־ממד */
export async function isMostlyLineDrawing(base64: string): Promise<boolean> {
  try {
    const { data } = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true })
      .greyscale()
      .resize(96, 96, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let extreme = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] ?? 128;
      if (v < 45 || v > 210) extreme++;
    }
    return data.length > 0 && extreme / data.length >= 0.58;
  } catch {
    return false;
  }
}

/**
 * A filled outline of the flat, for a sheet with no vectors to trace.
 *
 * On a scan the audit's standing complaint is the footprint: the render comes
 * back as a plain rectangle where the drawing steps in and out. Pulling the
 * individual walls out of a raster failed twice, but the outline is a much
 * easier target — dilate the ink until the drawing closes into one blob, keep
 * the largest, and fill it. The result is not a wall diagram and does not try
 * to be; it is the shape the flat has to end up.
 */
export async function buildFootprintSilhouetteJpeg(base64: string): Promise<string | null> {
  try {
    const src = Buffer.from(base64, "base64");
    const meta = await sharp(src, { failOn: "none", unlimited: true }).metadata();
    if (!meta.width || !meta.height) return null;
    // The silhouette needs no detail, and the dilation below is O(r²) per pixel.
    const width = Math.max(160, Math.min(460, Math.round(meta.width * 0.35)));
    const { data, info } = await sharp(src, { failOn: "none", unlimited: true })
      .greyscale()
      .resize({ width })
      .blur(2)
      .threshold(190)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const W = info.width;
    const H = info.height;
    const R = Math.max(6, Math.round(W * 0.029));
    const grown = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((data[y * W + x] ?? 255) >= 128) continue;
        for (let dy = -R; dy <= R; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < W) grown[ny * W + nx] = 1;
          }
        }
      }
    }

    const seen = new Uint8Array(W * H);
    let best: { size: number; cells: number[] } | null = null;
    for (let start = 0; start < W * H; start++) {
      if (!grown[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      const cells: number[] = [];
      while (stack.length > 0) {
        const i = stack.pop()!;
        cells.push(i);
        const x = i % W;
        const y = (i - x) / W;
        if (x > 0 && grown[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < W - 1 && grown[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (y > 0 && grown[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W); }
        if (y < H - 1 && grown[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W); }
      }
      if (!best || cells.length > best.size) best = { size: cells.length, cells };
    }
    // A blob that is nearly the whole page has merged the title block and the
    // dimension chains into the flat, and says nothing useful.
    if (!best || best.size < W * H * 0.05 || best.size > W * H * 0.8) return null;

    const blob = new Uint8Array(W * H);
    for (const i of best.cells) blob[i] = 1;
    const outside = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (outside[i] || blob[i]) continue;
      outside[i] = 1;
      const x = i % W;
      const y = (i - x) / W;
      if (x > 0) stack.push(i - 1);
      if (x < W - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - W);
      if (y < H - 1) stack.push(i + W);
    }

    // The fill is only a footprint if the outline actually closed. Where a
    // window or a terrace opening leaves a gap the dilation cannot bridge, the
    // outside flood walks straight into the flat and what survives is the
    // dilated ink skeleton — a Rorschach blot that tells the image model less
    // than nothing. Measure the fill against its own bounding box and refuse it
    // when it is plainly not a solid shape.
    let filled = 0;
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;
    for (let i = 0; i < W * H; i++) {
      if (outside[i]) continue;
      filled += 1;
      const x = i % W;
      const y = (i - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const boxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    if (filled / boxArea < 0.45) return null;

    const rgb = new Uint8Array(W * H * 3).fill(255);
    for (let i = 0; i < W * H; i++) {
      if (outside[i]) continue;
      rgb[i * 3] = 40;
      rgb[i * 3 + 1] = 44;
      rgb[i * 3 + 2] = 48;
    }
    const out = await sharp(Buffer.from(rgb), { raw: { width: W, height: H, channels: 3 } })
      .resize({ width: 1000 })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}
