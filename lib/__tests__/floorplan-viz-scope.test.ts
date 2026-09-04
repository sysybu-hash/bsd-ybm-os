import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
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

  it("merges a later room batch onto the overview still", () => {
    const merged = mergeFloorplanVizImages(
      [{ viewId: "overview", labelHe: "כל התוכנית — מבט על", mimeType: "image/jpeg", base64: "AA" }],
      [{ viewId: "interior", labelHe: "פנים — מטבח", roomName: "מטבח", mimeType: "image/jpeg", base64: "BB" }],
    );
    expect(merged.map((i) => i.viewId)).toEqual(["overview", "interior"]);
    expect(merged[1]?.roomName).toBe("מטבח");
  });
});
