import type { BuildingMaterial } from "@/lib/projects/building/model";
import type { FlatScene, SceneBox, SceneRoomKind } from "@/lib/projects/scene3d/types";

/**
 * What an apartment's surfaces are made of, as the building renderer paints
 * them: porcelain through the living spaces, oak in the bedrooms, a smaller
 * tile in the wet rooms, a woven fabric on what is upholstered, a rug where the
 * staging lays one. The flat engine names a part's role; this names its finish.
 */
const FLOOR: Partial<Record<SceneRoomKind, BuildingMaterial>> = {
  bedroom: "floorOak",
  mmd: "floorOak",
  bathroom: "floorWet",
  utility: "floorWet",
  balcony: "terraceTile",
};

export function apartmentFinish(mesh: SceneBox, roomKind: (id: string) => SceneRoomKind | undefined): { material: BuildingMaterial; round?: number } | null {
  const round = mesh.round;
  const part = mesh.sourceId.split("/")[1] ?? "";
  if (mesh.kind === "floor") {
    if (mesh.material === "floorStone") return { material: "terraceTile" };
    return { material: FLOOR[roomKind(mesh.sourceId) ?? "living"] ?? (mesh.material === "floorTile" ? "floorWet" : "floorPorcelain") };
  }
  if (mesh.kind === "terrace") return { material: "terraceTile" };
  if (mesh.kind === "prop" && mesh.sourceId === "prop:rug") return { material: "rug" };
  switch (mesh.material) {
    case "upholstery":
      return { material: part === "cushion" ? "cushion" : "sofaFabric", round };
    case "linen":
      return { material: "linen", round };
    case "joinery":
      // A door's leaf is oak veneer; joinery otherwise painted.
      return { material: part === "leaf" ? "walnut" : "cabinet", round };
    case "timber":
      // A wardrobe's carcass is painted, like its doors; a table is timber.
      return { material: part === "carcass" ? "cabinet" : "walnut", round };
    case "worktop":
      return { material: "quartz", round };
    case "ceramic":
      return { material: "ceramic", round };
    case "metal":
    case "steel":
      // A hob is black glass; a sink and a tap are steel.
      return { material: part === "plate" || part === "ring" ? "screen" : "metal", round };
    case "glass":
      return { material: mesh.kind === "railing" || part === "screen" ? "railGlass" : "glass" };
    case "wall":
    case "wallCut":
    case "skirting":
      return { material: "plaster" };
    default:
      return { material: "plaster", round };
  }
}

export function roomKindOf(scene: FlatScene): (id: string) => SceneRoomKind | undefined {
  const kinds = new Map(scene.rooms.map((r) => [r.id, r.kind]));
  return (id) => kinds.get(id);
}

/**
 * A render framed to what it shows: the empty sheet round the flat trimmed
 * away, and an even margin put back, at the aspect the page wants.
 */
export async function frameToContent(image: Buffer, aspect: number, margin = 0.05): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(image).trim({ threshold: 18 }).toBuffer({ resolveWithObject: true });
  const bg = await sharp(image).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
  let w = Math.round(info.width * (1 + 2 * margin));
  let h = Math.round(info.height * (1 + 2 * margin));
  if (w / h < aspect) w = Math.round(h * aspect);
  else h = Math.round(w / aspect);
  const left = Math.floor((w - info.width) / 2);
  const top = Math.floor((h - info.height) / 2);
  return sharp(data)
    .extend({ left, right: w - info.width - left, top, bottom: h - info.height - top, background: { r: bg[0] ?? 255, g: bg[1] ?? 255, b: bg[2] ?? 255 } })
    .jpeg({ quality: 93, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

type Box2 = { x0: number; x1: number; z0: number; z1: number };

/**
 * Plants, staged the way a sales plan stages them: one beside the living
 * room's sofa, at whichever end is free, and two in a terrace's outer
 * corners. Each stands only where nothing measured stands, and each is
 * anchored to something measured — a sofa, a terrace — never to empty floor.
 */
export function stagedPlants(scene: FlatScene): Array<{ at: { x: number; y: number; z: number }; height: number; spread: number }> {
  const box = (m: SceneBox): Box2 => ({ x0: m.centre.x - m.size.x / 2, x1: m.centre.x + m.size.x / 2, z0: m.centre.z - m.size.z / 2, z1: m.centre.z + m.size.z / 2 });
  const blockers = scene.meshes.filter((m) => m.kind === "furniture" || m.kind === "wall" || m.kind === "wallSill" || m.kind === "wallHead" || m.kind === "railing").map(box);
  const free = (x: number, z: number, r: number) => blockers.every((b) => x + r <= b.x0 || x - r >= b.x1 || z + r <= b.z0 || z - r >= b.z1);
  const inRects = (x: number, z: number, rects: Array<{ x: number; z: number; w: number; d: number }>, r: number) =>
    rects.some((q) => x - r >= q.x && x + r <= q.x + q.w && z - r >= q.z && z + r <= q.z + q.d);
  const out: Array<{ at: { x: number; y: number; z: number }; height: number; spread: number }> = [];

  // Sofas: the furniture whose seat cushions say so.
  const pieces = new Map<string, SceneBox[]>();
  for (const m of scene.meshes) {
    if (m.kind !== "furniture") continue;
    const id = m.sourceId.split("/")[0]!;
    pieces.set(id, [...(pieces.get(id) ?? []), m]);
  }
  for (const room of scene.rooms) {
    if (room.kind !== "living") continue;
    const sofas = [...pieces.values()]
      .filter((parts) => parts.some((p) => p.sourceId.endsWith("/seat")) && parts.some((p) => p.sourceId.endsWith("/arm")))
      .map((parts) => parts.map(box).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) })))
      .filter((b) => inRects((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, room.rects, 0))
      .sort((a, b) => Math.max(b.x1 - b.x0, b.z1 - b.z0) - Math.max(a.x1 - a.x0, a.z1 - a.z0));
    const sofa = sofas[0];
    if (!sofa) continue;
    const alongX = sofa.x1 - sofa.x0 >= sofa.z1 - sofa.z0;
    const r = 0.26;
    const mid = alongX ? (sofa.z0 + sofa.z1) / 2 : (sofa.x0 + sofa.x1) / 2;
    const ends = alongX ? [sofa.x1 + r + 0.08, sofa.x0 - r - 0.08] : [sofa.z1 + r + 0.08, sofa.z0 - r - 0.08];
    for (const e of ends) {
      const [x, z] = alongX ? [e, mid] : [mid, e];
      if (free(x, z, r) && inRects(x, z, room.rects, r)) {
        out.push({ at: { x, y: 0, z }, height: 1.15, spread: 0.55 });
        break;
      }
    }
  }

  // Terraces: the two corners furthest from the rooms.
  const terraces = new Map<string, Array<{ x: number; z: number; w: number; d: number }>>();
  for (const m of scene.meshes) {
    if (m.kind !== "terrace") continue;
    const b = box(m);
    terraces.set(m.sourceId, [...(terraces.get(m.sourceId) ?? []), { x: b.x0, z: b.z0, w: b.x1 - b.x0, d: b.z1 - b.z0 }]);
  }
  const roomRects = scene.rooms.filter((r) => r.kind !== "balcony").flatMap((r) => r.rects);
  const fromRooms = (x: number, z: number) =>
    Math.min(...roomRects.map((q) => Math.hypot(Math.max(q.x - x, 0, x - q.x - q.w), Math.max(q.z - z, 0, z - q.z - q.d))));
  for (const rects of terraces.values()) {
    const area = rects.reduce((a, q) => a + q.w * q.d, 0);
    if (area < 4) continue;
    const r = 0.3;
    const corners = rects.flatMap((q) => [
      [q.x + r + 0.12, q.z + r + 0.12],
      [q.x + q.w - r - 0.12, q.z + r + 0.12],
      [q.x + r + 0.12, q.z + q.d - r - 0.12],
      [q.x + q.w - r - 0.12, q.z + q.d - r - 0.12],
    ] as Array<[number, number]>);
    const placed: Array<[number, number]> = [];
    for (const [x, z] of corners.sort((a, b) => fromRooms(b[0], b[1]) - fromRooms(a[0], a[1]))) {
      if (placed.length >= (area > 9 ? 2 : 1)) break;
      if (!free(x, z, r) || !inRects(x, z, rects, r) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.2)) continue;
      placed.push([x, z]);
      out.push({ at: { x, y: -0.02, z }, height: 0.95, spread: 0.6 });
    }
  }
  return out;
}
