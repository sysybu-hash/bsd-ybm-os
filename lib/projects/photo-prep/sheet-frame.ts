import {
  bandDarkRatio,
  bandIsFrameChrome,
  columnLongestDarkRun,
  columnLongestDarkSpan,
  detectInkCropBox,
} from "@/lib/projects/photo-prep/ink-crop";
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

