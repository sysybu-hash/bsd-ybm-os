import { parseFloorplanVizOrigin } from "@/lib/projects/floorplan-viz-ids";
import { renderMeasuredStill } from "@/lib/projects/floorplan-render3d-still";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";

const render = jest.fn();
jest.mock("@/lib/projects/scene3d/renderer", () => ({
  chromiumSceneRenderer: (...args: unknown[]) => render(...args),
}));
jest.mock("@/lib/projects/floorplan-viz-stamp", () => ({
  stampFloorplanStill: (image: { base64: string; mimeType: string }) => Promise.resolve(image),
}));

const geometry = (): FloorplanGeometryPayload => ({
  unitsPerMetre: 100,
  bounds: { x: 0, y: 0, width: 600, height: 400 },
  walls: [
    { orientation: "h", centre: 5, thickness: 10, from: 0, to: 600 },
    { orientation: "v", centre: 300, thickness: 8, from: 0, to: 400 },
  ],
  openings: [{ orientation: "v", centre: 300, thickness: 8, from: 150, to: 240, kind: "door" }],
  furniture: [{ x: 40, y: 40, w: 90, h: 200, kind: "bed", widthCm: 90, depthCm: 200 }],
  rooms: [
    { name: "ח.שינה", kind: "bedroom", areaM2: 11.4, bounds: { x: 10, y: 10, width: 286, height: 380 } },
  ],
});

const options = () => ({ geometry: geometry(), styleKit: FLOORPLAN_VIZ_PRESETS.haredi_classic });

beforeEach(() => jest.clearAllMocks());

describe("the measured still", () => {
  it("comes back as an overview attempt the booklet already knows how to place", async () => {
    render.mockResolvedValue({ mimeType: "image/jpeg", base64: "frame", widthPx: 2000, heightPx: 1500, quality: "booklet", ms: 1200 });
    const still = await renderMeasuredStill({ ...options(), selected: true });
    expect(still).toMatchObject({ viewId: "overview", origin: "render3d", selected: true, base64: "frame" });
    // No roomName, so bookletHeroImage picks it up with no change to the PDF.
    expect(still?.roomName).toBeUndefined();
  });

  it("never sinks a run: a renderer that cannot draw simply adds nothing", async () => {
    render.mockResolvedValue(null);
    expect(await renderMeasuredStill(options())).toBeNull();
    render.mockRejectedValue(new Error("no GL context in this sandbox"));
    expect(await renderMeasuredStill(options())).toBeNull();
  });

  it("draws the style the run asked for, and the rules that come with it", async () => {
    render.mockResolvedValue({ mimeType: "image/jpeg", base64: "f", widthPx: 10, heightPx: 10, quality: "booklet", ms: 1 });
    await renderMeasuredStill(options());
    const req = render.mock.calls[0]![0] as { style: { id: string; rules: { singleBeds: boolean } } };
    expect(req.style.id).toBe("haredi_classic");
    expect(req.style.rules.singleBeds).toBe(true);
  });

  it("survives a round trip through the database", () => {
    expect(parseFloorplanVizOrigin("render3d")).toBe("render3d");
    expect(parseFloorplanVizOrigin("nonsense")).toBe("generate");
  });
});
