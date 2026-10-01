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
};

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1] ?? 0;
};

export function elevationFrame(g: DwfGeometry, upm = DWF_FLOOR_UNITS_PER_METRE): ElevationFrame | null {
  const marks = levelMarks(g.texts).filter((m) => Math.abs(m.value) < 200);
  if (marks.length < 3) return null;
  const zeroY = median(marks.map((m) => m.y + upm * m.value));
  const yOf = (level: number) => zeroY - upm * level;
  const top = Math.max(...marks.map((m) => m.value));

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
  const left = best[0] * bin;
  const right = (best[1] + 1) * bin;
  const width = (right - left) * 1.25;
  const centre = (left + right) / 2;
  const bottomM = -1;
  const topM = top + 1.5;
  return {
    box: { x: centre - width / 2, y: yOf(topM), width, height: (topM - bottomM) * upm },
    widthM: width / upm,
    bottomM,
    topM,
  };
}
