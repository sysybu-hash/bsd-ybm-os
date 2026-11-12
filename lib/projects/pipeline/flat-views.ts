/**
 * Interior cameras for a flat read from a DXF: chosen by sightline, not by a room's box centre.
 * Moved from scripts/_unit-views.mts (never committed) so the site and the scripts stand them up alike (rule 13.1).
 */
import type { FlatScene, SceneBox, SceneRoom } from "@/lib/projects/scene3d/types";

type P = { x: number; z: number };
type Box = { x0: number; x1: number; z0: number; z1: number };

const EYE = 1.5;
const inRects = (rooms: SceneRoom[], p: P) => rooms.some((r) => r.rects.some((q) => p.x >= q.x && p.x <= q.x + q.w && p.z >= q.z && p.z <= q.z + q.d));

function blockers(scene: FlatScene, glassBlocks: boolean): Box[] {
  return scene.meshes
    .filter((m) => {
      const y0 = m.centre.y - m.size.y / 2;
      const y1 = m.centre.y + m.size.y / 2;
      if (m.kind === "glazing" || m.kind === "frame") return glassBlocks && y0 < 1.3 && y1 > 1.3;
      if (m.kind === "wall" || m.kind === "furniture" || m.kind === "wallSill" || m.kind === "wallHead") return y0 < 1.35 && y1 > 1.35;
      return false;
    })
    .map((m) => ({ x0: m.centre.x - m.size.x / 2, x1: m.centre.x + m.size.x / 2, z0: m.centre.z - m.size.z / 2, z1: m.centre.z + m.size.z / 2 }));
}

const hit = (bs: Box[], p: P, pad = 0) => bs.some((b) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad);

function ray(bs: Box[], from: P, dir: number, max = 12): number {
  const step = 0.05;
  for (let t = 0.2; t < max; t += step) if (hit(bs, { x: from.x + Math.cos(dir) * t, z: from.z + Math.sin(dir) * t })) return t;
  return max;
}

function candidates(scene: FlatScene, rooms: SceneRoom[], bs: Box[]): P[] {
  const out: P[] = [];
  for (const r of rooms)
    for (const q of r.rects)
      for (let x = q.x + 0.1; x < q.x + q.w; x += 0.2)
        for (let z = q.z + 0.1; z < q.z + q.d; z += 0.2) {
          const p = { x, z };
          if (!hit(bs, p, 0.45) && inRects(rooms, p)) out.push(p);
        }
  return out;
}

export type UnitView = { id: string; title: string; position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fovDeg: number };

/** Standing in `rooms`, back near a wall, looking the longest open way; `toward` pulls the look at a point. */
export function sightView(scene: FlatScene, id: string, title: string, rooms: SceneRoom[], opts: { toward?: P; glassBlocks?: boolean; fovDeg?: number } = {}): UnitView | null {
  const bs = blockers(scene, opts.glassBlocks ?? true);
  // Low pieces too — a worktop a metre ahead fills the bottom of the frame.
  const low = scene.meshes
    .filter((m) => m.kind === "furniture" && m.centre.y + m.size.y / 2 > 0.6)
    .map((m) => ({ x0: m.centre.x - m.size.x / 2, x1: m.centre.x + m.size.x / 2, z0: m.centre.z - m.size.z / 2, z1: m.centre.z + m.size.z / 2 }));
  const fov = opts.fovDeg ?? 70;
  const half = ((fov / 2) * Math.PI) / 180;
  const windows = scene.openings.filter((o) => o.exterior && o.kind !== "door");
  let best: { p: P; dir: number; score: number; len: number } | null = null;
  for (const p of candidates(scene, rooms, bs)) {
    for (let k = 0; k < 24; k++) {
      let dir = (k / 24) * Math.PI * 2;
      if (opts.toward) {
        dir = Math.atan2(opts.toward.z - p.z, opts.toward.x - p.x);
        if (k > 0) break;
      }
      const behind = ray(bs, p, dir + Math.PI, 3);
      if (behind > 1.8) continue; // back to a wall, as a photographer stands
      let sum = 0;
      let minLen = Infinity;
      for (let j = -3; j <= 3; j++) {
        const len = ray(bs, p, dir + (j / 3) * half * 0.8);
        sum += Math.min(len, 9);
        minLen = Math.min(minLen, len);
      }
      const centre = ray(bs, p, dir);
      if (centre < 2.5) continue;
      if (ray(low, p, dir, 2) < 1.6 || ray(low, p, dir - half * 0.5, 2) < 1.2 || ray(low, p, dir + half * 0.5, 2) < 1.2) continue;
      let score = sum / 7 + Math.min(minLen, 3);
      for (const o of windows) {
        const a = Math.atan2(o.centre.z - p.z, o.centre.x - p.x);
        const off = Math.abs(Math.atan2(Math.sin(a - dir), Math.cos(a - dir)));
        if (off < half * 0.85 && Math.hypot(o.centre.x - p.x, o.centre.z - p.z) < 9) score += 0.8;
      }
      if (opts.toward) {
        const d = Math.hypot(opts.toward.x - p.x, opts.toward.z - p.z);
        if (centre < d - 0.3) continue; // the point must be in sight
        // And the frame round it clear for a couple of metres: no door leaf filling one side.
        let clear = true;
        for (const j of [-2, -1, 1, 2]) if (ray(bs, p, dir + (j / 2) * half * 0.6, 2.5) < Math.min(d, 2.2)) clear = false;
        if (!clear) continue;
        score += Math.min(d, 6);
      }
      if (!best || score > best.score) best = { p, dir, score, len: centre };
    }
  }
  if (!best) return null;
  const far = Math.min(best.len, 6);
  return {
    id,
    title,
    position: { x: best.p.x, y: EYE, z: best.p.z },
    target: { x: best.p.x + Math.cos(best.dir) * far, y: 1.05, z: best.p.z + Math.sin(best.dir) * far },
    fovDeg: fov,
  };
}

/** Kitchen islands — a worktop standing free of every wall — 10 cm wider each way; its stools and pendants stand within its reach. */
function islands(scene: FlatScene): Array<{ x0: number; x1: number; z0: number; z1: number }> {
  const walls = scene.meshes.filter((m) => m.kind === "wall");
  const near = (a: SceneBox, b: SceneBox, pad: number) =>
    Math.abs(a.centre.x - b.centre.x) <= (a.size.x + b.size.x) / 2 + pad && Math.abs(a.centre.z - b.centre.z) <= (a.size.z + b.size.z) / 2 + pad;
  return scene.meshes
    .filter((m) => m.kind === "furniture" && m.sourceId.endsWith("/worktop") && Math.max(m.size.x, m.size.z) >= 1.2 && !walls.some((w) => near(m, w, 0.15)))
    .map((m) => ({ x0: m.centre.x - m.size.x / 2 - 0.1, x1: m.centre.x + m.size.x / 2 + 0.1, z0: m.centre.z - m.size.z / 2 - 0.1, z1: m.centre.z + m.size.z / 2 + 0.1 }));
}

/**
 * Turned, as little as it takes, to hold each box whole in the 16:10 frame: the living view cut 14's island,
 * so it showed two of its three pendants and three of its four stools, and the kitchen view all of them.
 */
function holdWhole(view: UnitView, boxes: Array<{ x0: number; x1: number; z0: number; z1: number }>): UnitView {
  const half = Math.atan(Math.tan((view.fovDeg * Math.PI) / 360) * 1.6) - (4 * Math.PI) / 180;
  const dir = Math.atan2(view.target.z - view.position.z, view.target.x - view.position.x);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const rel = boxes.flatMap((b) =>
    [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].map(([x, z]) => wrap(Math.atan2(z! - view.position.z, x! - view.position.x) - dir)),
  );
  if (!rel.length) return view;
  const lo = Math.min(...rel);
  const hi = Math.max(...rel);
  if (hi - lo > 2 * half) return view;
  const turn = hi > half ? hi - half : lo < -half ? lo + half : 0;
  if (!turn) return view;
  const far = Math.hypot(view.target.x - view.position.x, view.target.z - view.position.z);
  return { ...view, target: { ...view.target, x: view.position.x + Math.cos(dir + turn) * far, z: view.position.z + Math.sin(dir + turn) * far } };
}

export function unitInteriorViews(scene: FlatScene): UnitView[] {
  const byKind = (k: SceneRoom["kind"]) => scene.rooms.filter((r) => r.kind === k).sort((a, b) => b.areaM2 - a.areaM2);
  const living = [...byKind("living"), ...byKind("kitchen")];
  const out: UnitView[] = [];
  const lv = sightView(scene, "living", "סלון", living, { fovDeg: 72 });
  if (lv) out.push(holdWhole(lv, islands(scene)));
  const kitchenPieces = scene.meshes.filter((m) => m.kind === "furniture" && byKind("kitchen").some((r) => inRects([r], { x: m.centre.x, z: m.centre.z })));
  if (kitchenPieces.length) {
    const c = { x: kitchenPieces.reduce((s, m) => s + m.centre.x, 0) / kitchenPieces.length, z: kitchenPieces.reduce((s, m) => s + m.centre.z, 0) / kitchenPieces.length };
    const kv = sightView(scene, "kitchen", "מטבח", living, { toward: c, fovDeg: 72 });
    if (kv) out.push(kv);
  }
  let tv: ReturnType<typeof sightView> | undefined;
  const terraces = scene.meshes.filter((m) => m.kind === "terrace").sort((a, b) => b.size.x * b.size.z - a.size.x * a.size.z);
  // The balcony the living room opens on, when there is one.
  const byLiving = (m: (typeof terraces)[number]) =>
    living.some((r) => r.rects.some((q) => Math.max(q.x - m.centre.x, m.centre.x - (q.x + q.w), 0) + Math.max(q.z - m.centre.z, m.centre.z - (q.z + q.d), 0) < 2));
  const t = terraces.find(byLiving) ?? terraces[0];
  if (t) {
    // From the living room, out through its door: a bedroom's window is a view of the balcony, not the balcony.
    tv =
      sightView(scene, "balcony", "מרפסת", living, { toward: { x: t.centre.x, z: t.centre.z }, glassBlocks: false, fovDeg: 70 }) ??
      sightView(scene, "balcony", "מרפסת", byKind("bedroom"), { toward: { x: t.centre.x, z: t.centre.z }, glassBlocks: false, fovDeg: 70 });
  }
  // A bedroom is shown by its beds: from across the room, looking at them, not from behind a headboard.
  // Not the room the balcony is seen from, when another bedroom has beds to show: flat 16 gave both views to one room.
  const balconyRoom = tv ? byKind("bedroom").find((r) => inRects([r], { x: tv!.position.x, z: tv!.position.z })) : undefined;
  const bedrooms = byKind("bedroom");
  for (const bed of [...bedrooms.filter((r) => r !== balconyRoom), ...bedrooms.filter((r) => r === balconyRoom)]) {
    const beds = scene.meshes.filter((m) => /\/mattress$/.test(m.sourceId) && inRects([bed], { x: m.centre.x, z: m.centre.z }));
    if (!beds.length) continue;
    const c = { x: beds.reduce((s, m) => s + m.centre.x, 0) / beds.length, z: beds.reduce((s, m) => s + m.centre.z, 0) / beds.length };
    const bv = sightView(scene, "bedroom", bed.name, [bed], { toward: c, fovDeg: 78 });
    if (bv) {
      out.push(bv);
      break;
    }
  }
  if (tv) out.push(tv);
  return out;
}
