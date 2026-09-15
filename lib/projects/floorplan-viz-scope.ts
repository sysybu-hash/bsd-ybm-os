import {
  layoutForVisualization,
  roomsForInteriorViz,
  type FloorplanLayout,
  type FloorplanVizImage,
  type FloorplanVizViewId,
} from "@/lib/projects/floorplan-layout";

export type FloorplanVizScope = "full" | "overview" | "rooms";

export function parseFloorplanVizScope(raw: string): FloorplanVizScope {
  if (raw === "overview" || raw === "rooms") return raw;
  return "full";
}

export type FloorplanVizJobSpec = {
  viewId: FloorplanVizViewId;
  labelHe: string;
  roomName?: string;
};

export function floorplanVizJobKey(job: { viewId: string; roomName?: string }): string {
  return `${job.viewId}:${job.roomName ?? ""}`;
}

/**
 * What a retry may keep. Overview stays so Gemini cannot bill a second invented
 * flat; interiors stay so rooms-scope can fill the gaps.
 */
export function existingImagesForAppend(
  images: Array<{ viewId: string; roomName?: string }>,
  scope: FloorplanVizScope,
): Array<{ viewId: string; roomName?: string }> {
  if (scope === "rooms") return images;
  return images.filter((img) => img.viewId === "overview" || img.viewId === "interior");
}

const MAX_INTERIOR_ROOMS = 12;

/** אילו מבטים לייצר לפי היקף, בלי לחזור על תמונות שכבר יש */
export function listFloorplanVizJobs(
  layout: FloorplanLayout,
  scope: FloorplanVizScope = "full",
  existing: Array<{ viewId: string; roomName?: string }> = [],
  options?: { skipInteriors?: boolean },
): FloorplanVizJobSpec[] {
  const have = new Set(existing.map(floorplanVizJobKey));
  const interiors = roomsForInteriorViz(layoutForVisualization(layout)).slice(0, MAX_INTERIOR_ROOMS);
  const all: FloorplanVizJobSpec[] = [];
  if (scope === "full" || scope === "overview") {
    all.push({ viewId: "overview", labelHe: "כל התוכנית — מבט על" });
  }
  if (scope === "full") {
    all.push({ viewId: "isometric", labelHe: "כל התוכנית — איזומטריה" });
  }
  if (!options?.skipInteriors && (scope === "full" || scope === "rooms")) {
    for (const room of interiors) {
      all.push({ viewId: "interior", labelHe: `פנים — ${room.name}`, roomName: room.name });
    }
  }
  return all.filter((job) => !have.has(floorplanVizJobKey(job)));
}

export function mergeFloorplanVizImages(
  existing: FloorplanVizImage[],
  incoming: FloorplanVizImage[],
): FloorplanVizImage[] {
  const map = new Map<string, FloorplanVizImage>();
  for (const img of existing) map.set(floorplanVizJobKey(img), img);
  for (const img of incoming) map.set(floorplanVizJobKey(img), img);
  const order: Record<string, number> = { overview: 0, isometric: 1, interior: 2 };
  return [...map.values()].sort((a, b) => {
    const d = (order[a.viewId] ?? 9) - (order[b.viewId] ?? 9);
    if (d !== 0) return d;
    return (a.roomName ?? "").localeCompare(b.roomName ?? "", "he");
  });
}
