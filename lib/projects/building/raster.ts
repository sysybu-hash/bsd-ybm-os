/**
 * A binary raster and the few operations the plan readers run on it.
 *
 * Kept apart from any one reader so a building's walls, a floor's rooms and a
 * site's terraces are all cut with the same tools.
 */
export type Mask = { cols: number; rows: number; data: Uint8Array };

export function emptyMask(cols: number, rows: number): Mask {
  return { cols, rows, data: new Uint8Array(cols * rows) };
}

/** A line of set pixels from (x1,y1) to (x2,y2), in pixel coordinates. */
export function drawLine(mask: Mask, x1: number, y1: number, x2: number, y2: number, width = 1): void {
  const { cols, rows, data } = mask;
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
  const half = (width - 1) >> 1;
  for (let t = 0; t <= steps; t++) {
    const x = Math.round(x1 + ((x2 - x1) * t) / steps);
    const y = Math.round(y1 + ((y2 - y1) * t) / steps);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && py >= 0 && px < cols && py < rows) data[py * cols + px] = 1;
      }
    }
  }
}

/** A filled polygon, even-odd, scanline by scanline. */
export function fillPolygon(mask: Mask, ring: Array<[number, number]>): void {
  const { cols, rows, data } = mask;
  if (ring.length < 3) return;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of ring) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(rows - 1, Math.ceil(y1)); y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i]!;
      const [bx, by] = ring[(i + 1) % ring.length]!;
      if (ay === by || cy < Math.min(ay, by) || cy >= Math.max(ay, by)) continue;
      xs.push(ax + ((cy - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.max(0, Math.round(xs[i]!)); x <= Math.min(cols - 1, Math.round(xs[i + 1]!)); x++) {
        data[y * cols + x] = 1;
      }
    }
  }
}

/** Square dilation by r pixels, separable. */
export function dilate(mask: Mask, r: number): Mask {
  return sweep(sweep(mask, r, true, true), r, false, true);
}

/** Square erosion by r pixels, separable. */
export function erode(mask: Mask, r: number): Mask {
  return sweep(sweep(mask, r, true, false), r, false, false);
}

function sweep(mask: Mask, r: number, horizontal: boolean, grow: boolean): Mask {
  const { cols, rows, data } = mask;
  const out = new Uint8Array(data.length);
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
  for (let line = 0; line < lines; line++) {
    // Distance to the nearest set (grow) or clear (shrink) pixel along the line.
    let last = -Infinity;
    const near = new Float64Array(len).fill(Infinity);
    for (let i = 0; i < len; i++) {
      const on = data[idx(line, i)] === (grow ? 1 : 0);
      if (on) last = i;
      near[i] = i - last;
    }
    last = Infinity;
    for (let i = len - 1; i >= 0; i--) {
      const on = data[idx(line, i)] === (grow ? 1 : 0);
      if (on) last = i;
      near[i] = Math.min(near[i]!, last - i);
    }
    for (let i = 0; i < len; i++) {
      const hit = near[i]! <= r;
      out[idx(line, i)] = grow ? (hit ? 1 : 0) : hit ? 0 : 1;
    }
  }
  return { cols, rows, data: out };
}

/** Connected components (4-connected) of set or clear pixels. */
export function label(mask: Mask, of: 0 | 1 = 1): { ids: Int32Array; sizes: number[]; touchesEdge: boolean[] } {
  const { cols, rows, data } = mask;
  const ids = new Int32Array(data.length);
  const sizes = [0];
  const touchesEdge = [false];
  const stack: number[] = [];
  let next = 0;
  for (let k = 0; k < data.length; k++) {
    if (data[k] !== of || ids[k]) continue;
    next++;
    let size = 0;
    let edge = false;
    ids[k] = next;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % cols;
      const y = (c - x) / cols;
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) edge = true;
      if (x > 0 && data[c - 1] === of && !ids[c - 1]) (ids[c - 1] = next), stack.push(c - 1);
      if (x < cols - 1 && data[c + 1] === of && !ids[c + 1]) (ids[c + 1] = next), stack.push(c + 1);
      if (y > 0 && data[c - cols] === of && !ids[c - cols]) (ids[c - cols] = next), stack.push(c - cols);
      if (y < rows - 1 && data[c + cols] === of && !ids[c + cols]) (ids[c + cols] = next), stack.push(c + cols);
    }
    sizes.push(size);
    touchesEdge.push(edge);
  }
  return { ids, sizes, touchesEdge };
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Each connected run of set pixels as its bounding box. */
export function boxes(mask: Mask): Box[] {
  const { ids, sizes } = label(mask, 1);
  const out: Box[] = sizes.map(() => ({ x0: Infinity, y0: Infinity, x1: -1, y1: -1 }));
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k]!;
    if (!id) continue;
    const x = k % mask.cols;
    const y = (k - x) / mask.cols;
    const b = out[id]!;
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
  }
  return out.slice(1);
}

/** For each set pixel, the length of the run it stands in along rows or down columns. */
export function runLengths(mask: Mask, horizontal: boolean): Uint16Array {
  const { cols, rows, data } = mask;
  const out = new Uint16Array(data.length);
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let i = 0; i <= len; i++) {
      const on = i < len && data[idx(line, i)];
      if (on && start < 0) start = i;
      else if (!on && start >= 0) {
        for (let j = start; j < i; j++) out[idx(line, j)] = Math.min(65535, i - start);
        start = -1;
      }
    }
  }
  return out;
}

/**
 * The outer outline of a mask's largest part, in pixel corners.
 *
 * Every set pixel's side that faces a clear one is an edge, directed so the
 * part is on its left; the edges chain into loops, and the loop enclosing the
 * most is the part's outline. Where two corners of the part touch at one
 * point the chain turns left, keeping to one side. Runs of edges along a line
 * become one side, and the staircase a slanted wall leaves is straightened to
 * within `tolerancePx`.
 */
export function traceOutline(mask: Mask, tolerancePx = 3): Array<[number, number]> {
  const { cols, rows, data } = mask;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows && data[y * cols + x] === 1;
  const key = (x: number, y: number) => y * (cols + 1) + x;
  // Outgoing edges from each corner: [to x, to y].
  const out = new Map<number, Array<[number, number, number, number]>>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = out.get(k);
    if (list) list.push([x0, y0, x1, y1]);
    else out.set(k, [[x0, y0, x1, y1]]);
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!data[y * cols + x]) continue;
      if (!at(x, y - 1)) add(x + 1, y, x, y);
      if (!at(x - 1, y)) add(x, y, x, y + 1);
      if (!at(x, y + 1)) add(x, y + 1, x + 1, y + 1);
      if (!at(x + 1, y)) add(x + 1, y + 1, x + 1, y);
    }
  }
  let best: Array<[number, number]> = [];
  let bestArea = 0;
  for (const [, list] of out) {
    while (list.length) {
      const first = list.pop()!;
      const loop: Array<[number, number]> = [[first[0], first[1]]];
      let [, , cx, cy] = first;
      let dx = first[2] - first[0];
      let dy = first[3] - first[1];
      for (let guard = 0; guard < 4 * data.length; guard++) {
        if (cx === first[0] && cy === first[1]) break;
        loop.push([cx, cy]);
        const nexts = out.get(key(cx, cy));
        if (!nexts || nexts.length === 0) break;
        // Turn left where there is a choice: (dx, dy) turned left is (dy, -dx) with y down.
        let pick = 0;
        if (nexts.length > 1) {
          const left = nexts.findIndex(([ax, ay, bx, by]) => bx - ax === dy && by - ay === -dx);
          pick = left >= 0 ? left : 0;
        }
        const [ax, ay, bx, by] = nexts.splice(pick, 1)[0]!;
        dx = bx - ax;
        dy = by - ay;
        cx = bx;
        cy = by;
      }
      let area = 0;
      for (let i = 0; i < loop.length; i++) {
        const [x0, y0] = loop[i]!;
        const [x1, y1] = loop[(i + 1) % loop.length]!;
        area += x0 * y1 - x1 * y0;
      }
      if (Math.abs(area) > bestArea) {
        bestArea = Math.abs(area);
        best = loop;
      }
    }
  }
  return simplifyRing(best, tolerancePx);
}

/** A closed ring with its collinear corners dropped and staircases straightened (Douglas–Peucker). */
function simplifyRing(ring: Array<[number, number]>, tolerance: number): Array<[number, number]> {
  if (ring.length < 4) return ring;
  // Split the ring at its two farthest-apart corners and simplify each half.
  let far = 0;
  let d0 = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i]![0] - ring[0]![0]) ** 2 + (ring[i]![1] - ring[0]![1]) ** 2;
    if (d > d0) {
      d0 = d;
      far = i;
    }
  }
  const halfA = simplifyChain(ring.slice(0, far + 1), tolerance);
  const halfB = simplifyChain([...ring.slice(far), ring[0]!], tolerance);
  return [...halfA.slice(0, -1), ...halfB.slice(0, -1)];
}

function simplifyChain(pts: Array<[number, number]>, tolerance: number): Array<[number, number]> {
  if (pts.length <= 2) return pts;
  const [ax, ay] = pts[0]!;
  const [bx, by] = pts[pts.length - 1]!;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]!;
    const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [pts[0]!, pts[pts.length - 1]!];
  const left = simplifyChain(pts.slice(0, at + 1), tolerance);
  const right = simplifyChain(pts.slice(at), tolerance);
  return [...left.slice(0, -1), ...right];
}
