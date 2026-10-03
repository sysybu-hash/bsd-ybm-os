import type { FlatScene, SceneRoomKind } from "@/lib/projects/scene3d/types";

/**
 * What stands in each room, counted from the scene — the list a designed
 * picture is held to.
 *
 * A piece's parts say what it is (a mattress is a bed, cushions on a base
 * with arms a sofa, a pad on four legs a chair), and its middle says which
 * room it is in. Written in plain English for the image model to keep and the
 * judge to count against.
 */
export type RoomInventory = { room: string; kind: SceneRoomKind; pieces: Record<string, number> };

const ROOM_WORD: Record<SceneRoomKind, string> = {
  living: "living room",
  kitchen: "kitchen",
  bedroom: "bedroom",
  mmd: "safe room (a bedroom)",
  bathroom: "bathroom",
  balcony: "terrace",
  circulation: "hall",
  utility: "utility room",
  other: "room",
};

function pieceOf(tags: Set<string>): string | null {
  if (tags.has("mattress")) return "single bed";
  if (tags.has("seat") && tags.has("arm")) return tags.has("cushion") ? "sofa" : "armchair";
  if (tags.has("pad")) return "chair";
  if (tags.has("panel")) return "desk";
  if (tags.has("top") && tags.has("leg")) return "table";
  if (tags.has("carcass") && tags.has("door")) return "wardrobe";
  if (tags.has("kick") && tags.has("worktop")) return "kitchen counter run";
  if (tags.has("plate")) return "hob";
  if (tags.has("rim") && tags.has("basin")) return "kitchen sink";
  if (tags.has("cistern")) return "toilet";
  if (tags.has("tub")) return "bath";
  if (tags.has("tray")) return "shower";
  if (tags.has("cabinet") && tags.has("bowl")) return "basin on a vanity";
  if (tags.has("pedestal") || tags.has("bowl")) return "basin";
  return null;
}

export function flatInventory(scene: FlatScene): RoomInventory[] {
  const parts = new Map<string, { tags: Set<string>; x: number; z: number; n: number }>();
  for (const m of scene.meshes) {
    if (m.kind !== "furniture") continue;
    const [id, tag] = m.sourceId.split("/");
    if (!id || !tag || !id.startsWith("furniture:")) continue;
    const p = parts.get(id) ?? { tags: new Set<string>(), x: 0, z: 0, n: 0 };
    p.tags.add(tag);
    p.x += m.centre.x;
    p.z += m.centre.z;
    p.n += 1;
    parts.set(id, p);
  }
  const rooms = scene.rooms.map((r) => ({ room: r.name, kind: r.kind, rects: r.rects, pieces: {} as Record<string, number> }));
  for (const p of parts.values()) {
    const what = pieceOf(p.tags);
    if (!what) continue;
    const x = p.x / p.n;
    const z = p.z / p.n;
    const room = rooms.find((r) => r.rects.some((q) => x >= q.x && x <= q.x + q.w && z >= q.z && z <= q.z + q.d));
    if (!room) continue;
    room.pieces[what] = (room.pieces[what] ?? 0) + 1;
  }
  return rooms.filter((r) => Object.keys(r.pieces).length > 0).map(({ room, kind, pieces }) => ({ room, kind, pieces }));
}

/** The inventory as lines: "bedroom: 1 single bed, 1 wardrobe". */
export function inventoryText(inventory: RoomInventory[]): string {
  const seen = new Map<string, number>();
  return inventory
    .map((r) => {
      const word = ROOM_WORD[r.kind];
      const n = (seen.get(word) ?? 0) + 1;
      seen.set(word, n);
      const items = Object.entries(r.pieces)
        .sort((a, b) => b[1] - a[1])
        .map(([what, count]) => `${count} ${what}${count > 1 ? (what.endsWith("ch") ? "es" : "s") : ""}`)
        .join(", ");
      return `- ${word} ${n}: ${items}`;
    })
    .join("\n");
}
