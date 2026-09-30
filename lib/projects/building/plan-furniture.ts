import type { PdfPage } from "@/lib/projects/building/pdf-paths";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { dilate, drawLine, emptyMask, label } from "@/lib/projects/building/raster";

/**
 * The furniture a floor plan draws, as items: each a cluster of the fine
 * pen's strokes that touch one another, with the box that holds it turned to
 * its own axis — a desk set at an angle in a workroom is still a desk.
 *
 * A plan's fine pen also draws the grid axes, the dimension chains and their
 * figures. The axes and chains are long; the figures stand along the walls.
 * So strokes over 2.6 m are left out, and a small cluster hugging a wall is
 * taken for a figure, not a stool.
 */
export type PlanItem = {
  /** Centre, metres in the plan frame. */
  x: number;
  y: number;
  /** Long and short side of the turned box, metres, and the long side's angle (radians). */
  length: number;
  width: number;
  angle: number;
  /** How round it is: its outline's closeness to a circle, 0–1. */
  roundness: number;
  /** Strokes in it. */
  strokes: number;
};

export function readPlanFurniture(
  page: PdfPage,
  walls: PlanWalls,
  options: { pens: Array<{ colour: number; widths: number[] }>; maxStrokeM?: number },
): PlanItem[] {
  const { box, unitsPerMetre: upm, cm } = walls;
  const k = 100 / upm / cm;
  const { cols, rows } = walls.mask;
  const maxStroke = (options.maxStrokeM ?? 6) * upm;
  const ink = emptyMask(cols, rows);
  // A wall's own outline and hatch are drawn in these pens too; a stroke
  // that runs inside a wall (or along its face) is the wall's.
  const wallish = dilate(walls.mask, 2);
  const inWall = (px: number, py: number) => {
    const x = Math.round(px);
    const y = Math.round(py);
    return x >= 0 && y >= 0 && x < cols && y < rows && wallish.data[y * cols + x] === 1;
  };
  const accepts = (colour: number | null, width: number) =>
    options.pens.some((p) => p.colour === colour && p.widths.some((w) => Math.abs(w - width) < 0.02));
  for (const path of page.paths) {
    if (!path.stroked || !accepts(path.stroke, Math.round(path.lineWidth * 100) / 100)) continue;
    for (const ring of path.rings) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1]!;
        const [bx, by] = ring[i]!;
        if (Math.hypot(bx - ax, by - ay) > maxStroke) continue;
        const px1 = (ax - box.x) * k;
        const py1 = (ay - box.y) * k;
        const px2 = (bx - box.x) * k;
        const py2 = (by - box.y) * k;
        if ([px1, px2].every((v) => v < 0 || v >= cols) || [py1, py2].every((v) => v < 0 || v >= rows)) continue;
        if (inWall((px1 + px2) / 2, (py1 + py2) / 2) && inWall(px1, py1) && inWall(px2, py2)) continue;
        drawLine(ink, px1, py1, px2, py2);
      }
    }
  }
  // Strokes of one piece touch or all but touch; the gap between a chair and
  // its table is wider than 4 cm.
  const joined = dilate(ink, 1);
  const parts = label(joined, 1);
  const members = new Map<number, number[]>();
  for (let i = 0; i < ink.data.length; i++) {
    if (!ink.data[i]) continue;
    const id = parts.ids[i]!;
    const list = members.get(id);
    if (list) list.push(i);
    else members.set(id, [i]);
  }
  const m = cm / 100;
  const nearWall = (x: number, y: number, r: number) => {
    const px = Math.round(x / m);
    const py = Math.round(y / m);
    const rp = Math.round(r / m);
    for (let dy = -rp; dy <= rp; dy += 2) {
      for (let dx = -rp; dx <= rp; dx += 2) {
        const qx = px + dx;
        const qy = py + dy;
        if (qx >= 0 && qy >= 0 && qx < cols && qy < rows && walls.mask.data[qy * cols + qx]) return true;
      }
    }
    return false;
  };

  const items: PlanItem[] = [];
  for (const [, pix] of members) {
    if (pix.length < 12) continue;
    // Principal axes of the ink.
    let sx = 0;
    let sy = 0;
    for (const i of pix) {
      sx += i % cols;
      sy += Math.floor(i / cols);
    }
    const mx = sx / pix.length;
    const my = sy / pix.length;
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (const i of pix) {
      const dx = (i % cols) - mx;
      const dy = Math.floor(i / cols) - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
    let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    // Snap to the plan's axes when within 6°: most furniture is square to it.
    for (const snap of [0, Math.PI / 2, -Math.PI / 2]) if (Math.abs(angle - snap) < 0.1) angle = snap;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const i of pix) {
      const dx = (i % cols) - mx;
      const dy = Math.floor(i / cols) - my;
      const u = dx * ca + dy * sa;
      const v = -dx * sa + dy * ca;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const uc = (u0 + u1) / 2;
    const vc = (v0 + v1) / 2;
    const x = (mx + uc * ca - vc * sa) * m;
    const y = (my + uc * sa + vc * ca) * m;
    let length = (u1 - u0 + 1) * m;
    let width = (v1 - v0 + 1) * m;
    let a = angle;
    if (width > length) {
      [length, width] = [width, length];
      a += Math.PI / 2;
    }
    if (length < 0.25 || length > 14 || width < 0.12) continue;
    // A figure of a dimension: small, and against a wall.
    if (length < 0.7 && nearWall(x, y, 0.35)) continue;
    // Roundness: how evenly the ink sits from the centre.
    let rs = 0;
    let rs2 = 0;
    for (const i of pix) {
      const r = Math.hypot((i % cols) - (x / m), Math.floor(i / cols) - (y / m));
      rs += r;
      rs2 += r * r;
    }
    const mean = rs / pix.length;
    const sd = Math.sqrt(Math.max(0, rs2 / pix.length - mean * mean));
    items.push({ x, y, length, width, angle: a, roundness: Math.max(0, 1 - sd / (mean || 1)), strokes: pix.length });
  }
  return items;
}
