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

function pieceOf(tags: Set<string>, lengthM: number): string | null {
  if (tags.has("mattress")) return "single bed";
  // Upholstered with arms: under a metre long a seat for one. By length, not
  // by cushions — דירה 21's 1.2 m two-seaters have one wide cushion each.
  if (tags.has("seat") && tags.has("arm")) return lengthM >= 1.05 ? "sofa" : "armchair";
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

/** One piece of furniture and where its middle stands, metres in scene space. */
export type PlacedPiece = {
  what: string;
  x: number;
  z: number;
  box?: { x0: number; x1: number; z0: number; z1: number; top: number };
  /** Where a seat's back stands, for which way it faces. */
  backAt?: { x: number; z: number };
};

export function flatPieces(scene: FlatScene): PlacedPiece[] {
  const parts = new Map<string, { tags: Set<string>; x: number; z: number; n: number; x0: number; x1: number; z0: number; z1: number; top: number; back?: { x: number; z: number } }>();
  for (const m of scene.meshes) {
    if (m.kind !== "furniture") continue;
    const [id, tag] = m.sourceId.split("/");
    if (!id || !tag || !id.startsWith("furniture:")) continue;
    const p = parts.get(id) ?? { tags: new Set<string>(), x: 0, z: 0, n: 0, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: 0 };
    p.tags.add(tag);
    p.x0 = Math.min(p.x0, m.centre.x - m.size.x / 2);
    p.x1 = Math.max(p.x1, m.centre.x + m.size.x / 2);
    p.z0 = Math.min(p.z0, m.centre.z - m.size.z / 2);
    p.z1 = Math.max(p.z1, m.centre.z + m.size.z / 2);
    p.top = Math.max(p.top, m.centre.y + m.size.y / 2);
    if (tag === "back") p.back = { x: m.centre.x, z: m.centre.z };
    p.x += m.centre.x;
    p.z += m.centre.z;
    p.n += 1;
    parts.set(id, p);
  }
  const out: PlacedPiece[] = [];
  for (const p of parts.values()) {
    const what = pieceOf(p.tags, Math.max(p.x1 - p.x0, p.z1 - p.z0));
    if (what) out.push({ what, x: p.x / p.n, z: p.z / p.n, box: { x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, top: p.top }, ...(p.back ? { backAt: p.back } : {}) });
  }
  return out;
}

export function flatInventory(scene: FlatScene): RoomInventory[] {
  const rooms = scene.rooms.map((r) => ({ room: r.name, kind: r.kind, rects: r.rects, pieces: {} as Record<string, number> }));
  for (const { what, x, z } of flatPieces(scene)) {
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
        .map(([what, count]) => plural(what, count))
        .join(", ");
      return `- ${word} ${n}: ${items}`;
    })
    .join("\n");
}

const plural = (what: string, count: number) => `${count} ${what}${count > 1 ? (what.endsWith("ch") ? "es" : "s") : ""}`;

/** Where on the plan a point stands, in thirds: "top left", "middle", "bottom right". */
export function planPlace(x: number, z: number, extent: FlatScene["extent"]): string {
  const third = (v: number, from: number, size: number) => (size > 0 ? Math.min(2, Math.max(0, Math.floor(((v - from) / size) * 3))) : 1);
  const row = ["top", "middle", "bottom"][third(z, extent.z, extent.depth)]!;
  const col = ["left", "centre", "right"][third(x, extent.x, extent.width)]!;
  return row === "middle" && col === "centre" ? "middle" : row === "middle" ? `middle ${col}` : col === "centre" ? `${row} centre` : `${row} ${col}`;
}

/** The pieces a design most often loses or invents, listed one by one with their place. */
const PLACED = ["single bed", "sofa", "armchair", "wardrobe", "table", "desk", "bath", "toilet"];

/**
 * The furniture as the image model and the judge are given it: the totals,
 * and where each of the pieces that matter stands on the plan (north up).
 * Counted from the scene, not from its rooms: a room the measurement merged
 * with the living room — a bedroom open to it through a doorway — put a bed
 * on the living room's list, and the judge, told so, refused every design for
 * the bed it could not find there.
 */
export function inventoryByPlace(pieces: PlacedPiece[], extent: FlatScene["extent"]): string {
  if (pieces.length === 0) return "";
  const totals = new Map<string, number>();
  for (const p of pieces) totals.set(p.what, (totals.get(p.what) ?? 0) + 1);
  const lines = [
    `In all: ${[...totals.entries()].sort((a, b) => b[1] - a[1]).map(([what, n]) => plural(what, n)).join(", ")}.`,
  ];
  for (const what of PLACED) {
    const at = new Map<string, number>();
    for (const p of pieces) if (p.what === what) { const place = planPlace(p.x, p.z, extent); at.set(place, (at.get(place) ?? 0) + 1); }
    if (at.size === 0) continue;
    lines.push(`- ${plural(what, totals.get(what)!)}: ${[...at.entries()].map(([place, n]) => `${n} at the ${place}`).join(", ")}`);
  }
  return lines.join("\n");
}

/** The kinds a design is counted by, piece by piece: what designs lost or invented. */
export const LISTED_PIECES = ["beds", "sofas", "armchairs", "dining tables", "wardrobes", "toilets", "screens", "kitchen counters"] as const;
export type ListedKind = (typeof LISTED_PIECES)[number];

const LISTED_AS: Record<string, ListedKind> = {
  "single bed": "beds",
  sofa: "sofas",
  armchair: "armchairs",
  table: "dining tables",
  wardrobe: "wardrobes",
  toilet: "toilets",
  "kitchen counter run": "kitchen counters",
};

/** Which listed kind a piece is, if any. */
export function listedKind(what: string): ListedKind | undefined {
  return LISTED_AS[what];
}

/** Rooms whose open floor a design must leave open. */
const OPEN_FLOOR_ROOMS = new Set(["living", "kitchen", "bedroom", "mmd"]);

/**
 * Squares of open floor: 70 cm squares in a living room, kitchen or bedroom
 * with nothing within 15 cm of it — no furniture, no wall. Where a design is
 * checked for what it added: a second sofa and an armchair painted on the
 * living room's open floor passed every judge shown the whole flat. At most
 * `max`, spread over the flat (each the farthest from those already chosen).
 */
export function openFloorSquares(scene: FlatScene, max = 32, sizeM = 0.7, clearM = 0.15): Array<{ x: number; z: number; half: number; place: string }> {
  const candidates = openFloorCandidates(scene, sizeM, clearM, 0.1, sizeM / 4);
  const half = sizeM / 2;
  const chosen: Array<{ x: number; z: number }> = [];
  while (chosen.length < max && candidates.length > 0) {
    let best = 0;
    let bestD = -1;
    candidates.forEach((c, i) => {
      const d = chosen.length === 0 ? -Math.hypot(c.x - scene.extent.x, c.z - scene.extent.z) : Math.min(...chosen.map((q) => Math.hypot(c.x - q.x, c.z - q.z)));
      if (d > bestD) { bestD = d; best = i; }
    });
    const [pick] = candidates.splice(best, 1);
    if (chosen.length > 0 && bestD < sizeM) break;
    chosen.push(pick!);
  }
  return chosen.map((c) => ({ ...c, half, place: planPlace(c.x, c.z, scene.extent) }));
}

/**
 * The open floor laid edge to edge in small squares, to the walls: the map
 * the model is shown of where it may not furnish. Squares kept 10 cm off the
 * walls left the strip a sofa stands in, and the model stood one there.
 */
export function openFloorCover(scene: FlatScene, sizeM = 0.25): Array<{ x: number; z: number; half: number }> {
  return openFloorCandidates(scene, sizeM, 0.15, 0.02, sizeM).map((c) => ({ ...c, half: sizeM / 2 }));
}

function openFloorCandidates(scene: FlatScene, sizeM: number, clearM: number, wallClearM: number, stepM: number): Array<{ x: number; z: number }> {
  // Clear of furniture by clearM, and of walls by only 10 cm: the model's own
  // additions stand against the walls — a bookcase down 14's and 21's living
  // room wall in every design — where squares kept off the walls never look.
  const box = (m: (typeof scene.meshes)[number], pad: number) => ({
    x0: m.centre.x - m.size.x / 2 - pad,
    x1: m.centre.x + m.size.x / 2 + pad,
    z0: m.centre.z - m.size.z / 2 - pad,
    z1: m.centre.z + m.size.z / 2 + pad,
  });
  const WALL_CLEAR = wallClearM;
  const blockers = scene.meshes
    // Door leaves, frames and glazing too: 22's open door leaf, drawn in the
    // design as it is in the layout, was read as a shower on the open floor.
    .filter((m) => m.kind === "furniture" || m.kind === "prop" || ["wall", "wallSill", "wallHead", "railing", "frame", "glazing"].includes(m.kind))
    .map((m) => box(m, m.kind === "furniture" || m.kind === "prop" ? clearM : WALL_CLEAR));
  // A square touching a bathroom, a hall or a terrace is not a room's open
  // floor: the measured rooms overlap, and a WC a design drew in a bathroom
  // the big region also covered is not an addition.
  for (const room of scene.rooms) {
    if (OPEN_FLOOR_ROOMS.has(room.kind)) continue;
    for (const r of room.rects) blockers.push({ x0: r.x - clearM, x1: r.x + r.w + clearM, z0: r.z - clearM, z1: r.z + r.d + clearM });
  }
  const half = sizeM / 2;
  const candidates: Array<{ x: number; z: number }> = [];
  for (const room of scene.rooms) {
    if (!OPEN_FLOOR_ROOMS.has(room.kind)) continue;
    const inside = (x: number, z: number) => room.rects.some((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);
    for (let x = room.bounds.x + half; x <= room.bounds.x + room.bounds.w - half; x += stepM) {
      for (let z = room.bounds.z + half; z <= room.bounds.z + room.bounds.d - half; z += stepM) {
        if (![[-half, -half], [half, -half], [-half, half], [half, half], [0, 0]].every(([dx, dz]) => inside(x + dx!, z + dz!))) continue;
        if (blockers.some((b) => x + half > b.x0 && x - half < b.x1 && z + half > b.z0 && z - half < b.z1)) continue;
        candidates.push({ x, z });
      }
    }
  }
  return candidates;
}
