import { parseFloorplanVizOrigin } from "@/lib/projects/floorplan-viz-ids";
import { renderMeasuredStill } from "@/lib/projects/floorplan-render3d-still";
import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import type { FloorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";

const render = jest.fn();
jest.mock("@/lib/projects/building/renderer", () => ({
  renderBuildingFrames: (...args: unknown[]) => render(...args),
}));
jest.mock("@/lib/projects/building/flat-finish", () => ({
  ...jest.requireActual("@/lib/projects/building/flat-finish"),
  frameToContent: (image: Buffer) => Promise.resolve(image),
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
    render.mockResolvedValue([Buffer.from("frame")]);
    const still = await renderMeasuredStill({ ...options(), selected: true });
    expect(still).toMatchObject({ viewId: "overview", origin: "render3d", selected: true, base64: Buffer.from("frame").toString("base64") });
    // The frame before its caption travels with it, for a finish to be checked against.
    expect(still?.plain.toString()).toBe("frame");
    // No roomName, so bookletHeroImage picks it up with no change to the PDF.
    expect(still?.roomName).toBeUndefined();
  });

  it("never sinks a run: a renderer that cannot draw simply adds nothing", async () => {
    render.mockResolvedValue([]);
    expect(await renderMeasuredStill(options())).toBeNull();
    render.mockRejectedValue(new Error("no GL context in this sandbox"));
    expect(await renderMeasuredStill(options())).toBeNull();
  });

  it("draws the flat from above, its walls cut, through the building renderer", async () => {
    render.mockResolvedValue([Buffer.from("f")]);
    await renderMeasuredStill(options());
    const [payloads] = render.mock.calls[0]! as [Array<{ camera: { studio?: boolean }; model: { primitives: Array<{ tag?: string; material: string }> } }>];
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.camera.studio).toBe(true);
    // The bed is built, and the cut walls are drawn solid.
    expect(payloads[0]!.model.primitives.some((p) => (p.tag ?? "").startsWith("furniture:"))).toBe(true);
    expect(payloads[0]!.model.primitives.some((p) => p.material === "poche")).toBe(true);
  });

  it("survives a round trip through the database", () => {
    expect(parseFloorplanVizOrigin("render3d")).toBe("render3d");
    expect(parseFloorplanVizOrigin("finish")).toBe("finish");
    expect(parseFloorplanVizOrigin("nonsense")).toBe("generate");
  });
});
