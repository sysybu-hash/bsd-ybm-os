import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import { mergeSpanRows, outlineEdges, rectsBounds, type Rect } from "@/lib/projects/scene3d/floors";
import {
  DEFAULT_FURNITURE_HEIGHT_M,
  FRAME_INSET_M,
  FRAME_T_M,
  SKIRTING_H_M,
  SKIRTING_PROUD_M,
  FLOOR_T_M,
  FURNITURE_HEIGHT_M,
  GLASS_T_M,
  RAILING_H_M,
  RAIL_CAP_M,
  SLIDER_MIN_CLEAR_M,
  TERRACE_DROP_M,
  WALL_HEIGHT_M,
} from "@/lib/projects/scene3d/standards";
import type {
  FlatScene,
  MaterialId,
  SceneBox,
  SceneOpening,
  SceneOpeningKind,
  SceneRoom,
  SceneRoomKind,
} from "@/lib/projects/scene3d/types";
import { partsFor } from "@/lib/projects/scene3d/furniture";
import { rulesFor, type AudienceRules } from "@/lib/projects/scene3d/rules";
import { mezuzot, stageScene } from "@/lib/projects/scene3d/staging";
import { openingHeights } from "@/lib/projects/scene3d/openings";
import { facingFor, headFacing } from "@/lib/projects/scene3d/orientation";
import { bandRect, wallBands, type Band, type WallHole } from "@/lib/projects/scene3d/walls";

/**
 * The measured flat, as a scene.
 *
 * Nothing here decides anything about this apartment: every position, size,
 * room and opening comes from the measurement, and the only numbers added are
 * the named standards in standards.ts. That is the whole point — a scene that
 * cannot be wrong about the building, only about how nice it looks.
 */

const FLOOR_MATERIAL: Record<SceneRoomKind, MaterialId> = {
  living: "floorWood",
  bedroom: "floorWood",
  mmd: "floorWood",
  circulation: "floorWood",
  other: "floorWood",
  kitchen: "floorTile",
  bathroom: "floorTile",
  utility: "floorTile",
  balcony: "floorStone",
};

/** A room whose windows get the privacy sill rather than the habitable one. */
function isWetRoom(kind: SceneRoomKind): boolean {
  return kind === "bathroom" || kind === "utility";
}

type Projection = {
  upm: number;
  /** Page coordinates of the extent's centre. */
  cx: number;
  cy: number;
};

function project(p: Projection, x: number, y: number): { x: number; z: number } {
  return { x: (x - p.cx) / p.upm, z: (y - p.cy) / p.upm };
}

/** A page rectangle and a height range, as a scene box. */
function boxFrom(
  p: Projection,
  rect: Rect,
  y0: number,
  y1: number,
  kind: SceneBox["kind"],
  material: MaterialId,
  sourceId: string,
): SceneBox {
  const centre = project(p, rect.x + rect.w / 2, rect.y + rect.h / 2);
  return {
    kind,
    material,
    centre: { x: centre.x, y: (y0 + y1) / 2, z: centre.z },
    size: { x: rect.w / p.upm, y: Math.max(y1 - y0, 1e-6), z: rect.h / p.upm },
    sourceId,
  };
}

function bandToRect(band: Band): Rect {
  const half = band.thickness / 2;
  return band.orientation === "h"
    ? { x: band.from, y: band.centre - half, w: band.to - band.from, h: band.thickness }
    : { x: band.centre - half, y: band.from, w: band.thickness, h: band.to - band.from };
}

function rectCentre(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function pointInRects(point: { x: number; y: number }, rects: Rect[]): boolean {
  return rects.some(
    (r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h,
  );
}

function distanceToRects(point: { x: number; y: number }, rects: Rect[]): number {
  let best = Infinity;
  for (const r of rects) {
    const dx = Math.max(r.x - point.x, 0, point.x - (r.x + r.w));
    const dy = Math.max(r.y - point.y, 0, point.y - (r.y + r.h));
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

type MeasuredRoom = { room: SceneInput["rooms"][number]; rects: Rect[]; index: number };

/** The measured room a point belongs to, or the nearest one to it. */
function roomAt(point: { x: number; y: number }, rooms: MeasuredRoom[]): MeasuredRoom | null {
  let nearest: { room: MeasuredRoom; distance: number } | null = null;
  for (const entry of rooms) {
    if (pointInRects(point, entry.rects)) return entry;
    const distance = distanceToRects(point, entry.rects);
    if (!nearest || distance < nearest.distance) nearest = { room: entry, distance };
  }
  return nearest?.room ?? null;
}

export type BuildSceneOptions = {
  /** Ceiling height. Only a caller with a measured one should pass it. */
  wallHeightM?: number;
  /**
   * The audience's rules. A haredi still renders a drawn double rectangle as
   * one modest single along the long wall — the one place in the engine where
   * what is built is not simply the box that was measured, and it is a rule,
   * not a liberty.
   */
  haredi?: boolean;
  /** The full rule set, where the caller has the style kit in hand. */
  rules?: AudienceRules;
};

/**
 * What the builder needs, in page units — and no more than that.
 *
 * Two things produce it: a measured BuiltFlat, which has everything, and a
 * stored geometry payload, which has what was persisted. Keeping the builder
 * behind this shape means the viewer and the renderer draw the same scene from
 * whichever of the two is in hand.
 */
export type SceneInput = {
  unitsPerMetre: number;
  bounds: { x: number; y: number; width: number; height: number };
  bodies: Band[];
  openings: Array<Band & { kind: SceneOpeningKind | "door" | "window" | "opening" }>;
  /** The walkable region, already merged into rectangles. */
  floorRects: Rect[];
  terraceRects: Rect[][];
  furniture: Array<{ x: number; y: number; w: number; h: number; kind: string }>;
  rooms: Array<{ name: string; kind: string; areaM2: number; rects: Rect[] }>;
  /**
   * The rooms as the sheet labels them, in page units.
   *
   * Where the segmenter missed a doorway its flood ran through it and two
   * rooms came back as one — on דירה 14, four rooms with one of them 41 m²
   * against nine names printed on the sheet. These are those names, and the
   * floor is split by them: the region stays exactly what was measured, and
   * only the question of which room each part of it belongs to is answered
   * from the drawing's own text rather than from the flood.
   */
  labelledRooms?: Array<{ name: string; kind: string; box: Rect }>;
};

/**
 * Which rooms the scene draws: the segmenter's, or the sheet's own labels.
 *
 * The labels win when the sheet names more rooms than the flood found, which
 * is what happens whenever a doorway was missed. Each labelled room takes the
 * measured floor rectangles whose centres fall inside the box its name was
 * read at; a rectangle no label claims stays with the segmenter's answer, so
 * nothing measured is ever dropped and nothing unmeasured is ever added.
 */
export function roomsForScene(input: SceneInput): SceneInput["rooms"] {
  const labelled = input.labelledRooms ?? [];
  if (labelled.length <= input.rooms.length) return input.rooms;

  // Claimed by value, not by reference: the segmenter's rectangles and the
  // floor's are equal numbers in different objects.
  const keyOf = (rect: Rect) => `${rect.x}:${rect.y}:${rect.w}:${rect.h}`;
  const claimed = new Set<string>();
  const out: SceneInput["rooms"] = [];
  for (const label of labelled) {
    const mine = input.floorRects.filter((rect) => {
      if (claimed.has(keyOf(rect))) return false;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      return (
        cx >= label.box.x &&
        cx <= label.box.x + label.box.w &&
        cy >= label.box.y &&
        cy <= label.box.y + label.box.h
      );
    });
    if (mine.length === 0) continue;
    for (const rect of mine) claimed.add(keyOf(rect));
    const areaUnits = mine.reduce((sum, r) => sum + r.w * r.h, 0);
    out.push({
      name: label.name,
      kind: label.kind,
      areaM2: areaUnits / (input.unitsPerMetre * input.unitsPerMetre),
      rects: mine,
    });
  }
  // Floor no label claimed keeps the room the flood gave it.
  for (const room of input.rooms) {
    const left = room.rects.filter((rect) => !claimed.has(keyOf(rect)));
    if (left.length > 0) out.push({ ...room, rects: left });
  }
  return out.length > 0 ? out : input.rooms;
}

/** The measured flat, which carries every region as scan rows. */
export function sceneInputFromFlat(flat: BuiltFlat, rooms: SegmentedRoom[]): SceneInput {
  return {
    unitsPerMetre: flat.unitsPerMetre,
    bounds: flat.bounds,
    bodies: flat.bodies,
    openings: flat.openings,
    floorRects: mergeSpanRows(flat.floor),
    terraceRects: flat.terraces.map((rows) => mergeSpanRows(rows)),
    furniture: flat.furniture,
    rooms: rooms.map((room) => ({
      name: room.name,
      kind: room.kind,
      areaM2: room.areaM2,
      rects: mergeSpanRows(room.rows),
    })),
  };
}

export function buildFlatScene(
  flat: BuiltFlat,
  rooms: SegmentedRoom[],
  options?: BuildSceneOptions,
): FlatScene {
  return buildScene(sceneInputFromFlat(flat, rooms), options);
}

export function buildScene(input: SceneInput, options?: BuildSceneOptions): FlatScene {
  const flat = input;
  const upm = input.unitsPerMetre;
  const wallHeightM = options?.wallHeightM ?? WALL_HEIGHT_M;

  const roomRects: MeasuredRoom[] = roomsForScene(input).map((room, index) => ({
    room,
    index,
    rects: room.rects,
  }));
  const terraceRects = input.terraceRects;
  /**
   * Floor no room claims, and too narrow to walk on, is not floor.
   *
   * The floor is flooded from the drawing's lines, and two parallel lines a
   * hand's width apart make a channel the flood runs down: on דירה 14 the
   * sheet's own grid left a strip 13 metres long and a few tens of centimetres
   * wide down the side of the flat. Its wall had already gone; the strip stayed
   * and drew as a plank of timber standing off the apartment, stretching the
   * frame. A room is never that narrow, and a threshold is claimed by a room.
   */
  const roomRectsAll = roomsForScene(input).flatMap((room) => room.rects);
  const minWalkable = 0.7 * upm;
  const floorRects = input.floorRects.filter(
    (rect) => Math.min(rect.w, rect.h) >= minWalkable || pointInRects(rectCentre(rect), roomRectsAll),
  );

  // The apartment's own ground: what it is measured to stand on.
  const printed = { x: flat.bounds.x, y: flat.bounds.y, w: flat.bounds.width, h: flat.bounds.height };
  // The floor the segmenter walked, and the terraces — not the printed box.
  // The box is the flat's bounding rectangle, and a neighbour's wall running
  // along its edge sits inside it: on דירה 14 that is how a two-storey slab
  // belonging to the flat next door stayed in the frame.
  const walked = [...floorRects, ...terraceRects.flat()];
  const ground = walked.length > 0 ? walked : [printed];

  /**
   * Walls that belong to this apartment.
   *
   * A sales sheet carries the neighbours too, and the measurement returns
   * their walls along with ours. Drawn, they are a slab standing in the
   * background of the still; worse, they stretch the extent the camera is
   * framed on, and the flat comes out small in the middle of an empty frame —
   * which is exactly what דירה 14 looked like. A wall that touches nothing we
   * measured as floor is not ours.
   */
  const reach = 0.35 * upm;
  const touchesGround = (rect: Rect, margin: number): boolean =>
    ground.some(
      (g) =>
        rect.x - margin < g.x + g.w &&
        rect.x + rect.w + margin > g.x &&
        rect.y - margin < g.y + g.h &&
        rect.y + rect.h + margin > g.y,
    );
  const bodies = input.bodies.filter((body) => touchesGround(bandToRect(body), reach));
  // A piece of furniture standing on no floor we measured is the neighbour's
  // too, and it stretched the frame the same way.
  const furniture = input.furniture.filter((piece) =>
    touchesGround({ x: piece.x, y: piece.y, w: piece.w, h: piece.h }, 0),
  );

  const spanned = rectsBounds([
    printed,
    ...bodies.map(bandToRect),
    ...floorRects,
    ...terraceRects.flat(),
  ]) ?? printed;
  const p: Projection = { upm, cx: spanned.x + spanned.w / 2, cy: spanned.y + spanned.h / 2 };

  const meshes: SceneBox[] = [];
  const openings: SceneOpening[] = [];

  // --- openings, first: the walls are built around them.
  const holes: WallHole[] = [];
  flat.openings.forEach((opening, index) => {
    const rect = bandToRect(opening);
    const centre = rectCentre(rect);
    const host = roomAt(centre, roomRects);
    const clearM = Math.max(rect.w, rect.h) / upm;
    const onTerrace = terraceRects.some((rects) => distanceToRects(centre, rects) <= upm * 0.6);
    const kind: SceneOpeningKind =
      opening.kind === "window" && onTerrace && clearM >= SLIDER_MIN_CLEAR_M
        ? "slider"
        : (opening.kind as SceneOpeningKind);
    const { sillM, headM } = openingHeights(kind, isWetRoom((host?.room.kind ?? "other") as SceneRoomKind));
    const id = `opening:${index}`;
    holes.push({ id, hole: opening, sillM, headM });

    const box = boxFrom(p, rect, sillM, headM, "glazing", "glass", id);
    openings.push({
      id,
      kind,
      centre: box.centre,
      size: box.size,
      sillM,
      headM,
      exterior: kind === "window" || kind === "slider",
    });
    // Glass only where there is glass: a doorway is a hole, not a pane.
    if (kind === "window" || kind === "slider") {
      meshes.push({ ...box, size: { ...box.size, ...glazingThickness(opening, box.size) } });
    }
  });

  // --- walls, with their heads and sills, and a skirting where a wall meets
  // a room that is not a wet one. The skirting is the cheapest detail in the
  // engine and the one that does most for reading as a photograph.
  bodies.forEach((body, index) => {
    for (const band of wallBands(body, holes, wallHeightM)) {
      const rect = bandRect(body, band);
      const source = band.openingId ? `${band.openingId}/${band.role}` : `wall:${index}`;
      meshes.push(
        boxFrom(
          p,
          rect,
          band.y0,
          band.y1,
          band.role === "wall" ? "wall" : band.role === "head" ? "wallHead" : "wallSill",
          "wall",
          source,
        ),
      );
      if (band.role !== "wall") continue;

      // Both faces of the band: whichever of them opens onto a dry room gets
      // a skirting along it.
      const proud = SKIRTING_PROUD_M * upm;
      const reach = 0.06 * upm;
      for (const side of [-1, 1] as const) {
        const probe =
          body.orientation === "h"
            ? { x: (rect.x + rect.x + rect.w) / 2, y: body.centre + side * (body.thickness / 2 + reach) }
            : { x: body.centre + side * (body.thickness / 2 + reach), y: (rect.y + rect.y + rect.h) / 2 };
        const room = roomRects.find((entry) => pointInRects(probe, entry.rects));
        const kind = (room?.room.kind ?? "") as SceneRoomKind;
        if (!room || isWetRoom(kind) || kind === "balcony") continue;
        const strip: Rect =
          body.orientation === "h"
            ? {
                x: rect.x,
                y: body.centre + side * (body.thickness / 2) - (side < 0 ? proud : 0),
                w: rect.w,
                h: proud,
              }
            : {
                x: body.centre + side * (body.thickness / 2) - (side < 0 ? proud : 0),
                y: rect.y,
                w: proud,
                h: rect.h,
              };
        meshes.push(
          boxFrom(p, strip, 0, SKIRTING_H_M, "skirting", "skirting", `${source}/skirting`),
        );
      }
    }
  });

  // --- the frame around each opening, set into the hole so an opening reads
  // as a made thing rather than as a subtraction.
  flat.openings.forEach((opening, index) => {
    const id = `opening:${index}`;
    const hole = holes.find((h) => h.id === id);
    if (!hole) return;
    const rect = bandToRect(opening);
    const inset = FRAME_INSET_M * upm;
    const jamb = FRAME_T_M * upm;
    const along = opening.orientation === "h" ? rect.w : rect.h;
    if (along <= jamb * 2.2) return;
    const frames: Array<{ rect: Rect; y0: number; y1: number }> = [];
    if (opening.orientation === "h") {
      frames.push(
        { rect: { x: rect.x, y: rect.y + inset, w: jamb, h: rect.h - inset * 2 }, y0: hole.sillM, y1: hole.headM },
        {
          rect: { x: rect.x + rect.w - jamb, y: rect.y + inset, w: jamb, h: rect.h - inset * 2 },
          y0: hole.sillM,
          y1: hole.headM,
        },
      );
    } else {
      frames.push(
        { rect: { x: rect.x + inset, y: rect.y, w: rect.w - inset * 2, h: jamb }, y0: hole.sillM, y1: hole.headM },
        {
          rect: { x: rect.x + inset, y: rect.y + rect.h - jamb, w: rect.w - inset * 2, h: jamb },
          y0: hole.sillM,
          y1: hole.headM,
        },
      );
    }
    for (const frame of frames) {
      meshes.push(boxFrom(p, frame.rect, frame.y0, frame.y1, "frame", "joinery", `${id}/frame`));
    }
  });

  // --- floors, one material per room kind, cut to the measured region.
  const sceneRooms: SceneRoom[] = roomRects.map(({ room, rects, index }) => {
    const kind = room.kind as SceneRoomKind;
    const material = FLOOR_MATERIAL[kind] ?? "floorWood";
    const id = `room:${index}`;
    for (const rect of rects) {
      meshes.push(boxFrom(p, rect, -FLOOR_T_M, 0, "floor", material, id));
    }
    const bounds = rectsBounds(rects) ?? { x: 0, y: 0, w: 0, h: 0 };
    const topLeft = project(p, bounds.x, bounds.y);
    return {
      id,
      name: room.name,
      kind,
      areaM2: room.areaM2,
      rects: rects.map((r) => {
        const corner = project(p, r.x, r.y);
        return { x: corner.x, z: corner.z, w: r.w / upm, d: r.h / upm };
      }),
      bounds: { x: topLeft.x, z: topLeft.z, w: bounds.w / upm, d: bounds.h / upm },
    };
  });

  // Floor the segmenter did not claim for any room — thresholds, the odd sliver
  // — still has to be walked on, so it is laid in the neutral timber.
  const claimed = roomRects.flatMap((entry) => entry.rects);
  for (const rect of floorRects) {
    if (pointInRects(rectCentre(rect), claimed)) continue;
    meshes.push(boxFrom(p, rect, -FLOOR_T_M, 0, "floor", "floorWood", "floor:unclaimed"));
  }

  // --- terraces, and the railing along the edges that are not walls.
  terraceRects.forEach((rects, index) => {
    const id = `terrace:${index}`;
    for (const rect of rects) {
      meshes.push(boxFrom(p, rect, -TERRACE_DROP_M - FLOOR_T_M, -TERRACE_DROP_M, "terrace", "floorStone", id));
    }
    const wallRects = bodies.map(bandToRect);
    for (const edge of outlineEdges(rects)) {
      const rect: Rect =
        edge.orientation === "h"
          ? { x: edge.from, y: edge.at - GLASS_T_M * upm * 0.5, w: edge.to - edge.from, h: GLASS_T_M * upm }
          : { x: edge.at - GLASS_T_M * upm * 0.5, y: edge.from, w: GLASS_T_M * upm, h: edge.to - edge.from };
      // An edge the flat's own wall stands on is a wall, not a drop.
      if (distanceToRects(rectCentre(rect), wallRects) <= upm * 0.12) continue;
      meshes.push(boxFrom(p, rect, -TERRACE_DROP_M, RAILING_H_M - RAIL_CAP_M, "railing", "glass", id));
      meshes.push(
        boxFrom(p, rect, RAILING_H_M - RAIL_CAP_M, RAILING_H_M, "railing", "metal", `${id}/cap`),
      );
    }
  });

  // --- furniture: each measured block, built as the thing it was measured to
  // be, facing the way the measured geometry around it decides.
  const wallRectsAll = bodies.map(bandToRect);
  const anchorRects = furniture
    .filter((piece) => piece.kind === "counter" || piece.kind === "table")
    .map((piece) => ({ x: piece.x, y: piece.y, w: piece.w, h: piece.h }));

  furniture.forEach((piece, index) => {
    const box: Rect = { x: piece.x, y: piece.y, w: piece.w, h: piece.h };
    const height = FURNITURE_HEIGHT_M[piece.kind] ?? DEFAULT_FURNITURE_HEIGHT_M;
    const host = roomAt(rectCentre(box), roomRects);
    const hostBounds = host ? rectsBounds(host.rects) : null;
    const decided = facingFor({
      piece: box,
      walls: wallRectsAll,
      anchors: anchorRects.filter((rect) => rect !== box),
      roomCentre: hostBounds
        ? { x: hostBounds.x + hostBounds.w / 2, y: hostBounds.y + hostBounds.h / 2 }
        : rectCentre(box),
      unitsPerMetre: upm,
    });
    const facing = piece.kind === "bed" ? headFacing(box, decided) : decided;
    const centre = project(p, box.x + box.w / 2, box.y + box.h / 2);
    for (const built of partsFor(piece.kind, {
      wM: box.w / upm,
      dM: box.h / upm,
      hM: height,
      facing,
      haredi: options?.rules?.singleBeds ?? options?.haredi,
    })) {
      meshes.push({
        kind: "furniture",
        material: built.material,
        centre: { x: centre.x + built.x, y: built.y, z: centre.z + built.z },
        size: { x: built.w, y: built.h, z: built.d },
        sourceId: `furniture:${index}/${built.tag}`,
      });
    }
  });

  const extentCorner = project(p, spanned.x, spanned.y);
  const scene: FlatScene = {
    version: 1,
    unitsPerMetre: upm,
    extent: {
      x: extentCorner.x,
      z: extentCorner.z,
      width: spanned.w / upm,
      depth: spanned.h / upm,
    },
    meshes,
    rooms: sceneRooms,
    openings,
    lights: [],
  };

  // --- staging: props and lamps, each one resting on something measured.
  const rules = options?.rules ?? rulesFor(options?.haredi ? "haredi" : "general");
  const staged = stageScene(scene, rules);
  scene.meshes.push(...staged.props);
  if (rules.mezuzah) scene.meshes.push(...mezuzot(scene));
  scene.lights.push(...staged.lights);
  return scene;
}

/** Glazing sits in the middle of the wall, not across its whole thickness. */
function glazingThickness(
  opening: Band,
  size: { x: number; y: number; z: number },
): { x: number } | { z: number } {
  return opening.orientation === "h" ? { z: Math.min(size.z, GLASS_T_M) } : { x: Math.min(size.x, GLASS_T_M) };
}
