import {
  bandIsFrameChrome,
  detectInkCropBox,
} from "@/lib/projects/photo-prep/ink-box";
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
