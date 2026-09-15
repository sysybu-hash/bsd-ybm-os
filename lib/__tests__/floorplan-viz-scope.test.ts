import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  existingImagesForAppend,
  listFloorplanVizJobs,
  mergeFloorplanVizImages,
  parseFloorplanVizScope,
} from "@/lib/projects/floorplan-viz-scope";

const layout = parseFloorplanLayout({
  rooms: [
    { name: "סלון", kind: "living", source: "ocr_verified" },
    { name: "מטבח", kind: "kitchen", source: "ocr_verified" },
    { name: "חדר שינה", kind: "bedroom", source: "ocr_verified" },
  ],
});

describe("floorplan viz scope", () => {
  it("defaults unknown scope to a full booklet", () => {
    expect(parseFloorplanVizScope("")).toBe("full");
    expect(parseFloorplanVizScope("overview")).toBe("overview");
    expect(parseFloorplanVizScope("rooms")).toBe("rooms");
  });

  it("overview scope is a single whole-plan still", () => {
    const jobs = listFloorplanVizJobs(layout, "overview");
    expect(jobs).toEqual([{ viewId: "overview", labelHe: "כל התוכנית — מבט על" }]);
  });

  it("full booklet includes overview, isometric and interiors", () => {
    const jobs = listFloorplanVizJobs(layout, "full");
    expect(jobs.map((j) => j.viewId)).toEqual(["overview", "isometric", "interior", "interior", "interior"]);
    expect(jobs.filter((j) => j.viewId === "interior").map((j) => j.roomName)).toEqual(
      expect.arrayContaining(["סלון", "מטבח", "חדר שינה"]),
    );
  });

  it("rooms scope skips the overview already generated and does not add a competing isometric", () => {
    const jobs = listFloorplanVizJobs(layout, "rooms", [{ viewId: "overview" }]);
    expect(jobs.map((j) => j.viewId)).not.toContain("overview");
    expect(jobs.some((j) => j.viewId === "isometric")).toBe(false);
    expect(jobs.filter((j) => j.viewId === "interior")).toHaveLength(3);
  });

  it("does not repeat interiors that already exist", () => {
    const jobs = listFloorplanVizJobs(layout, "rooms", [
      { viewId: "overview" },
      { viewId: "isometric" },
      { viewId: "interior", roomName: "מטבח" },
    ]);
    expect(jobs.map((j) => j.roomName).filter(Boolean)).not.toContain("מטבח");
    expect(jobs.filter((j) => j.viewId === "interior")).toHaveLength(2);
  });

  it("skips interiors when the booklet only wants living stills", () => {
    const jobs = listFloorplanVizJobs(layout, "full", [], { skipInteriors: true });
    expect(jobs.map((j) => j.viewId)).toEqual(["overview", "isometric"]);
  });

  it("does not invent a second overview when CAD already occupies the living slot", () => {
    const jobs = listFloorplanVizJobs(
      layout,
      "full",
      [
        { viewId: "overview" },
        { viewId: "overview", roomName: "גיאומטריה" },
      ],
      { skipInteriors: true },
    );
    expect(jobs.map((j) => j.viewId)).toEqual(["isometric"]);
  });

  it("keeps a locked overview on retry so Gemini cannot invent a second flat", () => {
    const kept = existingImagesForAppend(
      [
        { viewId: "overview" },
        { viewId: "overview", roomName: "גיאומטריה" },
        { viewId: "isometric" },
        { viewId: "interior", roomName: "מטבח" },
      ],
      "full",
    );
    expect(kept.map((row) => row.viewId).sort()).toEqual(["interior", "overview", "overview"]);
    expect(kept.some((row) => row.viewId === "isometric")).toBe(false);
  });

  it("merges a later room batch onto the overview still", () => {
    const merged = mergeFloorplanVizImages(
      [{ viewId: "overview", labelHe: "כל התוכנית — מבט על", mimeType: "image/jpeg", base64: "AA" }],
      [{ viewId: "interior", labelHe: "פנים — מטבח", roomName: "מטבח", mimeType: "image/jpeg", base64: "BB" }],
    );
    expect(merged.map((i) => i.viewId)).toEqual(["overview", "interior"]);
    expect(merged[1]?.roomName).toBe("מטבח");
  });
});
