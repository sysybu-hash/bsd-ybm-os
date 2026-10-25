import type { FlatScene, SceneBox, SceneRoom } from "@/lib/projects/scene3d/types";

/**
 * A private house's rooms dressed where the sheet leaves them bare, by fixed
 * rules decided here and drawn in the render — never left to the image model,
 * which added a different thing in a different place each time (Gottlieb,
 * 13/10/2026: "if a room is too empty, add by context — will it not ruin it?").
 *
 * Only soft pieces, never one the sheet draws: a rug and a low table before a
 * sofa, a rug under the dining table, a bowl on it and on the worktop, a
 * night table beside each bed, a plant in a free living-room corner. Each
 * stands wholly inside its room, clear of every measured piece and of every
 * doorway; where it does not fit it is left out. Halls, wet rooms and the
 * stair carry nothing.
 */
export type HouseStaging = { boxes: SceneBox[]; plants: Array<{ x: number; z: number; height: number; spread: number }> };

type Rect = { x0: number; x1: number; z0: number; z1: number };
type Piece = { id: string; kind: string; rect: Rect; parts: SceneBox[] };

const DOOR_CLEAR_M = 0.9;

function rectOf(m: SceneBox): Rect {
  return { x0: m.centre.x - m.size.x / 2, x1: m.centre.x + m.size.x / 2, z0: m.centre.z - m.size.z / 2, z1: m.centre.z + m.size.z / 2 };
}

function union(a: Rect, b: Rect): Rect {
  return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x0 < b.x1 + margin && b.x0 < a.x1 + margin && a.z0 < b.z1 + margin && b.z0 < a.z1 + margin;
}

function pieceKind(parts: SceneBox[]): string {
  const tags = new Set(parts.map((m) => m.sourceId.split("/")[1] ?? ""));
  if (tags.has("mattress")) return "bed";
  if (tags.has("arm") || tags.has("cushion")) return "sofa";
  if (tags.has("worktop")) return "counter";
  if (tags.has("ring") || tags.has("plate")) return "hob";
  if (tags.has("tub")) return "bath";
  if (tags.has("basin") || tags.has("bowl") || tags.has("seat") || tags.has("washer") || tags.has("cistern")) return "fixture";
  if (tags.has("apron")) return "table";
  if (tags.has("pad")) return "chair";
  if (tags.has("door") || tags.has("carcass")) return "storage";
  return "other";
}

function pieces(scene: FlatScene): Piece[] {
  const byId = new Map<string, SceneBox[]>();
  for (const m of scene.meshes) {
    if (m.kind !== "furniture") continue;
    const id = m.sourceId.split("/")[0] ?? m.sourceId;
    byId.set(id, [...(byId.get(id) ?? []), m]);
  }
  return [...byId].map(([id, parts]) => ({ id, kind: pieceKind(parts), parts, rect: parts.map(rectOf).reduce(union) }));
}

function inRoom(room: SceneRoom, r: Rect): boolean {
  // Every corner and the middle on the room's measured floor. The measured
  // floor stops a hand short of its walls: a night table against the wall at
  // a bed's head stood "outside" it, and none was placed (13/10/2026).
  const e = Math.min(0.15, (r.x1 - r.x0) / 3, (r.z1 - r.z0) / 3);
  const pts = [[r.x0 + e, r.z0 + e], [r.x1 - e, r.z0 + e], [r.x0 + e, r.z1 - e], [r.x1 - e, r.z1 - e], [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]] as const;
  return pts.every(([x, z]) => room.rects.some((q) => x >= q.x - 1e-3 && x <= q.x + q.w + 1e-3 && z >= q.z - 1e-3 && z <= q.z + q.d + 1e-3));
}

function roomAt(scene: FlatScene, x: number, z: number): SceneRoom | undefined {
  return scene.rooms.find((room) => room.rects.some((q) => x >= q.x && x <= q.x + q.w && z >= q.z && z <= q.z + q.d));
}

function box(tag: string, material: SceneBox["material"], r: Rect, y0: number, h: number, anchor: string): SceneBox {
  return {
    kind: "prop",
    material,
    centre: { x: (r.x0 + r.x1) / 2, y: y0 + h / 2, z: (r.z0 + r.z1) / 2 },
    size: { x: r.x1 - r.x0, y: h, z: r.z1 - r.z0 },
    sourceId: `prop:house-${tag}`,
    anchorId: anchor,
  };
}

function centred(cx: number, cz: number, w: number, d: number): Rect {
  return { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
}

export function stageHouse(scene: FlatScene): HouseStaging {
  const all = pieces(scene);
  const taken: Rect[] = all.map((p) => p.rect);
  const doors: Rect[] = scene.openings.filter((o) => o.kind !== "window").map((o) => centred(o.centre.x, o.centre.z, o.size.x, o.size.z));
  const out: HouseStaging = { boxes: [], plants: [] };
  // Free: inside the room, off every piece but those it is laid round, clear of the doorways.
  const free = (room: SceneRoom, r: Rect, except: Rect[] = []) =>
    inRoom(room, r) && !taken.some((t) => !except.includes(t) && overlaps(t, r, 0.05)) && !doors.some((d) => overlaps(d, r, DOOR_CLEAR_M));
  const roomOfPiece = (p: Piece) => roomAt(scene, (p.rect.x0 + p.rect.x1) / 2, (p.rect.z0 + p.rect.z1) / 2);
  const living = (room: SceneRoom | undefined): room is SceneRoom => !!room && (room.kind === "living" || room.kind === "other");

  // Before a sofa: a low table, and a rug under it and the sofa's front.
  for (const sofa of all.filter((p) => p.kind === "sofa")) {
    const room = roomOfPiece(sofa);
    if (!living(room)) continue;
    const back = sofa.parts.find((m) => m.sourceId.endsWith("/back"));
    const c = { x: (sofa.rect.x0 + sofa.rect.x1) / 2, z: (sofa.rect.z0 + sofa.rect.z1) / 2 };
    const along = sofa.rect.x1 - sofa.rect.x0 >= sofa.rect.z1 - sofa.rect.z0 ? "x" : "z";
    // Its front faces away from its back cushion.
    const sign = back ? (along === "x" ? Math.sign(c.z - back.centre.z) : Math.sign(c.x - back.centre.x)) || 1 : 1;
    const depth = along === "x" ? sofa.rect.z1 - sofa.rect.z0 : sofa.rect.x1 - sofa.rect.x0;
    const width = along === "x" ? sofa.rect.x1 - sofa.rect.x0 : sofa.rect.z1 - sofa.rect.z0;
    const reach = depth / 2 + 0.45 + 0.275;
    const tc = along === "x" ? { x: c.x, z: c.z + sign * reach } : { x: c.x + sign * reach, z: c.z };
    const table = along === "x" ? centred(tc.x, tc.z, 1.0, 0.55) : centred(tc.x, tc.z, 0.55, 1.0);
    if (!free(room, table)) continue;
    const rugW = Math.min(2.4, width + 0.3), rugD = 1.7;
    const rc = along === "x" ? { x: c.x, z: c.z + sign * (depth / 2 + rugD / 2 - 0.25) } : { x: c.x + sign * (depth / 2 + rugD / 2 - 0.25), z: c.z };
    const rug = along === "x" ? centred(rc.x, rc.z, rugW, rugD) : centred(rc.x, rc.z, rugD, rugW);
    if (free(room, rug, [sofa.rect])) {
      out.boxes.push(box("rug", "upholstery", rug, 0, 0.012, sofa.id));
      taken.push(rug);
    }
    out.boxes.push(box("coffee-table", "timber", table, 0, 0.4, sofa.id));
    taken.push(table);
  }

  // Under a dining table and its chairs: a rug; on it, a bowl.
  for (const t of all.filter((p) => p.kind === "table")) {
    const room = roomOfPiece(t);
    if (!room || room.kind === "bedroom" || room.kind === "bathroom" || room.kind === "circulation") continue;
    const chairs = all.filter((p) => p.kind === "chair" && overlaps(p.rect, t.rect, 0.6));
    const group = [t, ...chairs].map((p) => p.rect).reduce(union);
    const top = Math.max(...t.parts.map((m) => m.centre.y + m.size.y / 2));
    const tc = { x: (t.rect.x0 + t.rect.x1) / 2, z: (t.rect.z0 + t.rect.z1) / 2 };
    out.boxes.push(box("fruit-bowl", "ceramic", centred(tc.x, tc.z, 0.3, 0.3), top, 0.09, t.id));
    if (room.kind !== "living" && room.kind !== "other") continue;
    const rug = { x0: group.x0 - 0.35, x1: group.x1 + 0.35, z0: group.z0 - 0.35, z1: group.z1 + 0.35 };
    if (free(room, rug, [t.rect, ...chairs.map((p) => p.rect)])) {
      out.boxes.push(box("rug", "upholstery", rug, 0, 0.012, t.id));
      taken.push(rug);
    }
  }

  // On the kitchen's worktop: a bowl, clear of its sinks and its hob.
  const wet = all.filter((p) => p.kind === "hob" || p.kind === "fixture").map((p) => p.rect);
  const kitchens = new Set<string>();
  for (const c of all.filter((p) => p.kind === "counter").sort((a, b) => (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0) - (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0))) {
    const room = roomOfPiece(c);
    if (!room || room.kind === "bathroom" || kitchens.has(room.id)) continue;
    const top = Math.max(...c.parts.map((m) => m.centre.y + m.size.y / 2));
    const bowl = centred((c.rect.x0 + c.rect.x1) / 2, (c.rect.z0 + c.rect.z1) / 2, 0.28, 0.28);
    if (wet.some((w) => overlaps(w, bowl, 0.25))) continue;
    out.boxes.push(box("fruit-bowl", "ceramic", bowl, top, 0.09, c.id));
    kitchens.add(room.id);
  }

  // Beside each bed's head: a night table, on whichever side is free.
  for (const bed of all.filter((p) => p.kind === "bed")) {
    const room = roomOfPiece(bed);
    if (!room || (room.kind !== "bedroom" && room.kind !== "mmd")) continue;
    const head = bed.parts.find((m) => /head|pillow/.test(m.sourceId.split("/")[1] ?? ""));
    const c = { x: (bed.rect.x0 + bed.rect.x1) / 2, z: (bed.rect.z0 + bed.rect.z1) / 2 };
    const long = bed.rect.x1 - bed.rect.x0 >= bed.rect.z1 - bed.rect.z0 ? "x" : "z";
    const hs = head ? (long === "x" ? Math.sign(head.centre.x - c.x) : Math.sign(head.centre.z - c.z)) || 1 : 1;
    for (const side of [1, -1]) {
      const r =
        long === "x"
          ? centred(hs > 0 ? bed.rect.x1 - 0.225 : bed.rect.x0 + 0.225, side > 0 ? bed.rect.z1 + 0.25 : bed.rect.z0 - 0.25, 0.45, 0.4)
          : centred(side > 0 ? bed.rect.x1 + 0.25 : bed.rect.x0 - 0.25, hs > 0 ? bed.rect.z1 - 0.225 : bed.rect.z0 + 0.225, 0.4, 0.45);
      if (!free(room, r)) continue;
      out.boxes.push(box("night-table", "timber", r, 0, 0.5, bed.id));
      taken.push(r);
      break;
    }
  }

  // A plant in a living room's free corners, two at most.
  for (const room of scene.rooms.filter((r) => r.kind === "living")) {
    let n = 0;
    for (const q of room.rects) {
      for (const [x, z] of [[q.x + 0.35, q.z + 0.35], [q.x + q.w - 0.35, q.z + 0.35], [q.x + 0.35, q.z + q.d - 0.35], [q.x + q.w - 0.35, q.z + q.d - 0.35]] as const) {
        if (n >= 2) break;
        const r = centred(x, z, 0.5, 0.5);
        if (!free(room, r) || taken.some((t) => overlaps(t, r, 0.35))) continue;
        out.plants.push({ x, z, height: 1.3, spread: 0.55 });
        taken.push(r);
        n++;
      }
    }
  }
  return out;
}
