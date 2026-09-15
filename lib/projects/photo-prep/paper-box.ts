import {
  columnLongestDarkRun,
} from "@/lib/projects/photo-prep/ink-box";

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
export function bandDarkRatio(
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

export function tallClusters(
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

export function pairedClusterEdge(
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
