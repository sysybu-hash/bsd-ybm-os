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

export function bandDarkInRect(
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
export function bandIsFrameChrome(
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

export function columnLongestDarkRun(
  grey: Uint8Array | Buffer,
  width: number,
  height: number,
  x: number,
  darkMax: number,
): number {
  return columnLongestDarkSpan(grey, width, height, x, darkMax).length;
}

export function columnLongestDarkSpan(
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

