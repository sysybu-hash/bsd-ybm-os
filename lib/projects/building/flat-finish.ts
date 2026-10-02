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
      return { material: "cabinet", round };
    case "timber":
      // A wardrobe's carcass is painted, like its doors; a table is timber.
      return { material: part === "carcass" ? "cabinet" : "timber", round };
    case "worktop":
      return { material: "quartz", round };
    case "ceramic":
      return { material: "ceramic", round };
    case "metal":
    case "steel":
      return { material: "metal", round };
    case "glass":
      return { material: mesh.kind === "railing" ? "railGlass" : "glass" };
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
