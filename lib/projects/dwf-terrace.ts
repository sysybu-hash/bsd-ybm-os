import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { textLines } from "@/lib/projects/floor-split";

/**
 * A permit floor's terraces, each with the flat it belongs to.
 *
 * A terrace is drawn as its tiling — single lines on a square module — closed
 * by a parapet drawn as two or three lines a few centimetres apart, and a
 * partition between two flats' terraces drawn the same way. So a terrace is
 * the enclosure round its label ("מרפסת …"), flooded through the tiling and
 * stopped only by walls and by doubled lines: lines of one pen, 80 cm or
 * longer, running alongside each other for most of their length — a dashed
 * roof edge beside a tile line is neither.
 *
 * Labels in one enclosure make one terrace (a covered and an uncovered part
 * often share one). An enclosure that runs more than 5 m from the building,
 * or into the world round it, is a garden or the street and is dropped rather
 * than guessed at. A label with "היטל", or with a level beside it ("+2.93"),
 * is another floor's terrace seen from above and is not read.
 *
 * The flat is the one whose rooms the terrace's edge looks into, across a
 * window, a door or a planter; where the sheet prints the area it is kept.
 */
export type DwfTerrace = {
  unit: number;
  /** The terrace's floor, a pixel mask on the floor's grid. */
  pixels: Int32Array;
  areaM2: number;
  printedM2: number | null;
  covered: boolean;
};

export function readDwfTerraces(floor: DwfFloor, sheet: DwfGeometry): DwfTerrace[] {
  const { cols, rows, cm, unitsPerMetre: upm } = floor;
  const n = cols * rows;
  const k = 100 / upm / cm;
  const barrier = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (floor.wall[i]) barrier[i] = 1;
  // Doubled lines: a parapet, a partition between terraces — at any angle: a
  // building with a slanted face has its parapet slanted with it, and read
  // only along x and y those terraces were open and dropped.
  const lines = sheet.segments
    .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 0.8 * upm)
    .map((s) => {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      let ux = (s.x2 - s.x1) / len;
      let uy = (s.y2 - s.y1) / len;
      // One direction per line, so parallels agree on which way is along.
      if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
        ux = -ux;
        uy = -uy;
      }
      const along = (x: number, y: number) => x * ux + y * uy;
      const a = Math.min(along(s.x1, s.y1), along(s.x2, s.y2));
      const b = Math.max(along(s.x1, s.y1), along(s.x2, s.y2));
      // Offset across the line, from the origin.
      const at = -s.x1 * uy + s.y1 * ux;
      return { s, ux, uy, a, b, at, angle: Math.atan2(uy, ux) };
    })
    .sort((p, q) => p.angle - q.angle);
  const draw = (x1: number, y1: number, x2: number, y2: number) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * k * 2));
    for (let t = 0; t <= steps; t++) {
      const x = Math.round((x1 + ((x2 - x1) * t) / steps) * k);
      const y = Math.round((y1 + ((y2 - y1) * t) / steps) * k);
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && py >= 0 && px < cols && py < rows) barrier[py * cols + px] = 1;
      }
    }
  };
  const PARALLEL = 0.012; // radians, under a degree
  for (let i = 0; i < lines.length; i++) {
    const p = lines[i]!;
    for (let j = i + 1; j < lines.length && lines[j]!.angle - p.angle <= PARALLEL; j++) {
      const q = lines[j]!;
      const gap = Math.abs(q.at - p.at);
      if (gap < 0.01 * upm || gap > 0.09 * upm) continue;
      // A dashed roof edge beside a tile line is not a parapet: one pen, both lines.
      if (q.s.stroke !== p.s.stroke) continue;
      const ov = Math.min(p.b, q.b) - Math.max(p.a, q.a);
      if (ov < 0.6 * Math.max(p.b - p.a, q.b - q.a)) continue;
      draw(p.s.x1, p.s.y1, p.s.x2, p.s.y2);
      draw(q.s.x1, q.s.y1, q.s.x2, q.s.y2);
    }
  }

  // A parapet's lines often stop a hand short of the next one's — a terrace's
  // front of its neighbour's side — and the terrace runs out through the gap.
  // Closing the lines by 5 px seals gaps to 20 cm; a door is 70 or more.
  closeGapsInPlace(barrier, cols, rows, 5);

  const text = textLines(sheet.texts);
  // "+2.93" beside the label marks the floor below's terrace seen from above.
  const labels = text.filter((l) => /מרפסת/.test(l.text) && !/היטל/.test(l.text) && !/\+\s*\d+[.,]\d\d/.test(l.text));
  const areaNear = (x: number, y: number, h: number) => {
    const near = text
      .filter((l) => /בשטח|מ"?ר/.test(l.text) && !/\+\s*\d/.test(l.text) && Math.abs(l.y - y) < h * 3.5 && Math.abs(l.x - x) < h * 12)
      .sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y));
    for (const l of near) {
      // Hebrew SHX sets digits in reverse where the line is read right to left.
      const m = /(\d+[.,]\d+)/.exec(l.text);
      if (!m) continue;
      const raw = m[1]!.replace(",", ".");
      const v = Number(raw);
      const rev = Number(raw.split("").reverse().join(""));
      return { v, rev };
    }
    return null;
  };
  const known = new Set(floor.rooms.map((r) => r.id));
  const roomToUnit = new Map<number, number>();
  for (const a of floor.apartments) for (const id of a.rooms) roomToUnit.set(id, a.unit);

  // A terrace stands against the building: no further than 5 m from a wall,
  // which also bounds a terrace whose open side the sheet leaves undrawn.
  const near = new Uint8Array(n);
  {
    const far = Math.round(500 / cm);
    let front: number[] = [];
    for (let i = 0; i < n; i++) if (floor.wall[i] === 1 || floor.wall[i] === 2) { near[i] = 1; front.push(i); }
    for (let d = 1; d <= far && front.length; d++) {
      const next: number[] = [];
      for (const c of front) {
        const x = c % cols;
        for (const nb of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, c - cols, c + cols]) {
          if (nb < 0 || nb >= n || near[nb]) continue;
          near[nb] = 1;
          next.push(nb);
        }
      }
      front = next;
    }
  }

  // Each label's enclosure; labels in one enclosure make one terrace. An
  // enclosure that reaches the edge of the band is open — a garden or the
  // street, not a terrace — and is dropped.
  const seen = new Int32Array(n);
  const cells: Array<{ labels: Array<(typeof labels)[number]>; pix: number[]; open: boolean }> = [];
  for (const l of labels) {
    const sx = Math.round(l.x * k);
    const sy = Math.round((l.y + l.height) * k);
    if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue;
    let start = -1;
    // The label may sit on a tile line: start from the nearest free pixel.
    for (let r = 0; r < 25 && start < 0; r++) {
      for (let dy = -r; dy <= r && start < 0; dy++) for (let dx = -r; dx <= r && start < 0; dx++) {
        const i = (sy + dy) * cols + sx + dx;
        if (i >= 0 && i < n && !barrier[i] && near[i] && floor.room[i] === floor.outside) start = i;
      }
    }
    if (start < 0) continue;
    if (seen[start]) {
      cells[seen[start]! - 1]!.labels.push(l);
      continue;
    }
    const mark = cells.length + 1;
    const cell = { labels: [l], pix: [] as number[], open: false };
    cells.push(cell);
    const stack = [start];
    seen[start] = mark;
    while (stack.length) {
      const c = stack.pop()!;
      cell.pix.push(c);
      const x = c % cols;
      for (const nb of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, c - cols, c + cols]) {
        if (nb < 0 || nb >= n) {
          cell.open = true;
          continue;
        }
        if (seen[nb] || barrier[nb]) continue;
        if (!near[nb] || floor.room[nb] !== floor.outside) {
          cell.open = true;
          continue;
        }
        seen[nb] = mark;
        stack.push(nb);
      }
    }
  }

  const out: DwfTerrace[] = [];
  const limit = Math.round((80 * 10_000) / (cm * cm));
  for (const { labels: ls, pix, open } of cells) {
    if (open || pix.length > limit) continue;
    const areaM2 = (pix.length * cm * cm) / 10_000;
    if (areaM2 < 1.5) continue;
    // The flat: the one whose rooms the terrace's edge looks into most.
    const votes = new Map<number, number>();
    // Across a window, a door, a planter between the terrace and the wall.
    const reach = Math.round(200 / cm);
    for (const c of pix) {
      const x = c % cols;
      const y = (c - x) / cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const first = (y + dy) * cols + x + dx;
        if (first < 0 || first >= n || !barrier[first]) continue; // only from the terrace's edge
        // A wall stops the walk; a window frame drawn a pixel thick does not.
        let solid = 0;
        for (let t = 1; t <= reach; t++) {
          const qx = x + dx * t;
          const qy = y + dy * t;
          if (qx < 0 || qy < 0 || qx >= cols || qy >= rows) break;
          const q = qy * cols + qx;
          const w = floor.wall[q]!;
          solid = w === 1 ? solid + 1 : 0;
          if (solid * cm >= 10) break;
          if (w || barrier[q]) continue;
          const id = floor.room[q]!;
          // Outside, and slivers between a window's lines, are walked through.
          if (id === floor.outside || !known.has(id)) continue;
          const u = roomToUnit.get(id);
          if (u != null) votes.set(u, (votes.get(u) ?? 0) + 1);
          break;
        }
      }
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (!best) continue;
    // The printed areas of the labels inside, each once: a covered and an
    // uncovered part may share one enclosure.
    const printedSet = new Set<number>();
    for (const q of ls) {
      const p = areaNear(q.x, q.y, q.height);
      if (p) printedSet.add(Math.abs(p.v - areaM2) <= Math.abs(p.rev - areaM2) ? p.v : p.rev);
    }
    const printedM2 = printedSet.size ? Math.round([...printedSet].reduce((a, b) => a + b, 0) * 100) / 100 : null;
    const pixels = Int32Array.from(pix);
    const covered = ls.some((q) => /מקורה/.test(q.text) && !/לא/.test(q.text));
    out.push({ unit: best[0], pixels, areaM2: Math.round(areaM2 * 100) / 100, printedM2, covered });
  }
  return out;
}

/** Dilate then erode a mask in place by `r` px (square), sealing gaps up to 2r. */
function closeGapsInPlace(mask: Uint8Array, cols: number, rows: number, r: number): void {
  const pass = (src: Uint8Array, grow: boolean, horizontal: boolean): Uint8Array => {
    const out = new Uint8Array(src.length);
    const lines = horizontal ? rows : cols;
    const len = horizontal ? cols : rows;
    const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
    for (let line = 0; line < lines; line++) {
      // Running count of set pixels in the window [i - r, i + r].
      let count = 0;
      for (let i = 0; i < Math.min(len, r); i++) count += src[idx(line, i)]!;
      for (let i = 0; i < len; i++) {
        if (i + r < len) count += src[idx(line, i + r)]!;
        if (i - r - 1 >= 0) count -= src[idx(line, i - r - 1)]!;
        const window = Math.min(len - 1, i + r) - Math.max(0, i - r) + 1;
        out[idx(line, i)] = grow ? (count > 0 ? 1 : 0) : count === window ? 1 : 0;
      }
    }
    return out;
  };
  const grown = pass(pass(mask, true, true), true, false);
  const shut = pass(pass(grown, false, true), false, false);
  for (let i = 0; i < mask.length; i++) if (shut[i]) mask[i] = 1;
}
