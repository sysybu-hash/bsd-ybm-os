import sharp from "sharp";

/**
 * A private house's storey painted a part at a time. Painted whole — two
 * homes, a yard and dozens of pieces in one frame — the image model moved
 * stairs, laid kitchens over bathrooms and swapped a bath for a sofa: one
 * painting in fifteen of model A's held (Gottlieb, 12/10/2026). A pair of
 * semi-detached homes is drawn mirrored about its party wall, so one home's
 * half is painted in two parts — its back and its front — and mirrored for
 * the other; the front yard, where the bays' cars and the bins differ side to
 * side, is painted unmirrored, in two halves. The plan is lit square to the
 * party wall (dwf-views planPayload) so its two halves shadow alike.
 */
export type PlanTile = { id: "back" | "front" | "back-r" | "front-r" | "yard-a" | "yard-b"; left: number; top: number; width: number; height: number; mirrored: boolean };
export type PlanLayout = { width: number; height: number; centre: number; tiles: PlanTile[]; overlap: number };
type Box = [number, number, number, number];

const OVERLAP = 0.04;

async function raw(image: Buffer, width?: number, height?: number): Promise<{ data: Buffer; width: number; height: number }> {
  const s = sharp(image).removeAlpha();
  const resized = width && height ? s.resize(width, height, { fit: "fill" }) : s;
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The column the plan mirrors about: where its left half and its right half, flipped, differ least — near the house's middle. */
export async function mirrorColumn(render: Buffer, mask: Buffer): Promise<number> {
  const r = await raw(render);
  const m = await raw(mask, r.width, r.height);
  let [x0, x1] = [r.width, 0];
  for (let y = 0; y < r.height; y += 4) for (let x = 0; x < r.width; x++) if (m.data[(y * r.width + x) * 3]! > 127) [x0, x1] = [Math.min(x0, x), Math.max(x1, x)];
  const guess = x1 > x0 ? Math.round((x0 + x1) / 2) : Math.round(r.width / 2);
  let best = { diff: Infinity, at: guess };
  for (let c = guess - 30; c <= guess + 30; c++) {
    const w = Math.min(c, r.width - c);
    let sum = 0;
    let n = 0;
    for (let y = 0; y < r.height; y += 3) {
      for (let d = 1; d < w; d += 3) {
        const a = (y * r.width + (c - d)) * 3;
        const b = (y * r.width + (c + d - 1)) * 3;
        sum += Math.abs(r.data[a]! - r.data[b]!) + Math.abs(r.data[a + 1]! - r.data[b + 1]!) + Math.abs(r.data[a + 2]! - r.data[b + 2]!);
        n++;
      }
    }
    if (sum / n < best.diff) best = { diff: sum / n, at: c };
  }
  return best.at;
}

/** The parts a storey's plan is painted in, from its render and its house mask (white inside the outline). */
export async function planLayout(render: Buffer, mask: Buffer): Promise<PlanLayout> {
  const { width = 1, height = 1 } = await sharp(render).metadata();
  const m = await raw(mask, width, height);
  let [y0, y1] = [height, 0];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x += 4) if (m.data[(y * width + x) * 3]! > 127) [y0, y1] = [Math.min(y0, y), Math.max(y1, y)];
  const centre = await mirrorColumn(render, mask);
  const ov = Math.round(OVERLAP * height);
  const mid = Math.round((y0 + y1) / 2);
  const front = Math.min(height, y1 + Math.round(0.01 * height));
  return {
    width,
    height,
    centre,
    overlap: ov,
    tiles: [
      // Each home painted as itself, not the first mirrored for the second: the
      // pair's sides differ outside — Gottlieb A's side stairs are on one side
      // only, and mirrored they stood on both (13/10/2026).
      { id: "back", left: 0, top: 0, width: centre, height: Math.min(height, mid + ov), mirrored: false },
      { id: "front", left: 0, top: mid - ov, width: centre, height: front + ov - (mid - ov), mirrored: false },
      { id: "back-r", left: centre, top: 0, width: width - centre, height: Math.min(height, mid + ov), mirrored: false },
      { id: "front-r", left: centre, top: mid - ov, width: width - centre, height: front + ov - (mid - ov), mirrored: false },
      // The yard in two halves, each a picture's usual shape: whole, 2000 by 560,
      // it came back drawn to another frame in all ten of its paintings (13/10/2026).
      // Parted on the party fence's line: at the picture's middle the cut ran through the bins' enclosure.
      { id: "yard-a", left: 0, top: front - ov, width: centre, height: height - (front - ov), mirrored: false },
      { id: "yard-b", left: centre, top: front - ov, width: width - centre, height: height - (front - ov), mirrored: false },
    ].filter((t) => t.height > 20 && t.width > 20) as PlanTile[],
  };
}

/** A part of a picture, as a JPEG. */
export async function cutTile(image: Buffer, t: PlanTile): Promise<Buffer> {
  return sharp(image).extract({ left: t.left, top: t.top, width: t.width, height: t.height }).jpeg({ quality: 95 }).toBuffer();
}

/** No plan is composed past this many times its render: 2000 px renders, 4000 px plans. */
export const PLAN_WHOLE_MAX_SCALE = 2;

/**
 * The render and its mask enlarged towards a whole storey's painting (4K is
 * some 2.7 times a 2000 px render), so the plan composed over them keeps the
 * painting's detail: composed at the render's size it was thrown away.
 */
export async function atPaintingScale(render: Buffer, mask: Buffer, painting: Buffer, most = PLAN_WHOLE_MAX_SCALE): Promise<{ render: Buffer; mask: Buffer; scale: number }> {
  const [{ width: rw = 1, height: rh = 1 }, { width: pw = 1 }] = await Promise.all([sharp(render).metadata(), sharp(painting).metadata()]);
  const scale = Math.max(1, Math.min(most, pw / rw));
  if (scale === 1) return { render, mask: await sharp(mask).resize(rw, rh, { fit: "fill" }).png().toBuffer(), scale };
  const [W, H] = [Math.round(rw * scale), Math.round(rh * scale)];
  return {
    render: await sharp(render).resize(W, H, { fit: "fill", kernel: "lanczos3" }).jpeg({ quality: 95 }).toBuffer(),
    mask: await sharp(mask).resize(W, H, { fit: "fill", kernel: "nearest" }).png().toBuffer(),
    scale: W / rw,
  };
}

/**
 * A whole storey's one painting cut into the parts composePlan lays, at the
 * layout's size: its page, its mirroring and its lawn as for parts painted apart.
 */
export async function wholeParts(layout: PlanLayout, painting: Buffer): Promise<Partial<Record<PlanTile["id"], Buffer>>> {
  const fitted = await sharp(painting).resize(layout.width, layout.height, { fit: "fill" }).jpeg({ quality: 95 }).toBuffer();
  const parts: Partial<Record<PlanTile["id"], Buffer>> = {};
  for (const t of layout.tiles) parts[t.id] = await cutTile(fitted, t);
  return parts;
}

/**
 * The page around the plot: the render's flat ground colour reached from its
 * edges. Painted, it came back a street and a neighbour's paving on one side
 * and bare on the other (Gottlieb A, 14/10/2026).
 */
export function pageAround(data: Buffer, width: number, height: number, tolerance = 8): Uint8Array {
  const out = new Uint8Array(width * height);
  const bg = [data[0]!, data[1]!, data[2]!];
  const near = (i: number) => Math.abs(data[i * 3]! - bg[0]!) <= tolerance && Math.abs(data[i * 3 + 1]! - bg[1]!) <= tolerance && Math.abs(data[i * 3 + 2]! - bg[2]!) <= tolerance;
  const stack: number[] = [];
  const push = (i: number) => {
    if (!out[i] && near(i)) {
      out[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) [push(x), push((height - 1) * width + x)];
  for (let y = 0; y < height; y++) [push(y * width), push(y * width + width - 1)];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < (height - 1) * width) push(i + width);
  }
  return out;
}

/** The street kerb's stone, its top and its shaded arris. */
const KERB_TOP: [number, number, number] = [228, 217, 194];
const KERB_ARRIS: [number, number, number] = [176, 165, 144];

/**
 * The plot's street edge — the frame's bottom — finished with a stone kerb on
 * one straight line. Painted, the bays and paths ran out into the page on a
 * ragged pale strip under the cars' bumpers, and the plan read as a cropped
 * photograph (Gottlieb, 15/10/2026). The plot's columns that reach the edge
 * are carried down to it, a kerb about 20 cm deep is laid along it, a soft
 * shade under that, and nothing painted past it. `page`: pageAround's mask;
 * `bg`, the page's colour. Returns the kerb's top row, or null where the
 * plot does not reach the bottom.
 */
export function streetKerb(out: Buffer, page: Uint8Array, width: number, height: number, bg: [number, number, number]): number | null {
  const bottom = new Int32Array(width).fill(-1);
  for (let x = 0; x < width; x++) {
    for (let y = height - 1; y >= 0; y--) {
      if (!page[y * width + x]) {
        bottom[x] = y;
        break;
      }
    }
  }
  const cols = [...bottom.keys()].filter((x) => bottom[x]! >= 0);
  if (cols.length < width * 0.3) return null;
  const [x0, x1] = [cols[0]!, cols[cols.length - 1]!];
  const kerb = Math.max(3, Math.round((x1 - x0) * 0.009));
  // The edge most of the plot ends on: a car's bumper past it is cut by the kerb, a lawn short of it carried down.
  const sorted = cols.map((x) => bottom[x]!).sort((a, b) => a - b);
  const edge = sorted[Math.floor(sorted.length / 2)]!;
  if (edge + kerb >= height - 1) return null;
  const shade = 2 * kerb;
  const set = (i: number, c: readonly number[]) => {
    out[i * 3] = c[0]!;
    out[i * 3 + 1] = c[1]!;
    out[i * 3 + 2] = c[2]!;
  };
  for (let x = x0; x <= x1; x++) {
    const b = bottom[x]!;
    if (b < edge - 3 * kerb) continue;
    for (let y = b + 1; y <= edge; y++) out.copy(out, (y * width + x) * 3, (b * width + x) * 3, (b * width + x) * 3 + 3);
    for (let k = 1; k <= kerb; k++) {
      const t = k / kerb;
      set((edge + k) * width + x, t > 0.75 ? KERB_ARRIS : KERB_TOP.map((v, c) => Math.round(v + (KERB_ARRIS[c]! - v) * t * 0.3)));
    }
    for (let y = edge + kerb + 1; y < height; y++) {
      const k = y - edge - kerb;
      const a = k <= shade ? 0.16 * (1 - k / shade) : 0;
      set(y * width + x, bg.map((v) => Math.round(v * (1 - a))));
    }
  }
  return edge + 1;
}

/**
 * Within `inside`, right of the mirror column, where the render is not the
 * mirror of its left: a door one home has and the other not, a car of
 * another colour, a stair on one side only. Only a patch of
 * `minArea` pixels counts — a bed drawn a few centimetres off its partner is
 * the drawing's mirror all the same — grown by `grow` so its edges go with
 * it. `data` is the render blurred, so a joint or a JPEG speck is no patch.
 */
export function asymmetryMask(data: Buffer, width: number, height: number, centre: number, inside: Uint8Array, threshold = 120, minArea = 3000, grow = 6): Uint8Array {
  const odd = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = centre; x < width; x++) {
      const m = 2 * centre - 1 - x;
      const i = y * width + x;
      if (m < 0 || !inside[i] || !inside[y * width + m]) continue;
      const a = i * 3;
      const b = (y * width + m) * 3;
      if (Math.abs(data[a]! - data[b]!) + Math.abs(data[a + 1]! - data[b + 1]!) + Math.abs(data[a + 2]! - data[b + 2]!) > threshold) odd[i] = 1;
    }
  }
  const out = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  for (let start = 0; start < odd.length; start++) {
    if (!odd[start] || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]!;
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j >= 0 && j < odd.length && odd[j] && !seen[j]) {
          seen[j] = 1;
          patch.push(j);
        }
      }
    }
    if (patch.length < minArea) continue;
    // A car's windscreen matches its partner's: the patch's holes go with it.
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (const i of patch) {
      const x = i % width;
      const y = (i - x) / width;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const bw = x1 - x0 + 3;
    const bh = y1 - y0 + 3;
    const box = new Uint8Array(bw * bh);
    for (const i of patch) box[(Math.floor(i / width) - y0 + 1) * bw + (i % width) - x0 + 1] = 1;
    const reach = [0];
    box[0] = 2;
    for (let k = 0; k < reach.length; k++) {
      const j = reach[k]!;
      const x = j % bw;
      for (const n of [x > 0 ? j - 1 : -1, x < bw - 1 ? j + 1 : -1, j - bw, j + bw]) {
        if (n >= 0 && n < box.length && box[n] === 0) {
          box[n] = 2;
          reach.push(n);
        }
      }
    }
    for (let j = 0; j < box.length; j++) if (box[j] === 0) patch.push((Math.floor(j / bw) + y0 - 1) * width + (j % bw) + x0 - 1);
    for (const i of patch) {
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -grow; dy <= grow; dy++) {
        for (let dx = -grow; dx <= grow; dx++) {
          const [xx, yy] = [x + dx, y + dy];
          if (xx >= centre && xx < width && yy >= 0 && yy < height) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}

const isLawn = (d: Buffer, i: number, by: number) => d[i * 3 + 1]! > d[i * 3]! + by && d[i * 3 + 1]! > d[i * 3 + 2]! + 2 * by;
/**
 * Painted grass: its dry blades near as red as green, its shade dark, but green well above blue — a rail greyed
 * over it is not (131,144,114) — and no paler than grass: Gottlieb A's painter edged the party fence with a pale green strip.
 */
const isPaintedLawn = (d: Buffer, i: number) => {
  const [r, g, b] = [d[i * 3]!, d[i * 3 + 1]!, d[i * 3 + 2]!];
  return g >= r - 4 && g - b >= 0.35 * g && g > 20 && 0.3 * r + 0.59 * g + 0.11 * b < 135;
};

/**
 * Where the render is lawn all round (`margin` pixels each way), the painting
 * is lawn: each patch painted otherwise there takes the painted lawn beside
 * it, as a block, or else row by row. The painter drew Gottlieb A's west stair
 * wider than the render and its rail longer, and that rail, mirrored, stood
 * as a stub on the east lawn (15/10/2026). Returns the pixels so mended.
 */
export function holdLawn(out: Buffer, render: Buffer, width: number, height: number, margin = 5): number {
  const inside = lawnInside(render, width, height, margin);
  const sure = (i: number) => inside[i] === 1;
  let mended = 0;
  // Each patch whole first, from painted lawn beside it as a block; a speck under `least` pixels is a dry blade of the grass.
  // Mended a speck and a row at a time, Gottlieb's front lawns came out streaked across (15/10/2026).
  const least = 30;
  // A glass rail laid over the lawn, greyed, is no grass (Gottlieb A's stub: 131,144,114 on 61,87,26); nor is a
  // flat light green far brighter than the painting's lawn — Gottlieb B's east edge, taken from beside its west wall.
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * out[i * 3]! + 0.59 * out[i * 3 + 1]! + 0.11 * out[i * 3 + 2]!;
  const near = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      near[i] = (lum[i - width - 1]! + lum[i - width]! + lum[i - width + 1]! + lum[i - 1]! + lum[i]! + lum[i + 1]! + lum[i + width - 1]! + lum[i + width]! + lum[i + width + 1]!) / 9;
    }
  }
  const typical = (() => {
    const counts = new Uint32Array(256);
    for (let i = 0; i < lum.length; i++) if (sure(i) && isPaintedLawn(out, i)) counts[Math.round(lum[i]!)]!++;
    const total = counts.reduce((a, b) => a + b, 0);
    let seen = 0;
    for (let v = 0; v < 256; v++) if ((seen += counts[v]!) >= total / 2) return v;
    return 255;
  })();
  const notGrass = (i: number) => !isPaintedLawn(out, i) || near[i]! > typical + 30;
  const bad = new Uint8Array(width * height);
  for (let i = 0; i < bad.length; i++) bad[i] = sure(i) && notGrass(i) ? 1 : 0;
  // A patch reaches on to the render lawn's edge: Gottlieb A's party fence, painted wider, left a sliver there.
  const edge = (j: number) => !sure(j) && isLawn(render, j, 10) && notGrass(j);
  const seen = new Uint8Array(width * height);
  for (let start = 0; start < bad.length; start++) {
    if (!bad[start] || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]!;
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j >= 0 && j < bad.length && !seen[j] && (bad[j] || edge(j))) {
          seen[j] = 1;
          bad[j] = 1;
          patch.push(j);
        }
      }
    }
    if (patch.length < least) {
      for (const i of patch) bad[i] = 0;
      continue;
    }
    // And its soft edge with it, two pixels round, where the render is lawn.
    for (let ring = 0; ring < 2; ring++) {
      for (const i of patch.slice()) {
        const x = i % width;
        for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
          if (j >= 0 && j < bad.length && !seen[j] && isLawn(render, j, 10)) {
            seen[j] = 1;
            bad[j] = 1;
            patch.push(j);
          }
        }
      }
    }
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (const i of patch) {
      const x = i % width;
      const y = (i - x) / width;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const [bw, bh] = [x1 - x0 + 4, y1 - y0 + 4];
    const offsets = [1, 2, 3].flatMap((m) => [[m * bw, 0], [-m * bw, 0], [0, m * bh], [0, -m * bh], [m * bw, m * bh], [-m * bw, m * bh], [m * bw, -m * bh], [-m * bw, -m * bh]]);
    const shift = offsets.find(([dx, dy]) =>
      patch.every((i) => {
        const x = (i % width) + dx!;
        const y = Math.floor(i / width) + dy!;
        const s = y * width + x;
        return x >= 0 && x < width && y >= 0 && y < height && sure(s) && !bad[s] && isPaintedLawn(out, s);
      }),
    );
    if (!shift) continue;
    for (const i of patch) {
      const s = i + shift[1]! * width + shift[0]!;
      out.copy(out, i * 3, s * 3, s * 3 + 3);
      bad[i] = 0;
    }
    mended += patch.length;
  }
  // What no block beside could mend, a row at a time.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!bad[i]) continue;
      let end = x;
      while (end + 1 < width && bad[i + end + 1 - x]) end++;
      const n = end - x + 1;
      const fine = (from: number) => {
        for (let k = 0; k < n; k++) {
          const s = y * width + from + k;
          if (from + k < 0 || from + k >= width || !sure(s) || bad[s] || !isPaintedLawn(out, s)) return false;
        }
        return true;
      };
      const from = [end + 3, x - n - 3, end + n + 6, x - 2 * n - 6].find(fine);
      if (from != null) {
        out.copy(out, i * 3, (y * width + from) * 3, (y * width + from + n) * 3);
        mended += n;
      }
      x = end;
    }
  }
  return mended;
}

/** Where the render is lawn all round: a run of `margin` lawn pixels each way along the row and down the column. */
function lawnInside(render: Buffer, width: number, height: number, margin: number): Uint8Array {
  const lawn = new Uint8Array(width * height);
  for (let i = 0; i < lawn.length; i++) lawn[i] = isLawn(render, i, 10) ? 1 : 0;
  const runs = (horizontal: boolean) => {
    const keep = new Uint8Array(lawn.length);
    const [lines, len] = horizontal ? [height, width] : [width, height];
    const at = (l: number, k: number) => (horizontal ? l * width + k : k * width + l);
    for (let l = 0; l < lines; l++) {
      let start = -1;
      for (let k = 0; k <= len; k++) {
        if (k < len && lawn[at(l, k)]) { if (start < 0) start = k; continue; }
        if (start >= 0) for (let j = start + margin; j < k - margin; j++) keep[at(l, j)] = 1;
        start = -1;
      }
    }
    return keep;
  };
  const [across, down] = [runs(true), runs(false)];
  const inside = new Uint8Array(lawn.length);
  for (let i = 0; i < inside.length; i++) inside[i] = across[i]! & down[i]!;
  return inside;
}

/** The lawn every plan is evened to: the painted green, a shade nearer the render's brightness. */
export const PLAN_LAWN: [number, number, number] = [74, 100, 28];

/**
 * Where render and painting are both lawn, the painting's lawn moved to
 * `target` around each pixel — its local mean (over lawn only, `reach`
 * pixels each way) taken away and `target` put in its place, the grass's own
 * texture kept. Gottlieb's lawns came out a shade apart plan to plan, darker
 * than the render, and the second home's east lawn with a darker strip where
 * it was taken from beside the first home's stair (15/10/2026). Returns the
 * pixels evened.
 */
export function evenLawn(out: Buffer, render: Buffer, width: number, height: number, target: [number, number, number] = PLAN_LAWN, reach = 8): number {
  const n = width * height;
  // The render's lawn: inside it whatever the painting has (its darkest blades are hardly green), on its edges
  // what the painting draws as grass; nowhere what it draws pale — a pale edging, evened, came out a light line.
  const lawn = lawnInside(render, width, height, 3);
  const pale = (i: number) => 0.3 * out[i * 3]! + 0.59 * out[i * 3 + 1]! + 0.11 * out[i * 3 + 2]! >= 135;
  for (let i = 0; i < n; i++) lawn[i] = (lawn[i] || (isLawn(render, i, 10) && isPaintedLawn(out, i))) && !pale(i) ? 1 : 0;
  // Sums over a box `reach` each way, twice (near a gaussian), of the lawn's channels and of the lawn itself.
  const box = (src: Float32Array) => {
    const a = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      let s = 0;
      const row = y * width;
      for (let x = -reach; x < width; x++) {
        if (x + reach < width) s += src[row + x + reach]!;
        if (x - reach - 1 >= 0) s -= src[row + x - reach - 1]!;
        if (x >= 0) a[row + x] = s;
      }
    }
    const b = new Float32Array(n);
    for (let x = 0; x < width; x++) {
      let s = 0;
      for (let y = -reach; y < height; y++) {
        if (y + reach < height) s += a[(y + reach) * width + x]!;
        if (y - reach - 1 >= 0) s -= a[(y - reach - 1) * width + x]!;
        if (y >= 0) b[y * width + x] = s;
      }
    }
    return b;
  };
  const smooth = (src: Float32Array) => box(box(src));
  const weight = smooth(Float32Array.from(lawn));
  const mean = [0, 1, 2].map((c) => {
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) if (lawn[i]) ch[i] = out[i * 3 + c]!;
    return smooth(ch);
  });
  const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
  const want = lum(...target);
  let evened = 0;
  for (let i = 0; i < n; i++) {
    if (!lawn[i] || weight[i]! < 1) continue;
    const m = [mean[0]![i]! / weight[i]!, mean[1]![i]! / weight[i]!, mean[2]![i]! / weight[i]!] as const;
    // The texture's contrast goes a little with its brightness: much further, a dark patch's blades came out blotches.
    const k = Math.max(0.8, Math.min(1.15, want / Math.max(1, lum(m[0], m[1], m[2]))));
    for (let c = 0; c < 3; c++) {
      const d = Math.max(-60, Math.min(60, out[i * 3 + c]! - m[c]!));
      out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(target[c]! + d * k)));
    }
    evened++;
  }
  return evened;
}

/**
 * The render kept at `target`, in the painting's colours: each of its colours
 * (cells 16 a channel wide) as the painting paints that colour where `sample`
 * is, the nearest cells around it pooled until enough are found, and the
 * render's own shading within the cell kept. Gottlieb's bins kept as the
 * render stood flat and yellow beside the painted yard (15/10/2026). Returns
 * the pixels recoloured.
 */
export function analogyRecolour(out: Buffer, render: Buffer, width: number, height: number, target: Uint8Array, sample: Uint8Array, enough = 40): number {
  const cell = (d: Buffer, i: number) => ((d[i * 3]! >> 4) << 8) | ((d[i * 3 + 1]! >> 4) << 4) | (d[i * 3 + 2]! >> 4);
  const sums = new Float64Array(4096 * 7);
  for (let i = 0; i < width * height; i++) {
    if (!sample[i] || target[i]) continue;
    const k = cell(render, i) * 7;
    for (let c = 0; c < 3; c++) {
      sums[k + c] = sums[k + c]! + out[i * 3 + c]!;
      sums[k + 3 + c] = sums[k + 3 + c]! + render[i * 3 + c]!;
    }
    sums[k + 6] = sums[k + 6]! + 1;
  }
  const memo = new Map<number, Float64Array | null>();
  const analogy = (k: number) => {
    if (memo.has(k)) return memo.get(k)!;
    const [r, g, b] = [k >> 8, (k >> 4) & 15, k & 15];
    let found: Float64Array | null = null;
    for (let reach = 0; reach <= 4 && !found; reach++) {
      const acc = new Float64Array(7);
      for (let dr = -reach; dr <= reach; dr++) {
        for (let dg = -reach; dg <= reach; dg++) {
          for (let db = -reach; db <= reach; db++) {
            const [rr, gg, bb] = [r + dr, g + dg, b + db];
            if (rr < 0 || gg < 0 || bb < 0 || rr > 15 || gg > 15 || bb > 15) continue;
            const j = ((rr << 8) | (gg << 4) | bb) * 7;
            for (let c = 0; c < 7; c++) acc[c] = acc[c]! + sums[j + c]!;
          }
        }
      }
      if (acc[6]! >= enough) found = acc;
    }
    memo.set(k, found);
    return found;
  };
  // Each cell's shift from the render's colour to the painting's, blended between the eight cells about a colour:
  // taken cell by cell, a colour crossing a cell's edge came out a contour.
  const shiftOf = (k: number) => {
    const a = analogy(k);
    return a ? [a[0]! / a[6]! - a[3]! / a[6]!, a[1]! / a[6]! - a[4]! / a[6]!, a[2]! / a[6]! - a[5]! / a[6]!] : null;
  };
  let done = 0;
  for (let i = 0; i < width * height; i++) {
    if (!target[i]) continue;
    const at = [0, 1, 2].map((c) => {
      const f = Math.max(0, Math.min(15, (render[i * 3 + c]! - 8) / 16));
      const lo = Math.min(14, Math.floor(f));
      return { lo, w: f - lo };
    });
    const shift = [0, 0, 0];
    let weight = 0;
    for (let corner = 0; corner < 8; corner++) {
      const pick = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
      const w = pick.reduce((p, b, c) => p * (b ? at[c]!.w : 1 - at[c]!.w), 1);
      if (w <= 0) continue;
      const s = shiftOf(((at[0]!.lo + pick[0]!) << 8) | ((at[1]!.lo + pick[1]!) << 4) | (at[2]!.lo + pick[2]!));
      if (!s) continue;
      for (let c = 0; c < 3; c++) shift[c]! += w * s[c]!;
      weight += w;
    }
    if (weight <= 0) continue;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(render[i * 3 + c]! + shift[c]! / weight)));
    done++;
  }
  return done;
}

/** A painted part of another plan, with its render, to lay where this plan's render draws the same. */
export type PlanDonor = { painted: Buffer; render: Buffer; width: number; height: number };

/**
 * Where in `box` of this plan's render the donor's render lies — its scale
 * (0.9 to 1.1) and its top left — matched on what in it is not lawn. Returns
 * the mean difference a channel too.
 */
export function placeDonor(render: Buffer, width: number, height: number, box: Box, donor: PlanDonor): { scale: number; dx: number; dy: number; cost: number } {
  const [x0, y0, x1, y1] = box;
  const bound = (d: Buffer, w: number, h: number, bx0: number, by0: number, bx1: number, by1: number) => {
    let [a, b, c, e] = [Infinity, Infinity, -1, -1];
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (x >= 0 && y >= 0 && x < w && y < h && !isLawn(d, y * w + x, 10)) [a, b, c, e] = [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(e, y)];
    return [a, b, c, e] as const;
  };
  const [tx0, ty0] = bound(render, width, height, x0, y0, x1, y1);
  const [ux0, uy0] = bound(donor.render, donor.width, donor.height, 0, 0, donor.width - 1, donor.height - 1);
  const samples: number[] = [];
  for (let v = 0; v < donor.height; v += 2) for (let u = 0; u < donor.width; u += 2) if (!isLawn(donor.render, v * donor.width + u, 10)) samples.push(v * donor.width + u);
  let best = { scale: 1, dx: 0, dy: 0, cost: Infinity };
  const cost = (scale: number, dx: number, dy: number) => {
    let sum = 0;
    let n = 0;
    for (const k of samples) {
      const u = k % donor.width;
      const x = Math.round(dx + u * scale);
      const y = Math.round(dy + ((k - u) / donor.width) * scale);
      if (x < x0 || y < y0 || x > x1 || y > y1 || x >= width || y >= height) continue;
      const i = y * width + x;
      sum += Math.abs(render[i * 3]! - donor.render[k * 3]!) + Math.abs(render[i * 3 + 1]! - donor.render[k * 3 + 1]!) + Math.abs(render[i * 3 + 2]! - donor.render[k * 3 + 2]!);
      n++;
    }
    return n > samples.length * 0.85 ? sum / n / 3 : Infinity;
  };
  for (let scale = 0.9; scale <= 1.1001; scale += 0.01) {
    const [gx, gy] = [tx0 - ux0 * scale, ty0 - uy0 * scale];
    for (let dy = -24; dy <= 24; dy += 2) {
      for (let dx = -24; dx <= 24; dx += 2) {
        const c = cost(scale, gx + dx, gy + dy);
        if (c < best.cost) best = { scale, dx: gx + dx, dy: gy + dy, cost: c };
      }
    }
  }
  const around = best;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const c = cost(around.scale, around.dx + dx, around.dy + dy);
      if (c < best.cost) best = { ...around, dx: around.dx + dx, dy: around.dy + dy, cost: c };
    }
  }
  return best;
}

/**
 * Each patch of the second half drawn unlike its mirror (asymmetryMask) — the
 * other car, lawn where the first half has its outside stair — matched to
 * where in the first half the render draws the same, mirrored or as it
 * stands, moved: `source` is the pixel each is taken from, -1 where nothing
 * in the first half is drawn alike (the bins only one home has) and the
 * second half's own painting stays. `data` is the render blurred; `painted`,
 * the painting so far blurred: a source is also to look like the second
 * half's own painting there, half as much — Gottlieb A's lawn east of the
 * house came from beside the first half's outside stair, which the painter
 * drew wider than the render, and brought its railing.
 */
export function firstHalfSources(
  data: Buffer,
  width: number,
  height: number,
  centre: number,
  own: Uint8Array,
  plot: Uint8Array,
  painted?: Buffer,
  accept = 40,
  unpainted?: Uint8Array,
): { source: Int32Array; patches: { size: number; cost: number; how: string }[] } {
  const source = new Int32Array(width * height).fill(-1);
  const patches: { size: number; cost: number; how: string }[] = [];
  const seen = new Uint8Array(width * height);
  const near = (d: Buffer, a: number, b: number) =>
    Math.abs(d[a * 3]! - d[b * 3]!) + Math.abs(d[a * 3 + 1]! - d[b * 3 + 1]!) + Math.abs(d[a * 3 + 2]! - d[b * 3 + 2]!);
  let alike = true;
  const diff = (a: number, b: number) => near(data, a, b) + (painted && alike ? near(painted, a, b) / 2 : 0);
  for (let start = 0; start < own.length; start++) {
    if (!own[start] || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const i = patch[k]!;
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j >= 0 && j < own.length && own[j] && !seen[j]) {
          seen[j] = 1;
          patch.push(j);
        }
      }
    }
    const from = (i: number, mirror: boolean, dx: number, dy: number) => {
      const x = i % width;
      const sx = (mirror ? 2 * centre - 1 - x : x) + dx;
      const sy = (i - x) / width + dy;
      if (sx < 0 || sx >= centre || sy < 0 || sy >= height) return -1;
      const s = sy * width + sx;
      return plot[s] && !own[s] ? s : -1;
    };
    const cost = (samples: number[], mirror: boolean, dx: number, dy: number, bound: number) => {
      let sum = 0;
      let missing = 0;
      for (const i of samples) {
        const s = from(i, mirror, dx, dy);
        if (s < 0) {
          if (++missing > samples.length * 0.03) return Infinity;
          continue;
        }
        sum += diff(i, s);
        if (sum > bound * samples.length) return Infinity;
      }
      return sum / (samples.length - missing);
    };
    const every = (n: number) => patch.filter((i) => (i % width) % n === 0 && Math.floor(i / width) % n === 0);
    // Of sources drawn alike, the nearest: Gottlieb A's lawn east of the house
    // taken from the plot's far west edge was a darker green than around it.
    const far = (dx: number, dy: number) => (Math.abs(dx) + Math.abs(dy)) / 100;
    const coarse = every(6);
    let best = { cost: Infinity, score: Infinity, mirror: true, dx: 0, dy: 0 };
    for (const mirror of [true, false]) {
      const [lo, hi] = mirror ? [-480, 480] : [-width, 0];
      for (let dy = -240; dy <= 240; dy += 8) {
        for (let dx = lo; dx <= hi; dx += 8) {
          const c = cost(coarse, mirror, dx, dy, best.score);
          if (c + far(dx, dy) < best.score) best = { cost: c, score: c + far(dx, dy), mirror, dx, dy };
        }
      }
    }
    if (best.cost < Infinity) {
      const fine = every(3);
      const around = best;
      best = { ...around, cost: Infinity, score: Infinity };
      for (let dy = around.dy - 8; dy <= around.dy + 8; dy++) {
        for (let dx = around.dx - 8; dx <= around.dx + 8; dx++) {
          const c = cost(fine, around.mirror, dx, dy, best.score);
          if (c + far(dx, dy) < best.score) best = { cost: c, score: c + far(dx, dy), mirror: around.mirror, dx, dy };
        }
      }
    }
    // Held on the render alone: the second half's own painting may be what is wrong there.
    alike = false;
    if (best.cost < Infinity) best.cost = cost(every(3), best.mirror, best.dx, best.dy, Infinity);
    alike = true;
    // Where the second half has no painting of its own, the render would show
    // through, unpainted, beside the painting: a source less alike is better.
    const bare = unpainted ? patch.filter((i) => unpainted[i]).length > patch.length / 2 : false;
    const held = best.cost < (bare ? 100 : accept);
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (const i of patch) {
      const x = i % width;
      const y = (i - x) / width;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const at = `${x0}-${x1}×${y0}-${y1}`;
    let off = 0;
    if (!held && painted) {
      for (const i of patch) off += Math.abs(painted[i * 3]! - data[i * 3]!) + Math.abs(painted[i * 3 + 1]! - data[i * 3 + 1]!) + Math.abs(painted[i * 3 + 2]! - data[i * 3 + 2]!);
      off = Math.round(off / patch.length);
    }
    patches.push({ size: patch.length, cost: Math.round(best.cost), how: `at ${at} ${best.mirror ? "mirrored" : "moved"} ${best.dx},${best.dy}${held ? "" : ` — own painting, ${off} off the render`}` });
    if (!held) continue;
    for (const i of patch) {
      const s = from(i, best.mirror, best.dx, best.dy);
      if (s >= 0) source[i] = s;
    }
  }
  return { source, patches };
}

/**
 * The storey's painting from its parts: each laid where it was cut, faded
 * into the one above it across their overlap; the home's half mirrored about
 * the party wall for the other home. Where nothing painted reaches, and on the
 * page around the plot, the render. With `mirror`, the plot's second half is
 * the first's painting mirrored wherever the render is the mirror of the first
 * (asymmetryMask): its own painting shows only where the two halves are drawn
 * unlike. Gottlieb A's halves painted apart, even given each other, came out
 * two designs — kitchens, bedding, the fence changing at the party wall — and
 * a right half painted beside the left took the left's outside stair.
 */
export async function composePlan(
  render: Buffer,
  layout: PlanLayout,
  painted: Partial<Record<PlanTile["id"], Buffer>>,
  /**
   * Boxes [x0, y0, x1, y1] of the second half that nothing is mirrored into: Gottlieb's bins' enclosure, where
   * the first half's gas pillar, mirrored over the fence, came out a stone the drawing has not (15/10/2026).
   * `keepRender`: there the render stays, in the painting's colours (analogyRecolour) — every painting of the
   * bins but one miscounted them or drew them from the side; `keepOwn`: the second half's own painting stays.
   * Either keeps the lawn about them as it came. `donor`: the one good painting of them, laid in `keepRender`'s
   * boxes where their render matches its render (placeDonor), so every plan's bins are painted, and alike.
   * `wall`: pixels right of the mirror line always the first half's mirror — half the party wall's and fence's width.
   */
  /**
   * `scale`: the render enlarged this many times to the painting's size (atPaintingScale) — the pixel reaches with it.
   * `tone: false`: the second home's parts keep their own tone — parts of one painting (wholeParts) are lit alike already.
   * `kerb`: the street edge finished with a kerb (streetKerb).
   */
  options: {
    mirror?: boolean;
    say?: (line: string) => void;
    keepRender?: Box[];
    /** Full-span boxes (both halves): render stays, recolored like keepRender — parking cars that the sheet must show whole. Not given to `donor`. */
    keepBase?: Box[];
    keepOwn?: Box[];
    donor?: PlanDonor;
    wall?: number;
    lawn?: [number, number, number];
    scale?: number;
    tone?: boolean;
    kerb?: boolean;
  } = {},
): Promise<Buffer> {
  const { width: W, height: H, centre, overlap } = layout;
  const s = options.scale ?? 1;
  const base = (await raw(render, W, H)).data;
  const out = Buffer.from(base);
  const put = (x: number, y: number, p: Buffer, k: number, a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(out[o + c]! * (1 - a) + p[k + c]! * a);
  };
  // Each home is painted on its own, and the painter lights each its own way:
  // Gottlieb A's two halves came out one sunny, one dull, a seam down the
  // party wall (13/10/2026). The second home's parts take the first's tone —
  // each channel's mean and spread moved to its partner's.
  const partner: Partial<Record<PlanTile["id"], PlanTile["id"]>> = { "back-r": "back", "front-r": "front", "yard-b": "yard-a" };
  const stats = (d: Buffer) => {
    const m = [0, 0, 0], q = [0, 0, 0];
    const n = d.length / 3;
    for (let i = 0; i < d.length; i += 3) for (let c = 0; c < 3; c++) { m[c]! += d[i + c]!; q[c]! += d[i + c]! * d[i + c]!; }
    return m.map((s, c) => ({ mean: s / n, sd: Math.sqrt(Math.max(1, q[c]! / n - (s / n) ** 2)) }));
  };
  const toneOf = new Map<PlanTile["id"], ReturnType<typeof stats>>();
  for (const t of layout.tiles) {
    const img = painted[t.id];
    if (img && !partner[t.id]) toneOf.set(t.id, stats((await raw(img, t.width, t.height)).data));
  }
  for (const t of layout.tiles) {
    const img = painted[t.id];
    if (!img) continue;
    const p = (await raw(img, t.width, t.height)).data;
    const want = partner[t.id] && options.tone !== false ? toneOf.get(partner[t.id]!) : undefined;
    if (want) {
      const have = stats(p);
      for (let i = 0; i < p.length; i += 3) {
        for (let c = 0; c < 3; c++) p[i + c] = Math.max(0, Math.min(255, Math.round(((p[i + c]! - have[c]!.mean) / have[c]!.sd) * want[c]!.sd + want[c]!.mean)));
      }
    }
    for (let y = 0; y < t.height; y++) {
      // Faded in across the overlap at its top, onto the part above it.
      const a = t.top > 0 ? Math.min(1, y / Math.max(1, overlap * 2)) : 1;
      for (let x = 0; x < t.width; x++) {
        const k = (y * t.width + x) * 3;
        put(t.left + x, t.top + y, p, k, a);
        if (t.mirrored) put(2 * centre - 1 - (t.left + x), t.top + y, p, k, a);
      }
    }
  }
  const page = pageAround(base, W, H);
  for (let i = 0; i < page.length; i++) if (page[i]) base.copy(out, i * 3, i * 3, i * 3 + 3);
  let keptAfterKerb: Uint8Array | undefined;
  if (options.mirror && layout.tiles.every((t) => partner[t.id] || painted[t.id])) {
    const inside = new Uint8Array(W * H);
    for (let i = 0; i < inside.length; i++) inside[i] = page[i] ? 0 : 1;
    const blurred = (await sharp(base, { raw: { width: W, height: H, channels: 3 } }).blur(3 * s).raw().toBuffer({ resolveWithObject: true })).data;
    const own = asymmetryMask(blurred, W, H, centre, inside, 120, Math.round(3000 * s * s), Math.round(6 * s));
    // The party wall and its fence stand on the mirror line: their second half is the first's, whatever lies beside
    // them — Gottlieb B's and C's fence, beside the bins only one home has, came out half fence, half paving.
    for (let y = 0; y < H; y++) own.fill(0, y * W + centre, y * W + Math.min(W, centre + (options.wall ?? 0)));
    const unmirrored = Buffer.from(out);
    for (let y = 0; y < H; y++) {
      for (let x = centre; x < W; x++) {
        const mx = 2 * centre - 1 - x;
        const i = y * W + x;
        if (mx >= 0 && inside[i] && inside[y * W + mx] && !own[i]) out.copy(out, i * 3, (y * W + mx) * 3, (y * W + mx) * 3 + 3);
      }
    }
    const paintedBlur = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).blur(3 * s).raw().toBuffer();
    const unpainted = new Uint8Array(W * H).fill(1);
    for (const t of layout.tiles) {
      if (!partner[t.id] || !painted[t.id]) continue;
      for (let y = t.top; y < t.top + t.height; y++) unpainted.fill(0, y * W + t.left, y * W + t.left + t.width);
    }
    const { source, patches } = firstHalfSources(blurred, W, H, centre, own, inside, paintedBlur, 40, unpainted);
    // Taken with the render's own difference between there and here: Gottlieb
    // A's dark blue car east came from the black one west, and came out black.
    for (let i = 0; i < source.length; i++) {
      const s = source[i]!;
      if (s < 0) continue;
      for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, out[s * 3 + c]! + blurred[i * 3 + c]! - blurred[s * 3 + c]!));
    }
    options.say?.(`mirrored; drawn unlike: ${patches.map((p) => `${p.size}px ${p.how} (${p.cost})`).join("; ") || "none"}`);
    const boxed = new Uint8Array(W * H);
    const kept = new Uint8Array(W * H);
    const each = (boxes: Box[], at: (i: number) => void) => {
      for (const [x0, y0, x1, y1] of boxes) {
        // Second-half boxes stay right of the mirror. A box that opens left of
        // centre (parking cars on both homes) is applied across its full span.
        const xLo = x0 < centre ? Math.max(0, x0) : Math.max(centre, x0);
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
          for (let x = xLo; x <= Math.min(W - 1, x1); x++) {
            const i = y * W + x;
            boxed[i] = 1;
            if (inside[i] && !isLawn(base, i, 10)) at(i);
          }
        }
      }
    };
    each(options.keepOwn ?? [], (i) => unmirrored.copy(out, i * 3, i * 3, i * 3 + 3));
    each(options.keepRender ?? [], (i) => {
      kept[i] = 1;
      base.copy(out, i * 3, i * 3, i * 3 + 3);
    });
    // Parking / street: both homes, never a donor target (bins stay on keepRender only).
    each(options.keepBase ?? [], (i) => {
      kept[i] = 1;
      base.copy(out, i * 3, i * 3, i * 3 + 3);
    });
    for (const box of options.donor ? (options.keepRender ?? []) : []) {
      const d = options.donor!;
      const at = placeDonor(base, W, H, box, d);
      let laid = 0;
      if (at.cost < 30) {
        for (let y = Math.max(0, box[1]); y <= Math.min(H - 1, box[3]); y++) {
          for (let x = Math.max(centre, box[0]); x <= Math.min(W - 1, box[2]); x++) {
            const i = y * W + x;
            const [u, v] = [(x - at.dx) / at.scale, (y - at.dy) / at.scale];
            if (!kept[i] || u < 0 || v < 0 || u > d.width - 1 || v > d.height - 1) continue;
            if (isLawn(d.render, Math.round(v) * d.width + Math.round(u), 10)) continue;
            const [u0, v0] = [Math.min(d.width - 2, Math.floor(u)), Math.min(d.height - 2, Math.floor(v))];
            const [fu, fv] = [u - u0, v - v0];
            for (let c = 0; c < 3; c++) {
              const p = (uu: number, vv: number) => d.painted[(vv * d.width + uu) * 3 + c]!;
              out[i * 3 + c] = Math.round(p(u0, v0) * (1 - fu) * (1 - fv) + p(u0 + 1, v0) * fu * (1 - fv) + p(u0, v0 + 1) * (1 - fu) * fv + p(u0 + 1, v0 + 1) * fu * fv);
            }
            kept[i] = 0;
            laid++;
          }
        }
      }
      options.say?.(`donor at ${box.join(",")}: scale ${at.scale.toFixed(2)}, ${Math.round(at.dx)},${Math.round(at.dy)}, ${at.cost.toFixed(1)} off — ${laid} px laid`);
    }
    if (options.keepRender?.length || options.keepBase?.length) {
      // Painted as the yard paints the render's colours: its paving, its pillar, its cars.
      const yardTop = Math.min(H, ...layout.tiles.filter((t) => t.id.startsWith("yard")).map((t) => t.top));
      const sample = new Uint8Array(W * H);
      for (let i = yardTop * W; i < sample.length; i++) sample[i] = inside[i] && !boxed[i] ? 1 : 0;
      options.say?.(`kept as the render, in the painting's colours: ${analogyRecolour(out, base, W, H, kept, sample)} px`);
      keptAfterKerb = new Uint8Array(kept);
    }
  }
  if (Object.keys(painted).length) {
    options.say?.(`lawn held: ${holdLawn(out, base, W, H, Math.round(5 * s))} px painted off the render's lawn mended`);
    options.say?.(`lawn evened: ${evenLawn(out, base, W, H, options.lawn, Math.round(8 * s))} px`);
  }
  if (options.kerb) options.say?.(`street kerb at row ${streetKerb(out, page, W, H, [base[0]!, base[1]!, base[2]!]) ?? "none"}`);
  // Kerb paints over bumpers past the plot edge: put keepBase / keepRender back
  // after it so whole cars and the bin enclosure stay (16/10/2026).
  if (keptAfterKerb?.length) {
    const yardTop = Math.min(H, ...layout.tiles.filter((t) => t.id.startsWith("yard")).map((t) => t.top), H);
    const sample = new Uint8Array(W * H);
    for (let i = yardTop * W; i < sample.length; i++) if (!page[i]) sample[i] = 1;
    for (let i = 0; i < keptAfterKerb.length; i++) if (keptAfterKerb[i]) base.copy(out, i * 3, i * 3, i * 3 + 3);
    options.say?.(`kept after kerb: ${analogyRecolour(out, base, W, H, keptAfterKerb, sample)} px`);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
