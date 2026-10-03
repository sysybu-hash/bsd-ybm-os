import type { Outline } from "@/lib/projects/building/assemble";
import type { Face, Sheet } from "@/lib/projects/building/facade-materials";
import type { Primitive } from "@/lib/projects/building/model";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { textLines } from "@/lib/projects/floor-split";

/**
 * The laundry screens the elevations draw — a frame of slats 10 cm apart, as
 * against stone courses at 20 to 40 — stood in front of the facade.
 *
 * Each elevation is scanned in 10 cm columns and 30 cm bands for horizontal
 * strokes; a cell crossed by three or more is slatted, and each run of slatted
 * cells with a "מסתור" or "כביסה" written within a metre of it is a screen.
 * It is laid back onto the building by its elevation's frame and set flush
 * with the outermost face behind it, its slats the drawing's 10 cm apart.
 */
export function laundryScreens(
  elevations: Map<string, { face: Face; sheet: Sheet }>,
  floors: Array<{ level: number; height: number; outline: Outline; roof: boolean }>,
  centre: { x: number; z: number },
): Primitive[] {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const out: Primitive[] = [];
  const top = Math.max(...floors.map((f) => f.level + f.height));
  for (const { face, sheet } of elevations.values()) {
    const bin = 0.1 * upm;
    const band = 0.3 * upm;
    const cols = Math.ceil(sheet.g.pageWidth / bin) + 1;
    const rows = Math.ceil((top + 1) / 0.3) + 1;
    const count = new Uint16Array(cols * rows);
    for (const [y, a, b] of sheet.hor) {
      const r = Math.floor((sheet.zeroY - y) / band);
      if (r < 0 || r >= rows) continue;
      for (let c = Math.max(0, Math.floor(a / bin)); c <= Math.min(cols - 1, Math.floor(b / bin)); c++) count[r * cols + c]!++;
    }
    const slatted = new Uint8Array(cols * rows);
    // Three strokes in a 30 cm band: slats at 10 cm. Stone courses at 20 with a doubled joint make two.
    const dense = new Uint8Array(cols * rows);
    for (let i = 0; i < dense.length; i++) dense[i] = count[i]! >= 3 ? 1 : 0;
    // Only a cell whose four neighbours are slatted too: a thin bridge of
    // dense strokes — a railing's rail, a doubled joint — no longer joins a
    // screen to what stands beside it. Each run is grown back by the cell.
    for (let i = 0; i < slatted.length; i++) {
      const c = i % cols;
      slatted[i] = dense[i] && c > 0 && c < cols - 1 && dense[i - 1] && dense[i + 1] && dense[i - cols] && dense[i + cols] ? 1 : 0;
    }
    const labels = textLines(sheet.g.texts).filter((l) => /מסתור|כביסה/.test(l.text));
    if (labels.length === 0) continue;
    // Runs of slatted cells.
    const seen = new Uint8Array(cols * rows);
    for (let start = 0; start < slatted.length; start++) {
      if (!slatted[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      let [c0, c1, r0, r1] = [cols, -1, rows, -1];
      let cells = 0;
      while (stack.length) {
        const i = stack.pop()!;
        const c = i % cols;
        const r = (i - c) / cols;
        cells++;
        c0 = Math.min(c0, c);
        c1 = Math.max(c1, c);
        r0 = Math.min(r0, r);
        r1 = Math.max(r1, r);
        for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
          if (j < 0 || j >= slatted.length || seen[j] || !slatted[j]) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      const widthM = (c1 - c0 + 1) * 0.1;
      const heightM = (r1 - r0 + 1) * 0.3;
      // A screen is a panel, and mostly slatted: not a stray pair of lines.
      if (widthM < 0.6 || heightM < 1 || cells < 0.6 * (c1 - c0 + 1) * (r1 - r0 + 1)) continue;
      c0 -= 1;
      c1 += 1;
      r0 = Math.max(0, r0 - 1);
      r1 += 1;
      const px0 = c0 * bin;
      const px1 = (c1 + 1) * bin;
      const yTop = sheet.zeroY - (r1 + 1) * band;
      const yBottom = sheet.zeroY - r0 * band;
      // A strip at the building's very edge is a side face's screen seen
      // edge-on, which that side's elevation stands up already.
      const edge = 1.2 * upm;
      if (sheet.left != null && sheet.right != null && (px1 < sheet.left + edge || px0 > sheet.right - edge)) continue;
      const named = labels.some((l) => l.x > px0 - upm && l.x < px1 + upm && l.y > yTop - upm && l.y < yBottom + upm);
      if (!named) continue;
      // Back onto the building: across by its elevation's middle, up from ±0.00.
      const centreAlong = face.alongX ? centre.x : centre.z;
      const a = [px0, px1].map((p) => centreAlong + (p - sheet.centreX) / (face.sign * upm)).sort((p, q) => p - q) as [number, number];
      const h0 = r0 * 0.3;
      const h1 = (r1 + 1) * 0.3;
      // Flush with the outermost face behind it, over the storeys it covers.
      const normal = face.alongX ? face.normal.z : face.normal.x;
      let plane = -Infinity;
      for (const f of floors) {
        if (f.roof || f.level + f.height < h0 || f.level > h1) continue;
        for (let t = a[0]; t <= a[1]; t += 0.25) {
          for (const v of crossings(f.outline, face.alongX, t)) plane = Math.max(plane, v * normal);
        }
      }
      if (!Number.isFinite(plane)) continue;
      const at = plane * normal + normal * 0.06;
      const len = a[1] - a[0];
      const mid = (a[0] + a[1]) / 2;
      const box = (along: number, alongSize: number, y: number, ySize: number, depth: number, tag: string): Primitive => ({
        type: "box",
        centre: face.alongX ? { x: along, y, z: at } : { x: at, y, z: along },
        size: face.alongX ? { x: alongSize, y: ySize, z: depth } : { x: depth, y: ySize, z: alongSize },
        material: "louvre",
        tag,
      });
      // Its frame, and its slats.
      out.push(box(a[0] + 0.03, 0.06, (h0 + h1) / 2, h1 - h0, 0.08, "facade:screen"));
      out.push(box(a[1] - 0.03, 0.06, (h0 + h1) / 2, h1 - h0, 0.08, "facade:screen"));
      for (let y = h0 + 0.05; y < h1; y += 0.1) out.push(box(mid, len - 0.12, y, 0.035, 0.06, "facade:screen"));
    }
  }
  return out;
}

/** Where a line of constant x (or z) crosses an outline: the other coordinate at each crossing. */
function crossings(ring: Outline, alongX: boolean, t: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const [ua, va, ub, vb] = alongX ? [ax, az, bx, bz] : [az, ax, bz, bx];
    if ((ua <= t && ub > t) || (ub <= t && ua > t)) out.push(va + ((t - ua) / (ub - ua)) * (vb - va));
  }
  return out;
}
