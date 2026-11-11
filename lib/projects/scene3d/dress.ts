import type { FlatScene, MaterialId, SceneBox, SceneLight, SceneRoom, SceneShape } from "@/lib/projects/scene3d/types";

/**
 * Dressing a measured flat for a sales still: curtains at its windows, pendants
 * over its dining table, a lamp by each bed, art on the wall a sofa or a bed
 * stands against, a plant by the living room's glass, a vase on the table.
 *
 * Staging, not architecture: every piece is placed from something the reading
 * measured (an opening, a table, a bed, a sofa) and only where its footprint is
 * free — nothing stands in a wall, a counter or a door's swing it can see.
 */

type Box = { x0: number; x1: number; z0: number; z1: number };

const SOLID = new Set<SceneBox["kind"]>(["wall", "wallHead", "wallSill", "furniture", "prop", "railing", "glazing", "frame"]);

function footprint(m: SceneBox): Box {
  return { x0: m.centre.x - m.size.x / 2, x1: m.centre.x + m.size.x / 2, z0: m.centre.z - m.size.z / 2, z1: m.centre.z + m.size.z / 2 };
}

function overlaps(a: Box, b: Box, gap = 0): boolean {
  return a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.z0 < b.z1 + gap && a.z1 > b.z0 - gap;
}

function roomAt(rooms: SceneRoom[], x: number, z: number): SceneRoom | undefined {
  return rooms.find((r) => r.rects.some((q) => x >= q.x && x <= q.x + q.w && z >= q.z && z <= q.z + q.d));
}

export function dressFlat(scene: FlatScene): { meshes: SceneBox[]; lights: SceneLight[] } {
  const meshes: SceneBox[] = [];
  const lights: SceneLight[] = [];
  const taken = scene.meshes.filter((m) => SOLID.has(m.kind)).map(footprint);
  const free = (b: Box, gap = 0.02) => !taken.some((t) => overlaps(b, t, gap)) && roomAt(scene.rooms, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) != null;
  const add = (id: string, material: MaterialId, c: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }, extra: { shape?: SceneShape; round?: number; kind?: SceneBox["kind"] } = {}) => {
    meshes.push({ kind: extra.kind ?? "prop", material, centre: c, size: s, sourceId: id, ...(extra.shape ? { shape: extra.shape } : {}), ...(extra.round ? { round: extra.round } : {}) });
  };
  const claim = (b: Box) => taken.push(b);
  // What stands on the floor: a curtain hangs in front of the window's own frame, not through a counter.
  const standing = scene.meshes.filter((m) => m.kind === "furniture" || m.kind === "prop").map(footprint);
  const parts = (id: string) => scene.meshes.filter((m) => m.sourceId.startsWith(`${id}/`));
  const pieces = [...new Set(scene.meshes.filter((m) => m.kind === "furniture" && m.sourceId.startsWith("furniture:")).map((m) => m.sourceId.split("/")[0]!))];
  const wallBoxes = scene.meshes.filter((m) => m.kind === "wall" || m.kind === "wallHead").map(footprint);
  // From a point, the first wall along a direction within reach: where a picture hangs.
  const wallAlong = (x: number, z: number, dx: number, dz: number, reach = 0.9): number | null => {
    for (let t = 0; t <= reach; t += 0.01) {
      const px = x + dx * t;
      const pz = z + dz * t;
      if (wallBoxes.some((b) => px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1)) return t;
    }
    return null;
  };

  // --- Curtains: a pair at each window or slider of a living room or bedroom, pleated, floor to ceiling, stacked beside the glass.
  for (const o of scene.openings) {
    if (!o.exterior || (o.kind !== "window" && o.kind !== "slider")) continue;
    const alongX = o.size.x >= o.size.z;
    const thick = alongX ? o.size.z : o.size.x;
    const lo = (alongX ? o.centre.x : o.centre.z) - (alongX ? o.size.x : o.size.z) / 2;
    const hi = lo + (alongX ? o.size.x : o.size.z);
    for (const sign of [-1, 1]) {
      // The room in front of the glass, a few steps in: an open kitchen's strip of floor runs right along a living room's slider.
      const room = [0.3, 0.6, 1.0]
        .map((step) => {
          const probe = (alongX ? o.centre.z : o.centre.x) + sign * (thick / 2 + step);
          return alongX ? roomAt(scene.rooms, o.centre.x, probe) : roomAt(scene.rooms, probe, o.centre.z);
        })
        .find((r) => r != null);
      if (!room || !["living", "bedroom", "mmd", "kitchen"].includes(room.kind ?? "")) continue;
      const face = (alongX ? o.centre.z : o.centre.x) + sign * (thick / 2 + 0.07);
      const pw = Math.min(0.5, (hi - lo) * 0.28) + 0.1;
      for (const [a, b] of [[lo - 0.12, lo - 0.12 + pw], [hi + 0.12 - pw, hi + 0.12]] as const) {
        const box: Box = alongX ? { x0: a, x1: b, z0: face - 0.06, z1: face + 0.06 } : { x0: face - 0.06, x1: face + 0.06, z0: a, z1: b };
        // Not through a counter or a wardrobe standing at the glass.
        if (standing.some((t) => overlaps(box, t, -0.01))) continue;
        const folds = 6;
        for (let i = 0; i < folds; i++) {
          const f0 = a + ((b - a) * i) / folds;
          const fw = (b - a) / folds;
          const depth = i % 2 ? 0.05 : 0.09;
          const off = sign * (i % 2 ? 0.0 : 0.02);
          const c = alongX ? { x: f0 + fw / 2, y: 1.33, z: face + off } : { x: face + off, y: 1.33, z: f0 + fw / 2 };
          const s = alongX ? { x: fw + 0.012, y: 2.62, z: depth } : { x: depth, y: 2.62, z: fw + 0.012 };
          add(`prop:curtain:${o.id}`, "linen", c, s, { round: 0.02 });
        }
        claim(box);
      }
    }
  }

  // --- A kitchen island — a worktop standing free of every wall — gets a row of pendants of the dining table's family,
  // one to about 80 cm of it, low enough to be seen over it: two set high read, from the living room, as one over the back counter.
  const clearOfWalls = (m: SceneBox) => !wallBoxes.some((w) => overlaps(footprint(m), w, 0.15));
  for (const top of scene.meshes.filter((m) => m.kind === "furniture" && m.sourceId.endsWith("/worktop") && Math.max(m.size.x, m.size.z) >= 1.2 && clearOfWalls(m))) {
    const id = top.sourceId.split("/")[0]!;
    const alongX = top.size.x >= top.size.z;
    const len = Math.max(top.size.x, top.size.z);
    const n = Math.max(2, Math.round(len / 0.8));
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n - 0.5) * len;
      const x = top.centre.x + (alongX ? t : 0);
      const z = top.centre.z + (alongX ? 0 : t);
      const y = top.centre.y + 0.72;
      add(`prop:pendant:${id}:${k}`, "metal", { x, y, z }, { x: 0.26, y: 0.18, z: 0.26 }, {
        shape: { kind: "lathe", profile: [[0.13, -0.09], [0.125, -0.05], [0.1, 0.02], [0.055, 0.07], [0.012, 0.09]], segments: 40 },
      });
      add(`prop:pendant:${id}:${k}/bulb`, "lamp", { x, y: y - 0.05, z }, { x: 0.08, y: 0.08, z: 0.08 }, { shape: { kind: "ellipsoid", segments: 16 } });
      add(`prop:pendant:${id}:${k}/cord`, "steel", { x, y: (y + 0.09 + 2.7) / 2, z }, { x: 0.008, y: 2.7 - y - 0.09, z: 0.008 });
      lights.push({ id: `light:pendant@${id}:${k}`, kind: "pendant", position: { x, y: y - 0.1, z }, kelvin: 2700, intensity: 0.7, anchorId: top.sourceId });
    }
  }

  // --- The dining table: three pendants over its length, a vase and a bowl on it.
  for (const id of pieces) {
    const top = parts(id).find((m) => m.sourceId.endsWith("/top") && Math.max(m.size.x, m.size.z) >= 1.4 && m.centre.y > 0.6);
    if (!top || !parts(id).some((m) => /\/(frame|leg)$/.test(m.sourceId))) continue;
    const alongX = top.size.x >= top.size.z;
    const len = Math.max(top.size.x, top.size.z);
    for (const k of [-1, 0, 1]) {
      const t = k * len * 0.3;
      const x = top.centre.x + (alongX ? t : 0);
      const z = top.centre.z + (alongX ? 0 : t);
      const y = top.centre.y + 0.85;
      add(`prop:pendant:${id}:${k}`, "metal", { x, y, z }, { x: 0.34, y: 0.2, z: 0.34 }, {
        shape: { kind: "lathe", profile: [[0.17, -0.1], [0.165, -0.06], [0.13, 0.02], [0.07, 0.08], [0.015, 0.1]], segments: 40 },
      });
      add(`prop:pendant:${id}:${k}/bulb`, "lamp", { x, y: y - 0.06, z }, { x: 0.09, y: 0.09, z: 0.09 }, { shape: { kind: "ellipsoid", segments: 16 } });
      add(`prop:pendant:${id}:${k}/cord`, "steel", { x, y: (y + 0.1 + 2.7) / 2, z }, { x: 0.008, y: 2.7 - y - 0.1, z: 0.008 });
      lights.push({ id: `light:pendant@${id}:${k}`, kind: "pendant", position: { x, y: y - 0.12, z }, kelvin: 2700, intensity: 0.9, anchorId: top.sourceId });
    }
    const vx = top.centre.x + (alongX ? -len * 0.12 : 0);
    const vz = top.centre.z + (alongX ? 0 : -len * 0.12);
    const ty = top.centre.y + top.size.y / 2;
    add(`prop:vase:${id}`, "ceramic", { x: vx, y: ty + 0.15, z: vz }, { x: 0.16, y: 0.3, z: 0.16 }, {
      shape: { kind: "lathe", profile: [[0.05, -0.15], [0.08, -0.08], [0.075, 0.02], [0.035, 0.11], [0.04, 0.15]], segments: 32 },
    });
    add(`prop:bowl:${id}`, "timber", { x: top.centre.x + (alongX ? len * 0.12 : 0), y: ty + 0.04, z: top.centre.z + (alongX ? 0 : len * 0.12) }, { x: 0.36, y: 0.08, z: 0.36 }, {
      shape: { kind: "lathe", profile: [[0.06, -0.04], [0.14, -0.02], [0.18, 0.04], [0.17, 0.04], [0.13, -0.01], [0.0, -0.01]], segments: 40 },
    });
  }

  // --- A bed: a night table and lamp on the free side of its head, and art over the headboard.
  for (const id of pieces) {
    const head = parts(id).find((m) => m.sourceId.endsWith("/headboard"));
    const mattress = parts(id).find((m) => m.sourceId.endsWith("/mattress"));
    if (!head || !mattress) continue;
    const alongX = head.size.x >= head.size.z;
    const hl = alongX ? head.size.x : head.size.z;
    // Towards the foot of the bed, from the headboard.
    const fx = alongX ? 0 : Math.sign(mattress.centre.x - head.centre.x);
    const fz = alongX ? Math.sign(mattress.centre.z - head.centre.z) : 0;
    for (const side of [-1, 1]) {
      const ox = alongX ? side * (hl / 2 + 0.3) : 0;
      const oz = alongX ? 0 : side * (hl / 2 + 0.3);
      const cx = head.centre.x + ox + fx * 0.25;
      const cz = head.centre.z + oz + fz * 0.25;
      const box: Box = { x0: cx - 0.22, x1: cx + 0.22, z0: cz - 0.2, z1: cz + 0.2 };
      if (!free(box)) continue;
      // Not in a doorway: the way out to a balcony stays clear.
      if (scene.openings.some((o) => o.kind !== "window" && overlaps(box, { x0: o.centre.x - o.size.x / 2, x1: o.centre.x + o.size.x / 2, z0: o.centre.z - o.size.z / 2, z1: o.centre.z + o.size.z / 2 }, 0.6))) continue;
      claim(box);
      add(`prop:nightstand:${id}`, "timber", { x: cx, y: 0.26, z: cz }, { x: 0.44, y: 0.52, z: 0.4 }, { round: 0.012 });
      add(`prop:lamp:${id}/base`, "ceramic", { x: cx, y: 0.65, z: cz }, { x: 0.14, y: 0.26, z: 0.14 }, {
        shape: { kind: "lathe", profile: [[0.05, -0.13], [0.07, -0.06], [0.06, 0.06], [0.015, 0.11], [0.012, 0.13]], segments: 28 },
      });
      add(`prop:lamp:${id}/shade`, "linen", { x: cx, y: 0.88, z: cz }, { x: 0.32, y: 0.22, z: 0.32 }, {
        shape: { kind: "lathe", profile: [[0.16, -0.11], [0.12, 0.11]], segments: 36 },
      });
      lights.push({ id: `light:bedside@${id}`, kind: "lamp", position: { x: cx, y: 0.86, z: cz }, kelvin: 2700, intensity: 0.45, anchorId: head.sourceId });
      break;
    }
    const back = wallAlong(head.centre.x, head.centre.z, -fx, -fz);
    if (back != null) {
      const t = back - 0.02;
      const w = Math.min(1.1, hl * 0.9);
      hangArt(`prop:art:${id}`, head.centre.x - fx * t, head.centre.z - fz * t, alongX, w, 0.7, 1.55);
    }
  }

  // --- Art over a sofa: on the wall at its back.
  for (const id of pieces) {
    const back = parts(id).find((m) => m.sourceId.endsWith("/back"));
    const arms = parts(id).filter((m) => m.sourceId.endsWith("/arm"));
    if (!back || arms.length < 2) continue;
    const all = parts(id);
    const cx = all.reduce((s, m) => s + m.centre.x, 0) / all.length;
    const cz = all.reduce((s, m) => s + m.centre.z, 0) / all.length;
    const alongX = back.size.x >= back.size.z;
    const dx = alongX ? 0 : Math.sign(back.centre.x - cx);
    const dz = alongX ? Math.sign(back.centre.z - cz) : 0;
    const hit = wallAlong(back.centre.x, back.centre.z, dx, dz);
    if (hit == null) continue;
    const w = Math.min(1.4, (alongX ? back.size.x : back.size.z) * 0.75);
    hangArt(`prop:art:${id}`, back.centre.x + dx * (hit - 0.02), back.centre.z + dz * (hit - 0.02), alongX, w, 0.85, 1.6);
  }

  // --- A tall plant beside the living room's widest glass.
  {
    const glass = scene.openings
      .filter((o) => o.exterior && (o.kind === "slider" || o.kind === "window"))
      .sort((a, b) => Math.max(b.size.x, b.size.z) - Math.max(a.size.x, a.size.z));
    let placed = false;
    for (const o of glass) {
      if (placed) break;
      const alongX = o.size.x >= o.size.z;
      const thick = alongX ? o.size.z : o.size.x;
      const half = (alongX ? o.size.x : o.size.z) / 2;
      for (const sign of [-1, 1]) {
        if (placed) break;
        const n = (alongX ? o.centre.z : o.centre.x) + sign * (thick / 2 + 0.38);
        const room = alongX ? roomAt(scene.rooms, o.centre.x, n) : roomAt(scene.rooms, n, o.centre.z);
        if (room?.kind !== "living") continue;
        for (const end of [-1, 1]) {
          const a = (alongX ? o.centre.x : o.centre.z) + end * (half + 0.12);
          const x = alongX ? a : n;
          const z = alongX ? n : a;
          const box: Box = { x0: x - 0.22, x1: x + 0.22, z0: z - 0.22, z1: z + 0.22 };
          if (!free(box)) continue;
          claim(box);
          add("prop:plant/pot", "steel", { x, y: 0.24, z }, { x: 0.4, y: 0.48, z: 0.4 }, {
            shape: { kind: "lathe", profile: [[0.15, -0.24], [0.19, -0.18], [0.2, 0.22], [0.19, 0.24], [0.0, 0.24]], segments: 36 },
          });
          const leaves: Array<[number, number, number, number]> = [[0, 0.8, 0, 0.5], [0.08, 1.15, -0.05, 0.42], [-0.07, 1.4, 0.06, 0.34], [0.03, 1.62, 0, 0.24]];
          leaves.forEach(([lx, ly, lz, r], i) =>
            add(`prop:plant/leaves${i}`, "foliage", { x: x + lx, y: ly, z: z + lz }, { x: r, y: r * 0.9, z: r }, { shape: { kind: "ellipsoid", segments: 18 } }),
          );
          add("prop:plant/stem", "timber", { x, y: 0.75, z }, { x: 0.03, y: 0.6, z: 0.03 });
          placed = true;
          break;
        }
      }
    }
  }

  // --- Each balcony, lightly: a teak table for two where it is deep enough, and a low planter at each end, clear of its doors.
  const doorways = scene.openings
    .filter((o) => o.kind !== "window")
    // The way through a door: in front of it and behind, as wide as the door.
    .map((o) => {
      // A slider opens along its wall: a step's width in front of it is the way through.
      const reach = o.kind === "slider" ? 0.45 : 0.6;
      const ex = o.size.x >= o.size.z ? 0 : reach;
      const ez = o.size.x >= o.size.z ? reach : 0;
      return { x0: o.centre.x - o.size.x / 2 - ex, x1: o.centre.x + o.size.x / 2 + ex, z0: o.centre.z - o.size.z / 2 - ez, z1: o.centre.z + o.size.z / 2 + ez };
    });
  // A balcony is no room of the scene: its floor is the terrace's slab, each slab one piece of it.
  const slabs = scene.meshes.filter((m) => m.kind === "terrace" && m.size.y < 0.1 && !m.sourceId.includes("/"));
  const onSlab = (b: Box) => slabs.some((m) => { const f = footprint(m); return b.x0 >= f.x0 && b.x1 <= f.x1 && b.z0 >= f.z0 && b.z1 <= f.z1; });
  const clear = (b: Box) => onSlab(b) && !taken.some((t) => overlaps(b, t, 0.05)) && !doorways.some((d) => overlaps(b, d));
  for (const slab of slabs) {
    const room = { id: `${slab.sourceId}@${slab.centre.x.toFixed(2)},${slab.centre.z.toFixed(2)}` };
    const r = { x: slab.centre.x - slab.size.x / 2, z: slab.centre.z - slab.size.z / 2, w: slab.size.x, d: slab.size.z };
    if (Math.max(r.w, r.d) < 1.6 || Math.min(r.w, r.d) < 0.8) continue;
    const alongX = r.w >= r.d;
    const short = alongX ? r.d : r.w;
    const long = alongX ? r.w : r.d;
    const cx = r.x + r.w / 2;
    const cz = r.z + r.d / 2;
    const at = (u: number, v: number) => (alongX ? { x: cx + u, z: cz + v } : { x: cx + v, z: cz + u });
    const boxAt = (u: number, v: number, hu: number, hv: number): Box => {
      const c = at(u, v);
      return alongX ? { x0: c.x - hu, x1: c.x + hu, z0: c.z - hv, z1: c.z + hv } : { x0: c.x - hv, x1: c.x + hv, z0: c.z - hu, z1: c.z + hu };
    };
    let seated = false;
    if (short >= 0.95) {
      // Table and its two chairs along the balcony, at its middle or a step to either side.
      const reach = long / 2 - 0.7;
      const steps = Array.from({ length: Math.max(0, Math.floor(reach / 0.05)) + 1 }, (_, i) => i * 0.05);
      for (const u of steps.flatMap((q) => (q ? [q, -q] : [0]))) {
        const set = boxAt(u, 0, 0.69, 0.38);
        if (!clear(set)) continue;
        claim(set);
        const t = at(u, 0);
        add(`prop:balcony-table:${room.id}/top`, "timber", { x: t.x, y: 0.72, z: t.z }, { x: 0.56, y: 0.03, z: 0.56 }, { shape: { kind: "lathe", profile: [[0, -0.015], [0.28, -0.015], [0.28, 0.015], [0, 0.015]], segments: 40 } });
        add(`prop:balcony-table:${room.id}/stem`, "steel", { x: t.x, y: 0.36, z: t.z }, { x: 0.05, y: 0.7, z: 0.05 }, { shape: { kind: "lathe", profile: [[0.025, -0.35], [0.025, 0.35]], segments: 16 } });
        add(`prop:balcony-table:${room.id}/foot`, "steel", { x: t.x, y: 0.015, z: t.z }, { x: 0.42, y: 0.03, z: 0.42 }, { shape: { kind: "lathe", profile: [[0, -0.015], [0.21, -0.015], [0.21, 0.015], [0, 0.015]], segments: 32 } });
        for (const side of [-1, 1]) {
          const c = at(u + side * 0.46, 0);
          const back = at(u + side * 0.66, 0);
          add(`prop:balcony-chair:${room.id}:${side}/seat`, "timber", { x: c.x, y: 0.44, z: c.z }, { x: 0.44, y: 0.04, z: 0.44 }, { round: 0.01 });
          add(`prop:balcony-chair:${room.id}:${side}/frame`, "steel", { x: c.x, y: 0.21, z: c.z }, { x: 0.4, y: 0.42, z: 0.4 }, { round: 0.004 });
          add(`prop:balcony-chair:${room.id}:${side}/back`, "timber", { x: back.x, y: 0.68, z: back.z }, alongX ? { x: 0.04, y: 0.4, z: 0.44 } : { x: 0.44, y: 0.4, z: 0.04 }, { round: 0.01 });
        }
        seated = true;
        break;
      }
    }
    // Too narrow for the table beside its doors (14's kitchen balcony, sliders along its whole length):
    // a teak bench against the railing, facing the flat.
    if (!seated && long >= 2.4) {
      for (const v of [-(short / 2 - 0.3), short / 2 - 0.3]) {
        const b = boxAt(0, v, 0.62, 0.22);
        if (!clear(b)) continue;
        claim(b);
        const c = at(0, v);
        const seat = alongX ? { x: 1.2, y: 0.05, z: 0.4 } : { x: 0.4, y: 0.05, z: 1.2 };
        add(`prop:balcony-bench:${room.id}/seat`, "timber", { x: c.x, y: 0.44, z: c.z }, seat, { round: 0.01 });
        for (const k of [-1, 1]) {
          const l = at(k * 0.52, v);
          add(`prop:balcony-bench:${room.id}:${k}/leg`, "steel", { x: l.x, y: 0.21, z: l.z }, alongX ? { x: 0.04, y: 0.42, z: 0.36 } : { x: 0.36, y: 0.42, z: 0.04 }, { round: 0.004 });
        }
        const cushion = at(0, v);
        add(`prop:balcony-bench:${room.id}/cushion`, "upholstery", { x: cushion.x, y: 0.5, z: cushion.z }, alongX ? { x: 1.1, y: 0.07, z: 0.36 } : { x: 0.36, y: 0.07, z: 1.1 }, { round: 0.03 });
        break;
      }
    }
    // A planter at each end of the balcony, against its inner side — clear of the railing and its cap.
    for (const end of [-1, 1]) {
      const u = end * (long / 2 - 0.56);
      const v = -(short / 2 - 0.3);
      for (const side of [v, -v]) {
        const b = boxAt(u, side, 0.42, 0.18);
        if (!clear(b)) continue;
        claim(b);
        const p = at(u, side);
        add(`prop:planter:${room.id}:${end}/box`, "joinery", { x: p.x, y: 0.22, z: p.z }, alongX ? { x: 0.84, y: 0.44, z: 0.36 } : { x: 0.36, y: 0.44, z: 0.84 }, { round: 0.01 });
        const tufts: Array<[number, number, number]> = [[-0.26, 0.6, 0.24], [0, 0.7, 0.3], [0.26, 0.58, 0.22], [0.12, 0.92, 0.18]];
        tufts.forEach(([du, y, rr], i) => {
          const q = at(u + du, side);
          add(`prop:planter:${room.id}:${end}/leaves${i}`, "foliage", { x: q.x, y, z: q.z }, { x: rr * 1.4, y: rr * 1.3, z: rr * 1.4 }, { shape: { kind: "ellipsoid", segments: 16 } });
        });
        break;
      }
    }
  }

  return { meshes, lights };

  // A framed canvas on a wall: a walnut frame, a pale ground and two blocks of colour.
  function hangArt(id: string, x: number, z: number, alongX: boolean, w: number, h: number, y: number) {
    const d = 0.035;
    // Never over glass or a door: a picture on the window's wall stood in front of the window.
    const span: Box = alongX ? { x0: x - w / 2, x1: x + w / 2, z0: z - 0.4, z1: z + 0.4 } : { x0: x - 0.4, x1: x + 0.4, z0: z - w / 2, z1: z + w / 2 };
    if (scene.openings.some((o) => overlaps(span, { x0: o.centre.x - o.size.x / 2, x1: o.centre.x + o.size.x / 2, z0: o.centre.z - o.size.z / 2, z1: o.centre.z + o.size.z / 2 }, 0.05))) return;
    const at = (u: number, v: number, du: number, dv: number, dd: number, material: MaterialId, tag: string, push = 0) =>
      add(`${id}/${tag}`, material, alongX ? { x: x + u, y: y + v, z: z + push } : { x: x + push, y: y + v, z: z + u }, alongX ? { x: du, y: dv, z: dd } : { x: dd, y: dv, z: du });
    at(0, 0, w, h, d, "timber", "frame");
    at(0, 0, w - 0.06, h - 0.06, d + 0.004, "linen", "canvas");
    at(-w * 0.14, h * 0.06, w * 0.42, h * 0.5, d + 0.008, "upholstery", "field");
    at(w * 0.2, -h * 0.12, w * 0.16, h * 0.5, d + 0.01, "metal", "stripe");
  }
}
