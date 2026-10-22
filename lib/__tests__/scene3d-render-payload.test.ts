import { FLOORPLAN_VIZ_PRESETS } from "@/lib/projects/floorplan-viz-styles";
import { buildScene, sceneInputFromFlat } from "@/lib/projects/scene3d/build-scene";
import { QUALITY } from "@/lib/projects/scene3d/quality";
import { buildRenderPayload, frameFor } from "@/lib/projects/scene3d/render-payload";
import { renderPageHtml } from "@/lib/projects/scene3d/render-page";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";
import { CUTAWAY_OVERVIEW_M } from "@/lib/projects/scene3d/standards";
import { FIXTURE_ROOMS, fixtureFlat } from "@/lib/__fixtures__/scene3d-flat";
import type { FlatScene } from "@/lib/projects/scene3d/types";

/**
 * Everything the browser needs, decided here.
 *
 * The page that draws it makes a box per entry and nothing else, so what this
 * builds is the whole of the render — and it is checked without a browser.
 */

const style = sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_classic);
const scene = buildScene(sceneInputFromFlat(fixtureFlat(), FIXTURE_ROOMS), { rules: style.rules });

const wide = (depth: number): FlatScene => ({
  ...scene,
  extent: { ...scene.extent, width: 10, depth },
});

describe("the frame a flat asks for", () => {
  it("is shaped like the flat", () => {
    // A long apartment gets a tall frame; a wide one gets a wide frame. The
    // first renders put every flat in a landscape frame and left half the
    // picture empty.
    expect(frameFor(wide(20), 2000).height).toBeGreaterThan(2000);
    expect(frameFor(wide(6), 2000).height).toBeLessThan(2000);
  });

  it("never becomes a letterbox", () => {
    expect(frameFor(wide(100), 2000).height).toBeLessThanOrEqual(2000 * 1.6);
    expect(frameFor(wide(1), 2000).height).toBeGreaterThanOrEqual(2000 * 0.62);
  });

  it("has an even number of pixels, which every encoder prefers", () => {
    for (const depth of [4, 7, 11, 13.5, 19]) {
      expect(frameFor(wide(depth), 2000).height % 2).toBe(0);
    }
  });
});

describe("the payload", () => {
  const payload = buildRenderPayload(scene, style, { id: "overview" }, QUALITY.booklet);

  it("draws the flat cut at the overview's own height", () => {
    for (const mesh of payload.meshes) {
      expect(mesh.c[1] + mesh.s[1] / 2).toBeLessThanOrEqual(CUTAWAY_OVERVIEW_M + 1e-9);
    }
  });

  it("does not ask a floor or a pane of glass to cast a shadow", () => {
    const floors = scene.meshes.filter((m) => m.kind === "floor").length;
    expect(floors).toBeGreaterThan(0);
    expect(payload.meshes.filter((m) => !m.sh).length).toBeGreaterThanOrEqual(floors);
  });

  it("carries the style's finishes and the staged lamps", () => {
    expect(payload.materials.floorWood?.color).toBe(style.materials.floorWood.color);
    expect(payload.exposure).toBe(style.lighting.exposure);
    expect(payload.lights).toHaveLength(scene.lights.length);
    for (const light of payload.lights) expect(light.intensity).toBeGreaterThan(0);
  });

  it("points the sun where the style puts it, and nowhere else", () => {
    const [x, y, z] = payload.sun.direction;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    expect(y).toBeGreaterThan(0);
  });

  it("is the same payload every time", () => {
    expect(buildRenderPayload(scene, style, { id: "overview" }, QUALITY.booklet)).toEqual(payload);
  });

  it("draws at twice the delivered width, for the downsample to eat", () => {
    expect(payload.width).toBe(QUALITY.booklet.renderWidthPx);
  });
});

describe("the page", () => {
  const html = renderPageHtml(buildRenderPayload(scene, style, { id: "overview" }, QUALITY.booklet));

  it("fetches nothing from anywhere but the browser's own origin", () => {
    expect(html).not.toMatch(/https?:\/\/(?!render3d\.local)/);
  });

  it("replaces Math.random before anything can reach for it", () => {
    expect(html.indexOf("Math.random =")).toBeLessThan(html.indexOf("import * as THREE"));
  });

  it("says when it is done, and when it has failed", () => {
    expect(html).toContain("window.__renderDone = true");
    expect(html).toContain("__renderError");
  });
});

describe("where an interior is photographed from", () => {
  const box = (kind: string, x: number, z: number, w: number, d: number, h = 1) => ({
    kind,
    material: "wall",
    centre: { x, y: h / 2, z },
    size: { x: w, y: h, z: d },
    sourceId: kind,
  });
  // A 4 by 3 m room, a door in its south wall at x = 2, a bed in its far corner.
  const room = { id: "r", name: "r", kind: "bedroom", areaM2: 12, rects: [{ x: 0, z: 0, w: 4, d: 3 }], bounds: { x: 0, z: 0, w: 4, d: 3 } };
  const scene = {
    version: 1,
    unitsPerMetre: 100,
    extent: { x: 0, z: 0, width: 4, depth: 3 },
    meshes: [box("wall", 2, -0.05, 4, 0.1, 2.6), box("furniture", 0.5, 1, 0.9, 2, 0.5)],
    rooms: [room],
    openings: [{ id: "d", kind: "door", centre: { x: 2, y: 1, z: -0.05 }, size: { x: 0.9, y: 2, z: 0.1 }, sillM: 0, headM: 2.1, exterior: false }],
    lights: [],
  };

  it("stands a step inside the doorway", async () => {
    const { interiorStand } = await import("@/lib/projects/scene3d/cameras");
    const at = interiorStand(scene as never, room);
    expect(at.x).toBeCloseTo(2, 5);
    expect(at.z).toBeGreaterThan(0.2);
    expect(at.z).toBeLessThan(1);
  });

  it("never stands in a piece of furniture", async () => {
    const { interiorStand } = await import("@/lib/projects/scene3d/cameras");
    const noDoor = { ...scene, openings: [] };
    const at = interiorStand(noDoor as never, room);
    const inBed = Math.abs(at.x - 0.5) < 0.45 + 0.35 && Math.abs(at.z - 1) < 1 + 0.35;
    expect(inBed).toBe(false);
  });
});
