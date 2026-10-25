import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import { fillEnclosedHoles, mergeSpanRows, outlineEdges, rectsBounds, type Rect } from "@/lib/projects/scene3d/floors";
import {
  DEFAULT_FURNITURE_HEIGHT_M,
  DOOR_LEAF_T_M,
  FRAME_INSET_M,
  FRAME_T_M,
  SKIRTING_H_M,
  SKIRTING_PROUD_M,
  FLOOR_T_M,
  FURNITURE_HEIGHT_M,
  GLASS_T_M,
  RAILING_H_M,
  RAIL_CAP_W_M,
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
import { partsFor, type PieceSpec } from "@/lib/projects/scene3d/furniture";
import { rulesFor, type AudienceRules } from "@/lib/projects/scene3d/rules";
import { mezuzot, stageScene } from "@/lib/projects/scene3d/staging";
import { openingHeights } from "@/lib/projects/scene3d/openings";
import { backFacing, facingFor, headFacing } from "@/lib/projects/scene3d/orientation";
import { doubleSinks } from "@/lib/projects/scene3d/furniture/sinks";
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

/**
 * The measured room a point belongs to, or the nearest one to it. Where rooms
 * overlap, the smallest: a segmented region and the labelled rooms within it
 * both come through, and דירה 14's bath and pans, assigned to a 28 m²
 * "bedroom" that also covered both bathrooms, were dropped as fixtures in a
 * dry room.
 */
function roomAt(point: { x: number; y: number }, rooms: MeasuredRoom[]): MeasuredRoom | null {
  let nearest: { room: MeasuredRoom; distance: number } | null = null;
  let within: { room: MeasuredRoom; area: number } | null = null;
  for (const entry of rooms) {
    if (pointInRects(point, entry.rects)) {
      const area = entry.rects.reduce((sum, r) => sum + r.w * r.h, 0);
      if (!within || area < within.area) within = { room: entry, area };
      continue;
    }
    const distance = distanceToRects(point, entry.rects);
    if (!nearest || distance < nearest.distance) nearest = { room: entry, distance };
  }
  return within?.room ?? nearest?.room ?? null;
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
  openings: Array<Band & { kind: SceneOpeningKind | "door" | "window" | "opening"; leaf?: { x: number; y: number; dx: number; dy: number } }>;
  /** The walkable region, already merged into rectangles. */
  floorRects: Rect[];
  terraceRects: Rect[][];
  furniture: Array<{ x: number; y: number; w: number; h: number; kind: string; fixture?: PieceSpec["fixture"]; head?: "north" | "south" | "east" | "west"; drawn?: boolean }>;
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
 * Which rooms the scene draws: the segmenter's, each split by the sheet's own
 * labels only where two or more of them name it.
 *
 * A missed doorway lets the flood run from one room into the next, and the
 * two come back as one: such a room carries two names, and its rectangles go
 * each to the name whose box holds its middle, or else to the nearest name.
 * A room with one name, or none, is the segmenter's as measured. The labels
 * used to re-cut the whole floor whenever the sheet named more rooms than the
 * flood found — and a label's box is a model's reading of where a word is
 * printed, not a room: on 18 a "bathroom" claimed 22.7 m² of strips running
 * across the flat, on 16 one claimed 13.6, and every flat was drawn with two
 * sets of rooms, one over the other. Nothing measured is dropped, and nothing
 * unmeasured is added.
 */
export function roomsForScene(input: SceneInput): SceneInput["rooms"] {
  const labelled = input.labelledRooms ?? [];
  if (labelled.length === 0) return input.rooms;
  const centre = (box: Rect) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  const holds = (rects: Rect[], x: number, y: number) =>
    rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  const out: SceneInput["rooms"] = [];
  for (const room of input.rooms) {
    const names = labelled.filter((label) => {
      const c = centre(label.box);
      return holds(room.rects, c.x, c.y);
    });
    if (names.length < 2 || room.kind === "balcony") {
      out.push(room);
      continue;
    }
    const parts = new Map<number, Rect[]>();
    for (const rect of room.rects) {
      const c = centre(rect);
      const inBox = names.findIndex(
        (label) => c.x >= label.box.x && c.x <= label.box.x + label.box.w && c.y >= label.box.y && c.y <= label.box.y + label.box.h,
      );
      const nearest =
        inBox >= 0
          ? inBox
          : names.reduce((best, label, k) => {
              const d = (l: typeof label) => Math.hypot(centre(l.box).x - c.x, centre(l.box).y - c.y);
              return d(label) < d(names[best]!) ? k : best;
            }, 0);
      parts.set(nearest, [...(parts.get(nearest) ?? []), rect]);
    }
    for (const [k, rects] of parts) {
      const label = names[k]!;
      out.push({
        name: label.name,
        kind: label.kind,
        areaM2: rects.reduce((sum, r) => sum + r.w * r.h, 0) / (input.unitsPerMetre * input.unitsPerMetre),
        rects,
      });
    }
  }
  return out;
}

/**
 * Whether a point is shut in on all four sides: a ray from it, left, right,
 * up and down, meets one of the blockers before it runs off the drawing.
 */
export function enclosedOnFourSides(point: { x: number; y: number }, blockers: Rect[]): boolean {
  const spansY = (r: Rect) => point.y >= r.y && point.y <= r.y + r.h;
  const spansX = (r: Rect) => point.x >= r.x && point.x <= r.x + r.w;
  return (
    blockers.some((r) => spansY(r) && r.x + r.w <= point.x) &&
    blockers.some((r) => spansY(r) && r.x >= point.x) &&
    blockers.some((r) => spansX(r) && r.y + r.h <= point.y) &&
    blockers.some((r) => spansX(r) && r.y >= point.y)
  );
}

/**
 * A rect cut along its longer side into slices of about `step`, each judged by
 * enclosedOnFourSides at its centre, with neighbouring slices that agree
 * joined back into one run.
 */
export function slicesByEnclosure(
  rect: Rect,
  blockers: Rect[],
  step: number,
): Array<{ rect: Rect; inside: boolean }> {
  const horizontal = rect.w >= rect.h;
  const length = horizontal ? rect.w : rect.h;
  const count = Math.max(1, Math.round(length / step));
  const size = length / count;
  const runs: Array<{ rect: Rect; inside: boolean }> = [];
  for (let i = 0; i < count; i++) {
    const slice: Rect = horizontal
      ? { x: rect.x + i * size, y: rect.y, w: size, h: rect.h }
      : { x: rect.x, y: rect.y + i * size, w: rect.w, h: size };
    const inside = enclosedOnFourSides(rectCentre(slice), blockers);
    const last = runs[runs.length - 1];
    if (last && last.inside === inside) {
      if (horizontal) last.rect.w += size;
      else last.rect.h += size;
    } else {
      runs.push({ rect: slice, inside });
    }
  }
  return runs;
}

/** The measured flat, which carries every region as scan rows. */
export function sceneInputFromFlat(flat: BuiltFlat, rooms: SegmentedRoom[]): SceneInput {
  return {
    unitsPerMetre: flat.unitsPerMetre,
    bounds: flat.bounds,
    bodies: flat.bodies,
    openings: flat.openings,
    floorRects: mergeSpanRows(flat.floor),
    terraceRects: flat.terraces.map((rows) => mergeSpanRows(fillEnclosedHoles(rows, 0.5 * flat.unitsPerMetre ** 2))),
    furniture: flat.furniture,
    rooms: rooms.map((room) => ({
      name: room.name,
      kind: room.kind,
      areaM2: room.areaM2,
      rects: mergeSpanRows(fillEnclosedHoles(room.rows, 0.5 * flat.unitsPerMetre ** 2)),
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
  // With the rooms' own regions: a WC's floor comes as strips too narrow to
  // keep alone, and 21's pan stood on none of them.
  const walked = [...floorRects, ...roomRectsAll, ...terraceRects.flat()];
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
  // Sanitary ware within a hand of it: a pan's own ink stops the floor's
  // flood, and 21's WC pan stood on no floor of its own and was dropped.
  // A piece the drawing names (a CAD block) stands where it is drawn: the
  // guards below are against lines misread as furniture, and they dropped
  // Gottlieb A's beds, baths and basins where its DXF's hatch broke the rooms up.
  const grounded = input.furniture.filter((piece) =>
    piece.drawn || touchesGround({ x: piece.x, y: piece.y, w: piece.w, h: piece.h }, piece.kind === "fixture" ? 0.3 * upm : 0),
  );
  // One drawn object is one piece. The detector can find a rectangle twice a
  // few millimetres apart, and דירה 15 got two beds in one place.
  const furniture = grounded.filter(
    (piece, i) =>
      !grounded.slice(0, i).some((other) => {
        if (other.kind !== piece.kind) return false;
        const ox = Math.min(piece.x + piece.w, other.x + other.w) - Math.max(piece.x, other.x);
        const oy = Math.min(piece.y + piece.h, other.y + other.h) - Math.max(piece.y, other.y);
        return ox > 0 && oy > 0 && ox * oy > 0.7 * Math.min(piece.w * piece.h, other.w * other.h);
      }),
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
  // One leaf a hinge: a door read as two openings has one leaf.
  const leaves = new Set<string>();
  flat.openings.forEach((opening, index) => {
    const rect = bandToRect(opening);
    const centre = rectCentre(rect);
    const host = roomAt(centre, roomRects);
    const clearM = Math.max(rect.w, rect.h) / upm;
    const onTerrace = terraceRects.some((rects) => distanceToRects(centre, rects) <= upm * 0.6);
    const kind: SceneOpeningKind = sceneOpeningKind(opening, {
      onTerrace,
      clearM,
      roomKindAt: (x, y) => roomRects.find((room) => pointInRects({ x, y }, room.rects))?.room.kind,
      onFloor: (x, y) => pointInRects({ x, y }, floorRects),
      stepUnits: upm * 0.3,
    });
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
    // A door stands open as the sheet draws it: its leaf square to the wall
    // at the hinge, the length of the swing's radius.
    const hinge = opening.leaf ? `${Math.round(opening.leaf.x)},${Math.round(opening.leaf.y)}` : "";
    if (kind === "door" && opening.leaf && !leaves.has(hinge)) {
      leaves.add(hinge);
      const { x, y, dx, dy } = opening.leaf;
      const t = DOOR_LEAF_T_M * upm;
      const leafRect: Rect =
        Math.abs(dx) >= Math.abs(dy)
          ? { x: Math.min(x, x + dx), y: y - t / 2, w: Math.abs(dx), h: t }
          : { x: x - t / 2, y: Math.min(y, y + dy), w: t, h: Math.abs(dy) };
      meshes.push(boxFrom(p, leafRect, 0.01, headM, "furniture", "joinery", `${id}/leaf`));
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
    const frameMaterial = openings[index]?.exterior ? "stoneFrame" : "joinery";
    for (const frame of frames) {
      meshes.push(boxFrom(p, frame.rect, frame.y0, frame.y1, "frame", frameMaterial, `${id}/frame`));
    }
  });

  // --- floors, one material per room kind, cut to the measured region.
  // Where measured rooms overlap — a segmented region and the labelled rooms
  // inside it both come through — the smallest lays its floor and the larger
  // only round it: two floors at one height in two materials fought, and the
  // render drew them as patches of boards and tiles.
  const floorOwner = new Map<number, Rect[]>();
  const laid: Rect[] = [];
  for (const entry of [...roomRects].sort((a, b) => rectsArea(a.rects) - rectsArea(b.rects))) {
    floorOwner.set(entry.index, subtractRects(entry.rects, laid));
    laid.push(...entry.rects);
  }
  const sceneRooms: SceneRoom[] = roomRects.map(({ room, rects, index }) => {
    const kind = room.kind as SceneRoomKind;
    const material = FLOOR_MATERIAL[kind] ?? "floorWood";
    const id = `room:${index}`;
    for (const rect of floorOwner.get(index) ?? rects) {
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
  // — still has to be walked on, so it is laid in the neutral timber. Floor
  // with open drawing on one side of it is outside the flat, and timber there
  // read as a deck stuck onto the building: דירה 22's two paved roofs at
  // +14.36 came out as floorboards past its outer walls. It is laid as pale
  // stone, as the sheet paves it.
  const claimed = roomRects.flatMap((entry) => entry.rects);
  const blockers = [...claimed, ...bodies.map(bandToRect)];
  // One scan rect can run from a roof, under an outer wall, into the flat —
  // דירה 22's strip along its north side crosses both roofs — so it is judged
  // in slices along its length, and each run of slices gets its own floor.
  // Less what the rooms claim, not dropped whole where its middle is in one:
  // 21's scan rect ran from its bathroom on down the corridor to the bottom
  // bedroom's door, and the corridor came out with no floor and the bedroom
  // with no way in.
  const unclaimed = subtractRects(floorRects, claimed).filter((r) => Math.min(r.w, r.h) >= minWalkable * 0.5);
  for (const rect of unclaimed) {
    for (const run of slicesByEnclosure(rect, blockers, upm * 0.25)) {
      // Inside the flat only. Outside it is the landing or the stair beside
      // the flat (21's came out tiled past its east wall), and a roof that is
      // not the flat's is no longer in its floor (see foreign).
      if (!run.inside) continue;
      meshes.push(boxFrom(p, run.rect, -FLOOR_T_M, 0, "floor", "floorWood", "floor:unclaimed"));
    }
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
      // An edge the flat's own wall stands on, or runs along a hand's breadth
      // off (the facade's cladding), is a wall, not a drop.
      if (distanceToRects(rectCentre(rect), wallRects) <= upm * 0.35) continue;
      const cap: Rect =
        edge.orientation === "h"
          ? { x: edge.from, y: edge.at - RAIL_CAP_W_M * upm * 0.5, w: edge.to - edge.from, h: RAIL_CAP_W_M * upm }
          : { x: edge.at - RAIL_CAP_W_M * upm * 0.5, y: edge.from, w: RAIL_CAP_W_M * upm, h: edge.to - edge.from };
      meshes.push(boxFrom(p, rect, -TERRACE_DROP_M, RAILING_H_M - RAIL_CAP_M, "railing", "glass", id));
      meshes.push(boxFrom(p, cap, RAILING_H_M - RAIL_CAP_M, RAILING_H_M, "railing", "metal", `${id}/cap`));
    }
  });

  // --- furniture: each measured block, built as the thing it was measured to
  // be, facing the way the measured geometry around it decides.
  const wallRectsAll = bodies.map(bandToRect);
  const anchorRects = furniture
    .filter((piece) => piece.kind === "counter" || piece.kind === "table")
    .map((piece) => ({ x: piece.x, y: piece.y, w: piece.w, h: piece.h }));

  const sinks = furniture.filter((piece) => piece.kind === "sink");
  const asDouble = doubleSinks(sinks, (options?.rules?.audience ?? (options?.haredi ? "haredi" : "general")) === "haredi", upm);
  const doubled = new Set(sinks.filter((_, i) => asDouble[i]));

  // The openings a counter's sinks sit in: a sink whose middle is inside a counter's rectangle cuts the counter's top and carcass (page frame, units).
  const sinkBoxes = sinks.map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h }));

  furniture.forEach((piece, index) => {
    const box: Rect = { x: piece.x, y: piece.y, w: piece.w, h: piece.h };
    const host = roomAt(rectCentre(box), roomRects);
    // A cabinet in a bathroom is the basin's vanity, at worktop height: built
    // as a wardrobe, דירה 18's stood two metres tall beside the bath.
    const kind =
      piece.kind === "storage" && host && isWetRoom(host.room.kind as SceneRoomKind) ? "counter" : piece.kind;
    const height = FURNITURE_HEIGHT_M[kind] ?? DEFAULT_FURNITURE_HEIGHT_M;
    // The written rules, kept here and not only asked of a model: a bed only
    // in a bedroom or the ממ"ד, a pan or a bath never in a dry room. A paving
    // hatch on דירה 15's roof terrace measured as a bed, and was drawn as one.
    // A bed whose middle fell just outside its bedroom — the segmenter closed
    // only part of דירה 21's corner bedroom, and the bed's centre landed in
    // the strip beside it — still stands where a quarter of it is in one.
    const inSleeping =
      piece.kind === "bed" &&
      roomRects.some(
        (room) =>
          SLEEPING.has(room.room.kind) &&
          // Or against it: a bed drawn whole along a bedroom's wall closes a strip
          // of its own the segmenter gives no kind (Gottlieb's upper bedrooms).
          (overlapArea(box, room.rects) >= 0.25 * box.w * box.h ||
            (host != null &&
              (host.room.kind === "circulation" || host.room.kind == null) &&
              host.rects.reduce((n, r) => n + r.w * r.h, 0) <= 2.5 * box.w * box.h &&
              room.rects.some((r) => Math.max(r.x - (box.x + box.w), box.x - (r.x + r.w), 0) <= 0.3 * input.unitsPerMetre && Math.max(r.y - (box.y + box.h), box.y - (r.y + r.h), 0) <= 0.3 * input.unitsPerMetre))),
      );
    // A pan beside a bathroom whose measured region stops short of it — the
    // label's region covered half of דירה 14's main bathroom, and its WC and
    // washer fell in the dry region round it — is that bathroom's.
    const besideWet =
      piece.kind === "fixture" &&
      roomRects.some(
        (room) => isWetRoom(room.room.kind as SceneRoomKind) && distanceToRects(rectCentre(box), room.rects) <= input.unitsPerMetre * 1.2,
      );
    if (!piece.drawn && !inSleeping && !besideWet && !pieceBelongsIn(piece.kind, host?.room.kind)) return;
    const hostBounds = host ? rectsBounds(host.rects) : null;
    const decided = facingFor({
      piece: box,
      walls: wallRectsAll,
      anchors: anchorRects.filter((rect) => rect !== box),
      seat: piece.kind === "seat",
      roomCentre: hostBounds
        ? { x: hostBounds.x + hostBounds.w / 2, y: hostBounds.y + hostBounds.h / 2 }
        : rectCentre(box),
      unitsPerMetre: upm,
    });
    // A bed's head where the sheet draws its pillow; else by the walls.
    // A pan's back where the sheet draws its cistern; see pansFromCisterns.
    const facing =
      piece.kind === "bed"
        ? (piece.head ?? headFacing(box, decided, wallRectsAll))
        : piece.kind === "fixture" && piece.fixture === "toilet" && piece.head
          ? piece.head
          : piece.kind === "seat" || piece.kind === "storage"
            // A wardrobe, like a sofa, has its back on a long side: its doors on the long face, not at an end the nearest wall happened to be.
            ? backFacing(box, decided, wallRectsAll, hostBounds ? { x: hostBounds.x + hostBounds.w / 2, y: hostBounds.y + hostBounds.h / 2 } : rectCentre(box), upm)
            : decided;
    const centre = project(p, box.x + box.w / 2, box.y + box.h / 2);
    // A tall cabinet in a kitchen is its fridge or an appliance column,
    // painted with the kitchen's joinery: a wardrobe is wood, a fridge is not.
    // So is one as deep as it is wide: a wardrobe is 60 deep, a fridge 70 and more.
    const kitchenColumn = kind === "storage" && (host?.room.kind === "kitchen" || Math.min(box.w, box.h) / upm >= 0.7);
    // Openings in this counter, turned into the piece's own frame (the inverse of the turn rotatePart makes).
    const holes =
      kind === "counter"
        ? sinkBoxes
            .filter((q) => q.x + q.w / 2 > box.x && q.x + q.w / 2 < box.x + box.w && q.y + q.h / 2 > box.y && q.y + q.h / 2 < box.y + box.h)
            .map((q) => {
              const X = (q.x + q.w / 2 - (box.x + box.w / 2)) / upm;
              const Z = (q.y + q.h / 2 - (box.y + box.h / 2)) / upm;
              const [qw, qd] = [q.w / upm, q.h / upm];
              const w2 = Math.max(0.1, qw - 0.06), d2 = Math.max(0.1, qd - 0.08);
              const [x, z] = facing === "north" ? [X, Z] : facing === "south" ? [-X, -Z] : facing === "east" ? [Z, -X] : [-Z, X];
              return facing === "east" || facing === "west" ? { x, z, w: d2, d: w2 } : { x, z, w: w2, d: d2 };
            })
        : [];
    for (const built of partsFor(kind, {
      wM: box.w / upm,
      dM: box.h / upm,
      hM: height,
      facing,
      haredi: options?.rules?.singleBeds ?? options?.haredi,
      ...(piece.fixture ? { fixture: piece.fixture } : {}),
      ...(doubled.has(piece) ? { double: true } : {}),
      ...(holes.length ? { holes } : {}),
    })) {
      const painted = kitchenColumn && (built.material === "timber" || built.material === "joinery");
      meshes.push({
        kind: "furniture",
        material: painted ? "joinery" : built.material,
        centre: { x: centre.x + built.x, y: built.y, z: centre.z + built.z },
        // A form turned a quarter by its facing: `size` is its footprint on the page's axes, the geometry keeps its own extents.
        size: built.rotY && Math.abs(Math.sin(built.rotY)) > 0.999 ? { x: built.d, y: built.h, z: built.w } : { x: built.w, y: built.h, z: built.d },
        ...(built.rotY && Math.abs(Math.sin(built.rotY)) > 0.999 ? { local: { x: built.w, y: built.h, z: built.d } } : {}),
        sourceId: `furniture:${index}/${painted && built.tag === "door" ? "front" : built.tag}`,
        ...(built.round ? { round: built.round } : {}),
        ...(built.shape ? { shape: built.shape } : {}),
        ...(built.rotY ? { rotY: built.rotY } : {}),
        ...(built.tiltX ? { tiltX: built.tiltX } : {}),
        ...(built.tiltZ ? { tiltZ: built.tiltZ } : {}),
      });
    }
  });

  const extentCorner = project(p, spanned.x, spanned.y);
  const standing = wallsBesideFloor(meshes);
  // An opening needs a wall to be in: one whose wall, head and sill all went
  // stands in nothing — 18's "door" on the line of the level figure at its
  // terrace's edge kept its frame, its leaf and a mezuzah, floating.
  const walled = standing.filter((m) => m.kind === "wall" || m.kind === "wallHead" || m.kind === "wallSill");
  const orphaned = new Set(
    openings
      .filter((o) => {
        const reach = 0.15;
        return !walled.some(
          (m) =>
            Math.abs(m.centre.x - o.centre.x) <= (m.size.x + o.size.x) / 2 + reach &&
            Math.abs(m.centre.z - o.centre.z) <= (m.size.z + o.size.z) / 2 + reach,
        );
      })
      .map((o) => o.id),
  );
  // Nor a wall that touches nothing — no floor, terrace or other wall within
  // a hand of it: 21's 5 by 12 cm sliver stood on its own (see auditFlatScene).
  {
    const box = (m: SceneBox) => ({ x0: m.centre.x - m.size.x / 2 - 0.15, x1: m.centre.x + m.size.x / 2 + 0.15, z0: m.centre.z - m.size.z / 2 - 0.15, z1: m.centre.z + m.size.z / 2 + 0.15 });
    const meets = (a: ReturnType<typeof box>, m: SceneBox) =>
      a.x0 <= m.centre.x + m.size.x / 2 && a.x1 >= m.centre.x - m.size.x / 2 && a.z0 <= m.centre.z + m.size.z / 2 && a.z1 >= m.centre.z - m.size.z / 2;
    const ground = standing.filter((m) => m.kind === "floor" || m.kind === "terrace");
    const built = standing.filter((m) => m.kind === "wall" || m.kind === "wallSill" || m.kind === "wallHead" || m.kind === "wallCap");
    for (let i = standing.length - 1; i >= 0; i--) {
      const m = standing[i]!;
      if (m.kind !== "wall") continue;
      const b = box(m);
      if (!ground.some((g) => meets(b, g)) && !built.some((w) => w !== m && meets(b, w))) standing.splice(i, 1);
    }
  }
  // Nor a skirting whose wall went: 18's stub left its two white strips.
  const wallsLeft = new Set(standing.filter((m) => m.kind === "wall").map((m) => m.sourceId));
  meshes.length = 0;
  meshes.push(
    ...standing.filter(
      (m) =>
        !orphaned.has(m.sourceId.split("/")[0]!) &&
        !(m.kind === "skirting" && m.sourceId.startsWith("wall:") && !wallsLeft.has(m.sourceId.split("/")[0]!)),
    ),
  );
  if (orphaned.size > 0) openings.splice(0, openings.length, ...openings.filter((o) => !orphaned.has(o.id)));
  const scene: FlatScene = {
    version: 1,
    unitsPerMetre: upm,
    pageCentre: { x: p.cx, y: p.cy },
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

function rectsArea(rects: Rect[]): number {
  return rects.reduce((sum, r) => sum + r.w * r.h, 0);
}

/** Each rectangle with the cutters taken out of it, as rectangles. */
export function subtractRects(rects: Rect[], cutters: Rect[]): Rect[] {
  let out = rects;
  for (const c of cutters) {
    const next: Rect[] = [];
    for (const r of out) {
      const x0 = Math.max(r.x, c.x);
      const x1 = Math.min(r.x + r.w, c.x + c.w);
      const y0 = Math.max(r.y, c.y);
      const y1 = Math.min(r.y + r.h, c.y + c.h);
      if (x1 <= x0 || y1 <= y0) {
        next.push(r);
        continue;
      }
      // Above, below, and the two sides of the overlap.
      if (y0 > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: y0 - r.y });
      if (y1 < r.y + r.h) next.push({ x: r.x, y: y1, w: r.w, h: r.y + r.h - y1 });
      if (x0 > r.x) next.push({ x: r.x, y: y0, w: x0 - r.x, h: y1 - y0 });
      if (x1 < r.x + r.w) next.push({ x: x1, y: y0, w: r.x + r.w - x1, h: y1 - y0 });
    }
    out = next.filter((r) => r.w > 1e-6 && r.h > 1e-6);
  }
  return out;
}

// The windows and frames set in those walls go with them.
const STANDING_KINDS = new Set(["wall", "wallHead", "wallSill", "wallCap", "glazing", "frame"]);

/**
 * Walls only where a wall can stand: with the flat's floor beside it, or a
 * terrace's edge with nothing past it. The measurement also finds what is not
 * a wall — the underline and hatched circle of a level mark across דירה 18's
 * terrace, its outer walls run on into the terrace, a dimension chain — and a
 * design given those either drew them or was refused for leaving them out.
 * Each wall is cut to the stretches where it stands; a stretch with terrace
 * on both sides, or nothing on either, goes.
 */
export function wallsBesideFloor(meshes: SceneBox[]): SceneBox[] {
  const rectOf = (m: SceneBox) => ({ x0: m.centre.x - m.size.x / 2, x1: m.centre.x + m.size.x / 2, z0: m.centre.z - m.size.z / 2, z1: m.centre.z + m.size.z / 2 });
  const floors = meshes.filter((m) => m.kind === "floor").map(rectOf);
  const terraces = meshes.filter((m) => m.kind === "terrace").map(rectOf);
  if (floors.length === 0) return meshes;
  // 3 cm of slack: a slice's sample on the very edge of the floor is beside it.
  const E = 0.03;
  const inAny = (rects: ReturnType<typeof rectOf>[], x: number, z: number) =>
    rects.some((r) => x >= r.x0 - E && x <= r.x1 + E && z >= r.z0 - E && z <= r.z1 + E);
  // A side inside another wall is a corner, where the wall turns: it stands.
  const walls = meshes.filter((m) => m.kind === "wall").map(rectOf);
  // Terrace first: the flat's floor runs on under its terraces, and a stub
  // with terrace on both sides — 17's level mark's leader, read as a wall in
  // the middle of its terrace — stood on that floor.
  // Furniture stands on the flat's floor: the floor is flooded round a bed
  // or a wardrobe drawn against a wall, and 17's shelter lost its west wall
  // behind its bed.
  const furnished = meshes.filter((m) => m.kind === "furniture" && m.size.y > 0.15).map(rectOf);
  const side = (x: number, z: number) =>
    inAny(terraces, x, z)
      ? "terrace"
      : inAny(floors, x, z) || inAny(furnished, x, z)
        ? "floor"
        : inAny(walls, x, z)
          ? "wall"
          : "none";
  const STEP = 0.2;
  const out: SceneBox[] = [];
  for (const m of meshes) {
    if (!STANDING_KINDS.has(m.kind)) {
      out.push(m);
      continue;
    }
    const alongX = m.size.x >= m.size.z;
    const length = alongX ? m.size.x : m.size.z;
    const off = (alongX ? m.size.z : m.size.x) / 2 + 0.2;
    const slices = Math.max(1, Math.round(length / STEP));
    const step = length / slices;
    const start = (alongX ? m.centre.x : m.centre.z) - length / 2;
    const stands = Array.from({ length: slices }, (_, i) => {
      const t = start + step * (i + 0.5);
      const [a, b] = alongX
        ? [side(t, m.centre.z - off), side(t, m.centre.z + off)]
        : [side(m.centre.x - off, t), side(m.centre.x + off, t)];
      return a === "floor" || b === "floor" || a === "wall" || b === "wall" || (a === "terrace") !== (b === "terrace");
    });
    // A stub with no floor of the flat beside it is no parapet: a terrace's
    // edge runs its length, and 18's 35 cm block at its level mark stood
    // alone on its terrace.
    if (m.kind === "wall" && length < 0.6) {
      // A hand further out: 18's stub stood on the terrace's very edge, its
      // far side a sliver of floor a centimetre past it.
      const far = off + 0.15;
      const floorBeside = Array.from({ length: slices }, (_, i) => {
        const t = start + step * (i + 0.5);
        const [a, b] = alongX
          ? [side(t, m.centre.z - far), side(t, m.centre.z + far)]
          : [side(m.centre.x - far, t), side(m.centre.x + far, t)];
        return a === "floor" || b === "floor" || a === "wall" || b === "wall";
      }).some(Boolean);
      if (!floorBeside) continue;
    }
    if (stands.every(Boolean)) {
      out.push(m);
      continue;
    }
    // The stretches that stand, each its own box.
    for (let i = 0; i < slices; ) {
      if (!stands[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < slices && stands[j]) j++;
      const from = start + step * i;
      const to = start + step * j;
      if (to - from >= 0.15) {
        const mid = (from + to) / 2;
        out.push({
          ...m,
          centre: alongX ? { ...m.centre, x: mid } : { ...m.centre, z: mid },
          size: alongX ? { ...m.size, x: to - from } : { ...m.size, z: to - from },
        });
      }
      i = j;
    }
  }
  return out;
}

/** Glazing sits in the middle of the wall, not across its whole thickness. */
function glazingThickness(
  opening: Band,
  size: { x: number; y: number; z: number },
): { x: number } | { z: number } {
  return opening.orientation === "h" ? { z: Math.min(size.z, GLASS_T_M) } : { x: Math.min(size.x, GLASS_T_M) };
}

const SLEEPING = new Set(["bedroom", "mmd"]);

/** How much of a rectangle lies within a set of rectangles (assumed apart). */
function overlapArea(a: Rect, rects: Rect[]): number {
  let total = 0;
  for (const b of rects) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 0 && h > 0) total += w * h;
  }
  return total;
}
const DRY = new Set(["bedroom", "mmd", "living", "kitchen"]);

/** Whether a measured piece may stand in the room it was measured in. */
export function pieceBelongsIn(pieceKind: string, roomKind: string | undefined): boolean {
  if (pieceKind === "bed") return roomKind != null && SLEEPING.has(roomKind);
  if (pieceKind === "fixture") return roomKind == null || !DRY.has(roomKind);
  return true;
}

/**
 * What an opening is, given the rooms on either side of it.
 *
 * A doorway with a room on one side only leads out of the flat. The
 * measurement cannot always tell — a balcony's floor is part of the floor it
 * locks, and only a terrace whose area the sheet prints as text is known as
 * one — so דירה 14's door and windows onto its balconies came through as
 * doorways between rooms: holes in the wall, each with a mezuzah. With the
 * rooms known, the question answers itself. Measured floor on the far side is
 * a balcony, so the opening is its door; nothing there is a window.
 */
export function sceneOpeningKind(
  opening: { kind: string; orientation: "h" | "v"; centre: number; from: number; to: number; thickness: number },
  at: {
    onTerrace: boolean;
    clearM: number;
    roomKindAt: (x: number, y: number) => string | undefined;
    onFloor: (x: number, y: number) => boolean;
    stepUnits: number;
  },
): SceneOpeningKind {
  if (opening.kind === "window") {
    return at.onTerrace && at.clearM >= SLIDER_MIN_CLEAR_M ? "slider" : "window";
  }
  if (opening.kind !== "opening") return opening.kind as SceneOpeningKind;
  const mid = (opening.from + opening.to) / 2;
  const off = opening.thickness / 2 + at.stepUnits;
  const sides: Array<[number, number]> =
    opening.orientation === "h"
      ? [
          [mid, opening.centre - off],
          [mid, opening.centre + off],
        ]
      : [
          [opening.centre - off, mid],
          [opening.centre + off, mid],
        ];
  const kinds = sides.map(([x, y]) => at.roomKindAt(x, y));
  const inside = kinds.filter((kind) => kind != null);
  if (inside.length !== 1) return "opening";
  const outside = sides[kinds.findIndex((kind) => kind == null)]!;
  if (!at.onFloor(outside[0], outside[1])) return "window";
  // Nobody steps out onto the balcony from the bathroom: what a bathroom has
  // onto one is a window.
  if (inside[0] === "bathroom") return "window";
  return at.clearM >= SLIDER_MIN_CLEAR_M ? "slider" : "door";
}
