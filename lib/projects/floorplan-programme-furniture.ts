import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import {
  isStudyRoom,
  type FloorplanLayout,
  type FloorplanRoom,
} from "@/lib/projects/floorplan-layout";

/**
 * What the sheet says a piece of furniture is, where its shape cannot say.
 *
 * A desk is a rectangle about 120 by 60, and so is a sideboard, a counter run
 * and a low cupboard: the geometry alone cannot tell them apart, and the
 * classifier calls them all storage. That is how 28-8-23-2 lost its work room
 * — two desks came through as cupboards, the plate showed a waist-high block,
 * and the image model furnished the room as another bedroom.
 *
 * The draughtsman already answered the question by labelling the room עבודה.
 * A desk-sized rectangle standing inside a room the sheet calls a study is a
 * desk, and nothing outside such a room is touched.
 */

const DESK_MIN_W_CM = 80;
const DESK_MAX_W_CM = 200;
const DESK_MIN_D_CM = 40;
const DESK_MAX_D_CM = 95;

function isDeskShaped(piece: FurniturePiece): boolean {
  const long = Math.max(piece.widthCm, piece.depthCm);
  const short = Math.min(piece.widthCm, piece.depthCm);
  return (
    long >= DESK_MIN_W_CM && long <= DESK_MAX_W_CM && short >= DESK_MIN_D_CM && short <= DESK_MAX_D_CM
  );
}

function studyRooms(layout: FloorplanLayout): FloorplanRoom[] {
  return layout.rooms.filter((room) => room.bbox != null && isStudyRoom(room));
}

export function deskFurnitureInOffices(
  furniture: FurniturePiece[],
  layout: FloorplanLayout | undefined,
  page: { width: number; height: number } | undefined,
): FurniturePiece[] {
  if (!layout || !page || !(page.width > 0) || !(page.height > 0)) return furniture;
  const studies = studyRooms(layout);
  if (studies.length === 0) return furniture;

  return furniture.map((piece) => {
    if (piece.kind === "bed" || piece.kind === "desk") return piece;
    if (!isDeskShaped(piece)) return piece;
    const cx = (piece.x + piece.w / 2) / page.width;
    const cy = (piece.y + piece.h / 2) / page.height;
    const inStudy = studies.some((room) => {
      const b = room.bbox!;
      return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
    });
    return inStudy ? { ...piece, kind: "desk" as const } : piece;
  });
}

/**
 * Nothing stands in a room the sheet draws empty.
 *
 * The shelter room on this plan is an empty box with thick walls, and the
 * plate kept putting a bed in it — a rectangle inside the hatch reads as one,
 * and once it is on the plate the image model photographs it, whatever the
 * prompt says about ממ"ד staying empty. The sheet already says the room is
 * empty; that is enough to clear it.
 */
export function clearFurnitureFromEmptyRooms(
  furniture: FurniturePiece[],
  layout: FloorplanLayout | undefined,
  page: { width: number; height: number } | undefined,
): FurniturePiece[] {
  if (!layout || !page || !(page.width > 0) || !(page.height > 0)) return furniture;
  const empties = layout.rooms.filter(
    (room) =>
      room.bbox != null &&
      (room.bedCount ?? 0) === 0 &&
      typeof room.contents === "string" &&
      room.contents.trim().toLowerCase() === "empty",
  );
  if (empties.length === 0) return furniture;

  return furniture.filter((piece) => {
    const cx = (piece.x + piece.w / 2) / page.width;
    const cy = (piece.y + piece.h / 2) / page.height;
    return !empties.some((room) => {
      const b = room.bbox!;
      return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
    });
  });
}
