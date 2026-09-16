import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import { stylePromptForView, type FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";

export type GeometryViewKind = "overview" | "isometric" | "interior";

export type GeometryViewJob = {
  viewId: GeometryViewKind;
  labelHe: string;
  roomName?: string;
  brief: string;
};

/**
 * What the interior still must show, taken from the room the walls already cut.
 *
 * The vision path used to invent furniture for a room it had misread. Here the
 * brief is measurements and contents that were measured, not guessed.
 */
export function interiorBriefFromRoom(room: SegmentedRoom): string {
  const items = room.contents
    .map((piece) => `${piece.kind} ${Math.round(piece.widthCm)}×${Math.round(piece.depthCm)} cm`)
    .join(", ");
  return [
    `Interior of ${room.name} (${room.kind}).`,
    `Measured ${room.areaM2} m², about ${room.bounds.width.toFixed(0)} by ${room.bounds.height.toFixed(0)} units.`,
    items ? `Furniture already placed: ${items}.` : "No furniture blocks in this room.",
    "Do not add a room, a wall, or a piece of furniture that is not listed.",
  ].join(" ");
}

/**
 * How many companion views to generate. Overview is already paid for.
 * Each extra view multiplies cost, so the count is a commercial parameter.
 */
export function listGeometryCompanionViews(
  rooms: SegmentedRoom[],
  options?: { maxViews?: number; includeIsometric?: boolean },
): GeometryViewJob[] {
  const maxViews = options?.maxViews ?? 1;
  const jobs: GeometryViewJob[] = [];
  if (maxViews < 2) return jobs;
  if (options?.includeIsometric !== false) {
    jobs.push({
      viewId: "isometric",
      labelHe: "כל התוכנית — איזומטריה",
      brief: "Isometric of this exact apartment. Same rooms, same openings, same furniture footprints.",
    });
  }
  const interiors = rooms
    .filter((room) => room.kind !== "balcony" && room.kind !== "other")
    .slice(0, Math.max(0, maxViews - 1 - jobs.length));
  for (const room of interiors) {
    if (jobs.length >= maxViews - 1) break;
    jobs.push({
      viewId: "interior",
      labelHe: `פנים — ${room.name}`,
      roomName: room.name,
      brief: interiorBriefFromRoom(room),
    });
  }
  return jobs;
}

export function geometryViewPrompt(
  kit: FloorplanVizStyleKit,
  job: GeometryViewJob,
): string {
  const style = stylePromptForView(
    kit,
    { kind: job.viewId === "interior" ? "interior" : job.viewId, roomKind: undefined },
    { source: "geometry" },
  );
  return `${style}\n\n${job.brief}`;
}

export function companionImage(
  job: GeometryViewJob,
  still: { mimeType: string; base64: string },
): FloorplanVizImage {
  return {
    viewId: job.viewId,
    labelHe: job.labelHe,
    roomName: job.roomName,
    mimeType: still.mimeType,
    base64: still.base64,
  };
}
