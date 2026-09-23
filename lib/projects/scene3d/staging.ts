import type { AudienceRules } from "@/lib/projects/scene3d/rules";
import type { FlatScene, SceneBox, SceneLight, SceneRoom } from "@/lib/projects/scene3d/types";

/**
 * The props and the lamps that make a render a home rather than a model.
 *
 * One rule governs all of it: **every prop and every lamp is anchored to
 * something the drawing draws.** A bowl of fruit rests on a worktop that was
 * measured; a pendant hangs over a dining table that was measured; a rug lies
 * under seating that was measured. Where the sheet draws nothing, nothing
 * appears — which is the difference between "lived-in" and the invented
 * sideboard the image model kept putting in the hall.
 *
 * Circulation and the entrance carry nothing at all. That is the existing
 * written rule, and here it is a line of code instead of a paragraph.
 */

const NOTHING_STANDS_HERE = new Set(["circulation"]);

type Anchor = { mesh: SceneBox; room: SceneRoom | null; kind: string };

/** The measured pieces, with the room each of them stands in. */
function anchors(scene: FlatScene): Anchor[] {
  const out: Anchor[] = [];
  const seen = new Set<string>();
  for (const mesh of scene.meshes) {
    if (mesh.kind !== "furniture") continue;
    const id = mesh.sourceId.split("/")[0] ?? mesh.sourceId;
    if (seen.has(id)) continue;
    seen.add(id);
    const room = roomOf(scene, mesh) ?? null;
    out.push({ mesh, room, kind: tagKind(scene, id) });
  }
  return out;
}

/** The piece's kind, read back off the parts the library built for it. */
function tagKind(scene: FlatScene, id: string): string {
  const tags = scene.meshes
    .filter((m) => m.sourceId.startsWith(`${id}/`))
    .map((m) => m.sourceId.split("/")[1] ?? "");
  if (tags.includes("mattress")) return "bed";
  if (tags.includes("worktop")) return "counter";
  if (tags.includes("ring")) return "hob";
  if (tags.includes("basin") || tags.includes("bowl")) return "sink";
  if (tags.includes("tub")) return "bath";
  if (tags.includes("apron")) return "table";
  if (tags.includes("pad")) return "seat";
  if (tags.includes("door")) return "storage";
  if (tags.includes("panel")) return "desk";
  return "other";
}

function roomOf(scene: FlatScene, mesh: SceneBox): SceneRoom | undefined {
  return scene.rooms.find((room) =>
    room.rects.some(
      (r) =>
        mesh.centre.x >= r.x && mesh.centre.x <= r.x + r.w && mesh.centre.z >= r.z && mesh.centre.z <= r.d + r.z,
    ),
  );
}

function prop(
  tag: string,
  anchor: SceneBox,
  material: SceneBox["material"],
  box: { dx?: number; dy: number; dz?: number; w: number; h: number; d: number },
): SceneBox {
  return {
    kind: "prop",
    material,
    centre: {
      x: anchor.centre.x + (box.dx ?? 0),
      y: box.dy,
      z: anchor.centre.z + (box.dz ?? 0),
    },
    size: { x: box.w, y: box.h, z: box.d },
    sourceId: `prop:${tag}`,
    anchorId: anchor.sourceId,
  };
}

function topOf(mesh: SceneBox): number {
  return mesh.centre.y + mesh.size.y / 2;
}

function clamp(value: number, low: number, high: number): number {
  return high < low ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

export type StagingResult = { props: SceneBox[]; lights: SceneLight[] };

/**
 * What the staging adds, and where it is allowed to add it.
 *
 * The anchor's own room decides: a rug goes under seating in a living room, a
 * towel over the rim of a measured bath, a bowl on a measured worktop, a
 * pendant over a measured dining table. Nothing is placed in a room whose kind
 * does not ask for it, and nothing is placed where no piece was measured.
 */
export function stageScene(scene: FlatScene, rules: AudienceRules): StagingResult {
  const props: SceneBox[] = [];
  const lights: SceneLight[] = [];
  const ruggedRooms = new Set<string>();
  let sefarimPlaced = false;

  for (const { mesh, room, kind } of anchors(scene)) {
    if (room && NOTHING_STANDS_HERE.has(room.kind)) continue;
    const top = topOf(mesh);

    if (kind === "counter") {
      props.push(prop("bowl", mesh, "ceramic", { dy: top + 0.05, w: 0.28, h: 0.1, d: 0.28 }));
      // A strip under the wall units, which is where a kitchen's light lives.
      lights.push({
        id: `light:strip@${mesh.sourceId}`,
        kind: "strip",
        position: { x: mesh.centre.x, y: top + 0.45, z: mesh.centre.z },
        kelvin: 3000,
        intensity: 0.5,
        anchorId: mesh.sourceId,
      });
    }

    // The room's kind steers the staging where the segmenter named one. Where
    // it did not — and on a sheet like דירה 14 it names four rooms out of nine
    // — the piece still gets what belongs to it. A dining table is a dining
    // table whether or not the room around it was given a name, and a still
    // whose lamps all failed a room test reads as an empty model.
    if (kind === "table" && (!room || room.kind === "living" || room.kind === "kitchen" || room.kind === "other")) {
      // A Shabbat table for a haredi still: candles and a challah cover, both
      // plain objects with nothing written on them.
      if (rules.audience === "haredi") {
        props.push(
          prop("candles", mesh, "metal", { dx: -0.18, dy: top + 0.09, w: 0.07, h: 0.18, d: 0.07 }),
          prop("candles", mesh, "metal", { dx: -0.02, dy: top + 0.09, w: 0.07, h: 0.18, d: 0.07 }),
          prop("challah-cover", mesh, "linen", { dx: 0.25, dy: top + 0.02, w: 0.42, h: 0.04, d: 0.3 }),
        );
      } else {
        props.push(prop("bowl", mesh, "ceramic", { dy: top + 0.05, w: 0.3, h: 0.1, d: 0.3 }));
      }
      lights.push({
        id: `light:pendant@${mesh.sourceId}`,
        kind: "pendant",
        position: { x: mesh.centre.x, y: 1.85, z: mesh.centre.z },
        kelvin: 2900,
        intensity: 1,
        anchorId: mesh.sourceId,
      });
    }

    // One rug per room, sized to the room and kept inside it.
    //
    // It used to be one rug per seat, at a fixed 2.2 by 1.6: on a flat with
    // twelve measured seats that is twelve rugs stacked on each other, and the
    // ones near a wall pushed through it and out of the apartment.
    if (kind === "seat" && room && (room.kind === "living" || room.kind === "other") && !ruggedRooms.has(room.id)) {
      ruggedRooms.add(room.id);
      const w = Math.min(2.6, room.bounds.w * 0.6);
      const d = Math.min(2.0, room.bounds.d * 0.6);
      if (w > 0.8 && d > 0.6) {
        const cx = clamp(mesh.centre.x, room.bounds.x + w / 2, room.bounds.x + room.bounds.w - w / 2);
        const cz = clamp(mesh.centre.z + 0.6, room.bounds.z + d / 2, room.bounds.z + room.bounds.d - d / 2);
        props.push({
          kind: "prop",
          material: "upholstery",
          centre: { x: cx, y: 0.008, z: cz },
          size: { x: w, y: 0.016, z: d },
          sourceId: "prop:rug",
          anchorId: mesh.sourceId,
        });
      }
    }

    if (kind === "bed") {
      lights.push({
        id: `light:lamp@${mesh.sourceId}`,
        kind: "lamp",
        position: { x: mesh.centre.x + mesh.size.x / 2 + 0.25, y: 0.62, z: mesh.centre.z - mesh.size.z / 2 + 0.2 },
        kelvin: 2800,
        intensity: 0.6,
        anchorId: mesh.sourceId,
      });
    }

    if (kind === "bath") {
      props.push(prop("towel", mesh, "linen", { dy: top + 0.04, dz: 0.02, w: 0.3, h: 0.07, d: 0.22 }));
    }

    // One sefarim cabinet, in the living room, on a wardrobe the sheet already
    // draws there — never a second, and never in a hall or a bedroom.
    if (
      rules.sefarimCabinet &&
      !sefarimPlaced &&
      kind === "storage" &&
      room &&
      room.kind === "living"
    ) {
      sefarimPlaced = true;
      props.push(
        prop("sefarim", mesh, "timber", {
          dy: mesh.centre.y,
          dz: mesh.size.z / 2 + 0.01,
          w: mesh.size.x * 0.96,
          h: mesh.size.y * 0.9,
          d: 0.02,
        }),
      );
    }
  }

  return { props, lights };
}

/**
 * A mezuzah case on the posts of the doors that were measured.
 *
 * A case, not a word: the renderer draws no letters anywhere, which is one of
 * the rules the image model kept breaking.
 */
export function mezuzot(scene: FlatScene): SceneBox[] {
  const out: SceneBox[] = [];
  for (const opening of scene.openings) {
    if (opening.kind !== "door" && opening.kind !== "opening") continue;
    const alongX = opening.size.x >= opening.size.z;
    out.push({
      kind: "prop",
      material: "metal",
      centre: {
        x: opening.centre.x + (alongX ? opening.size.x / 2 + 0.03 : 0),
        y: 1.55,
        z: opening.centre.z + (alongX ? 0 : opening.size.z / 2 + 0.03),
      },
      size: { x: 0.03, y: 0.12, z: 0.03 },
      sourceId: `prop:mezuzah`,
      anchorId: opening.id,
    });
  }
  return out;
}
