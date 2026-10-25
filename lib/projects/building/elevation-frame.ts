import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { levelMarks } from "@/lib/projects/floor-split";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

/**
 * The frame an elevation sheet draws its building in, so the render can be
 * drawn in the same one.
 *
 * Height comes from the level marks: at 1:100 a mark of +v stands upm·v above
 * the ±0.00 line, so every mark votes for where that line is on the page and
 * the median is taken. Width comes from the facade itself: the horizontal
 * strokes a facade is drawn in — courses, sills, floor lines — lie thick
 * across the building and thin past it, so the building is the longest run of
 * dense cover, and the grid bubbles and level marks standing off to its sides
 * do not stretch it. The frame runs from a metre below ±0.00 — the car park
 * under it is drawn on the sheet and not stood up — to a metre and a half
 * over the highest mark, and an eighth wider than the building either side.
 */
export type ElevationFrame = {
  /** The sheet's box to show, in its page units. */
  box: { x: number; y: number; width: number; height: number };
  widthM: number;
  bottomM: number;
  topM: number;
  /** Where on the page the ±0.00 line runs, and the middle of the building across it. */
  zeroY: number;
  centreX: number;
  /** The building's own edges across the page, before the frame's margin. */
  left: number;
  right: number;
};

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
};

/**
 * A private house's elevation is hatched, not coursed: its width is its
 * outline instead — the outermost vertical lines standing from ±0.00 to its
 * roof, broken lines at one place joined. The sheet's border reaches both
 * past the highest mark and below the land; a fence or a door stops short of
 * the roof. Its frame reaches 2.5 m under ±0.00: the land and
 * the bays fall to the street below it.
 */
function outlineSpan(g: DwfGeometry, zeroY: number, top: number, upm: number): [number, number] | null {
  const levelOf = (y: number) => (zeroY - y) / upm;
  const verticals = g.segments
    .filter((s) => Math.abs(s.x2 - s.x1) < 0.01 * upm && Math.abs(s.y2 - s.y1) > 0.3 * upm)
    .map((s) => ({ x: (s.x1 + s.x2) / 2, lo: levelOf(Math.max(s.y1, s.y2)), hi: levelOf(Math.min(s.y1, s.y2)) }))
    .sort((a, b) => a.x - b.x || a.lo - b.lo);
  const runs: Array<{ x: number; lo: number; hi: number }> = [];
  for (const v of verticals) {
    const run = runs.find((r) => Math.abs(r.x - v.x) < 0.02 * upm && v.lo <= r.hi + 0.05 && v.hi >= r.lo - 0.05);
    if (run) [run.lo, run.hi] = [Math.min(run.lo, v.lo), Math.max(run.hi, v.hi)];
    else runs.push({ ...v });
  }
  const edges = runs.filter((r) => r.lo <= 0.5 && r.hi >= Math.max(3, 0.6 * top) && !(r.lo < -1.5 && r.hi > top + 0.3)).map((r) => r.x);
  if (edges.length < 2) return null;
  const [left, right] = [Math.min(...edges), Math.max(...edges)];
  return right - left >= 3 * upm ? [left, right] : null;
}

export function elevationFrame(g: DwfGeometry, upm = DWF_FLOOR_UNITS_PER_METRE, options?: { house?: boolean }): ElevationFrame | null {
  const marks = levelMarks(g.texts).filter((m) => Math.abs(m.value) < 200);
  if (marks.length < 3) return null;
  const zeroY = median(marks.map((m) => m.y + upm * m.value));
  const yOf = (level: number) => zeroY - upm * level;
  const top = Math.max(...marks.map((m) => m.value));
  if (options?.house) {
    const outline = outlineSpan(g, zeroY, top, upm);
    return outline ? frameAround(outline[0], outline[1], zeroY, top, -2.5, upm) : null;
  }

  // For each 10 cm across the page, how many of the 25 cm bands of height
  // above the ground a horizontal stroke crosses it in. Counting heights, not
  // strokes: a stone bond hatched in short courses is no more the building
  // than plain render drawn in one line a floor.
  const bin = 0.1 * upm;
  const band = 0.25 * upm;
  const cols = Math.ceil(g.pageWidth / bin) + 1;
  const rows = Math.ceil((yOf(0.3) - yOf(top + 0.5)) / band) + 1;
  const hit = new Uint8Array(cols * rows);
  for (const s of g.segments) {
    if (Math.abs(s.y2 - s.y1) > 0.01 * upm) continue;
    const y = (s.y1 + s.y2) / 2;
    if (y > yOf(0.3) || y < yOf(top + 0.5)) continue;
    const x0 = Math.min(s.x1, s.x2);
    const x1 = Math.max(s.x1, s.x2);
    if (x1 - x0 < 0.3 * upm) continue;
    const r = Math.floor((y - yOf(top + 0.5)) / band);
    for (let c = Math.max(0, Math.floor(x0 / bin)); c <= Math.min(cols - 1, Math.floor(x1 / bin)); c++) hit[r * cols + c] = 1;
  }
  const cover = new Float64Array(cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cover[c]! += hit[r * cols + c]!;
  const peak = Math.max(...cover);
  if (peak === 0) return null;
  const dense = (c: number) => cover[c]! >= peak * 0.25;
  // The longest run of dense cover, gaps under a metre bridged.
  let best: [number, number] = [0, -1];
  for (let c = 0; c < cols; c++) {
    if (!dense(c)) continue;
    let end = c;
    let gap = 0;
    for (let d = c + 1; d < cols && gap <= 10; d++) {
      if (dense(d)) {
        end = d;
        gap = 0;
      } else gap++;
    }
    if (end - c > best[1] - best[0]) best = [c, end];
    c = end;
  }
  return frameAround(best[0] * bin, (best[1] + 1) * bin, zeroY, top, -1, upm);
}

function frameAround(left: number, right: number, zeroY: number, top: number, bottomM: number, upm: number): ElevationFrame {
  const yOf = (level: number) => zeroY - upm * level;
  const width = (right - left) * 1.25;
  const centre = (left + right) / 2;
  const topM = top + 1.5;
  return {
    box: { x: centre - width / 2, y: yOf(topM), width, height: (topM - bottomM) * upm },
    widthM: width / upm,
    bottomM,
    topM,
    zeroY,
    centreX: centre,
    left,
    right,
  };
}
