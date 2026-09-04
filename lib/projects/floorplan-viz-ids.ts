import type { FloorplanLayout, FloorplanVizViewId } from "@/lib/projects/floorplan-layout";

export function floorplanVizViewKey(viewId: string, roomName?: string | null): string {
  return `${viewId}:${roomName ?? ""}`;
}

export function floorplanVizStillFilePath(runId: string, stillId: string): string {
  return `/api/projects/visualize-floorplan/${encodeURIComponent(runId)}/stills/${encodeURIComponent(stillId)}/file`;
}

export function titleFromFloorplanLayout(layout: FloorplanLayout, fallback = "הדמיית תוכנית"): string {
  const label = (layout.unitLabel || layout.title || "").trim();
  return label || fallback;
}

export function parseFloorplanVizViewId(raw: string): FloorplanVizViewId {
  if (raw === "overview" || raw === "isometric" || raw === "interior") return raw;
  return "interior";
}

export type FloorplanVizRunSummary = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  styleLabelHe: string | null;
  scope: string;
  stillCount: number;
  thumbStillId: string | null;
  createdAt: string;
  updatedAt: string;
};
