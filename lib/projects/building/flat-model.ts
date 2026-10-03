import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import type { BuildingRenderPayload } from "@/lib/projects/building/render-page";
import { cutBox } from "@/lib/projects/scene3d/three-scene";
import type { FlatScene, SceneRoom } from "@/lib/projects/scene3d/types";
import { apartmentFinish, roomKindOf, stagedPlants } from "@/lib/projects/building/flat-finish";
import { WALL_HEIGHT_M } from "@/lib/projects/scene3d/standards";

/**
 * An apartment as the building renderer draws it.
 *
 * The flat's scene is measured once, by the flat engine; this only hands its
 * boxes to the renderer the exteriors are drawn with — the one that traces
 * light — and says where to stand. A doll's-house is the flat cut at a height,
 * cut here in the geometry rather than by a clipping plane, because the tracer
 * clips nothing; a room seen from inside gets its ceiling and its lights.
 */

const CEILING_T_M = 0.12;

export function flatToPrimitives(scene: FlatScene, options: { cutAboveM?: number; ceiling?: boolean } = {}): BuildingModel {
  const prims: Primitive[] = [];
  const kindOf = roomKindOf(scene);
  const cut = options.cutAboveM;
  for (const mesh of scene.meshes) {
    const kept = cut != null ? cutBox(mesh, cut) : mesh;
    if (!kept) continue;
    const finish = apartmentFinish(kept, kindOf);
    if (!finish) continue;
    prims.push({ type: "box", centre: kept.centre, size: kept.size, material: finish.material, tag: `${kept.kind}:${kept.sourceId}`, ...(finish.round ? { round: finish.round } : {}) });
    // A wall cut by the plane shows its section solid, as a plan draws it.
    const isWall = kept.kind === "wall" || kept.kind === "wallHead" || kept.kind === "wallSill" || kept.kind === "wallCap";
    if (cut != null && isWall && kept !== mesh && kept.size.y > 0.2) {
      prims.push({ type: "box", centre: { ...kept.centre, y: cut + 0.004 }, size: { x: kept.size.x + 0.002, y: 0.008, z: kept.size.z + 0.002 }, material: "poche", tag: "poche" });
    }
  }
  for (const p of stagedPlants(scene)) prims.push({ type: "plant", ...p, tag: "plant" });
  const { x, z, width, depth } = scene.extent;
  if (options.ceiling) {
    for (const room of scene.rooms) {
      if (room.kind === "balcony") continue;
      for (const r of room.rects) {
        prims.push({ type: "box", centre: { x: r.x + r.w / 2, y: WALL_HEIGHT_M + CEILING_T_M / 2, z: r.z + r.d / 2 }, size: { x: r.w + 0.02, y: CEILING_T_M, z: r.d + 0.02 }, material: "ceiling", tag: `ceiling:${room.id}` });
      }
      const big = largestRect(room);
      if (big && room.areaM2 > 2) {
        prims.push({ type: "box", centre: { x: big.x + big.w / 2, y: WALL_HEIGHT_M - 0.01, z: big.z + big.d / 2 }, size: { x: 0.5, y: 0.02, z: 0.5 }, material: "lightPanel", tag: `light:${room.id}` });
      }
    }
  } else {
    const span = Math.max(width, depth) * 6;
    prims.push({ type: "box", centre: { x: x + width / 2, y: -0.33, z: z + depth / 2 }, size: { x: span, y: 0.04, z: span }, material: "ceiling", tag: "table" });
  }
  return { name: "flat", primitives: prims, extent: { x, z, width, depth, yMin: 0, yMax: WALL_HEIGHT_M }, north: { x: 0, z: -1 } };
}

function largestRect(room: SceneRoom) {
  return [...room.rects].sort((a, b) => b.w * b.d - a.w * a.d)[0];
}

export type FlatView = { id: string; title: string; payload: Omit<BuildingRenderPayload, "model">; cutAboveM?: number; ceiling?: boolean };

/** The whole flat from above and in front, its walls cut at 1.1 m. */
export function dollhouseView(scene: FlatScene, widthPx = 2400): FlatView {
  const { x, z, width, depth } = scene.extent;
  const aspect = Math.min(1.8, Math.max(1.1, width / depth));
  const height = Math.round(widthPx / aspect);
  const pitch = (58 * Math.PI) / 180;
  const fov = 30;
  const t = Math.tan(((fov / 2) * Math.PI) / 180);
  const d = Math.max((depth / 2) / t + depth * 0.3, (width / 2) / (t * aspect) + depth * 0.3) * 1.08;
  const cx = x + width / 2;
  const cz = z + depth / 2;
  return {
    id: "dollhouse",
    title: "מבט על",
    cutAboveM: 1.1,
    payload: {
      width: widthPx,
      height,
      exposure: 0.62,
      ao: true,
      camera: { position: { x: cx, y: d * Math.sin(pitch), z: cz + d * Math.cos(pitch) }, target: { x: cx, y: 0.2, z: cz }, fovDeg: fov, studio: true },
      sun: { azimuthDeg: 215, elevationDeg: 62 },
    },
  };
}

/**
 * The rooms worth standing in — the living room and the largest bedroom —
 * each photographed from the corner that sees most of it, the windows in view.
 */
export function interiorViews(scene: FlatScene, widthPx = 2000): FlatView[] {
  const pick = (kind: SceneRoom["kind"]) => scene.rooms.filter((r) => r.kind === kind).sort((a, b) => b.areaM2 - a.areaM2)[0];
  const rooms = [pick("living"), pick("bedroom")].filter((r): r is SceneRoom => !!r);
  const furniture = scene.meshes.filter((m) => m.kind === "furniture");
  const out: FlatView[] = [];
  for (const room of rooms) {
    const r = largestRect(room);
    if (!r) continue;
    const inset = 0.4;
    const corners = [
      { x: r.x + inset, z: r.z + inset },
      { x: r.x + r.w - inset, z: r.z + inset },
      { x: r.x + inset, z: r.z + r.d - inset },
      { x: r.x + r.w - inset, z: r.z + r.d - inset },
    ];
    const centre = { x: room.bounds.x + room.bounds.w / 2, z: room.bounds.z + room.bounds.d / 2 };
    let best: { at: { x: number; z: number }; score: number } | null = null;
    for (const c of corners) {
      const blocked = furniture.some((f) => Math.abs(f.centre.x - c.x) < f.size.x / 2 + 0.15 && Math.abs(f.centre.z - c.z) < f.size.z / 2 + 0.15);
      if (blocked) continue;
      const dir = Math.atan2(centre.z - c.z, centre.x - c.x);
      let score = Math.hypot(centre.x - c.x, centre.z - c.z);
      for (const o of scene.openings) {
        if (!o.exterior || o.kind === "door") continue;
        const a = Math.atan2(o.centre.z - c.z, o.centre.x - c.x);
        const off = Math.abs(Math.atan2(Math.sin(a - dir), Math.cos(a - dir)));
        if (off < 0.6 && Math.hypot(o.centre.x - c.x, o.centre.z - c.z) < 9) score += 1.5;
      }
      if (!best || score > best.score) best = { at: c, score };
    }
    if (!best) continue;
    out.push({
      id: `room-${room.kind}`,
      title: room.name,
      ceiling: true,
      payload: {
        width: widthPx,
        height: Math.round(widthPx / 1.5),
        exposure: 0.7,
        ao: true,
        camera: { position: { x: best.at.x, y: 1.45, z: best.at.z }, target: { x: centre.x, y: 1.05, z: centre.z }, fovDeg: 56, interior: true, studio: true },
        sun: { azimuthDeg: 200, elevationDeg: 40 },
      },
    });
  }
  return out;
}
