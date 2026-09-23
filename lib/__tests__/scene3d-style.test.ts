import {
  FLOORPLAN_VIZ_PRESETS,
  FLOORPLAN_VIZ_PRESET_IDS,
  buildCustomStyleKitFromAnswers,
} from "@/lib/projects/floorplan-viz-styles";
import { cameraFor, overviewDistance, PLAN_UP } from "@/lib/projects/scene3d/cameras";
import { QUALITY, degrade } from "@/lib/projects/scene3d/quality";
import { lightnessOf, parseHexColour, sceneStyleFor, sunDirection } from "@/lib/projects/scene3d/style";
import { buildScene } from "@/lib/projects/scene3d/build-scene";
import { kelvinColour } from "@/lib/projects/scene3d/three-scene";
import { fixtureFlat, FIXTURE_ROOMS } from "@/lib/__fixtures__/scene3d-flat";
import { sceneInputFromFlat } from "@/lib/projects/scene3d/build-scene";

/**
 * A style has to be a different apartment finish, not the same one in another
 * tint — and a camera has to be solved from the flat rather than tuned by
 * hand, or two sheets in one booklet will not look like a series.
 */

describe("the seven styles, and a custom one", () => {
  it("gives every preset its own floor, joinery and light", () => {
    const styles = FLOORPLAN_VIZ_PRESET_IDS.map((id) => sceneStyleFor(FLOORPLAN_VIZ_PRESETS[id]));
    const floors = new Set(styles.map((s) => s.materials.floorWood.color));
    const joinery = new Set(styles.map((s) => s.materials.timber.color));
    const kelvins = new Set(styles.map((s) => s.lighting.kelvin));
    expect(floors.size).toBeGreaterThanOrEqual(6);
    expect(joinery.size).toBeGreaterThanOrEqual(4);
    expect(kelvins.size).toBeGreaterThanOrEqual(4);
  });

  it("carries the audience's rules into every kit, custom included", () => {
    expect(sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_classic).rules.singleBeds).toBe(true);
    expect(sceneStyleFor(FLOORPLAN_VIZ_PRESETS.contemporary).rules.singleBeds).toBe(false);
    // There is no path that skips the rules: a custom haredi kit gets exactly
    // what the presets get.
    const custom = buildCustomStyleKitFromAnswers({ audience: "haredi", mood: "dark" });
    const style = sceneStyleFor(custom);
    expect(style.rules).toEqual(sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_modern).rules);
  });

  it("reads a custom palette the way a room is built", () => {
    const kit = {
      ...buildCustomStyleKitFromAnswers({ audience: "general" }),
      colors: ["#1b1b1b", "#f7f3ec", "#8a7a63"],
    };
    const style = sceneStyleFor(kit);
    // Lightest on the walls, darkest on the textiles.
    expect(style.materials.wall.color).toBe(0xf7f3ec);
    expect(style.materials.upholstery.color).toBe(0x1b1b1b);
    // And the floor is never an arbitrary accent colour.
    expect(style.materials.floorWood.color).toBe(sceneStyleFor(kit).materials.floorWood.color);
  });

  it("reads colours, and ignores what is not one", () => {
    expect(parseHexColour("#abc")).toBe(0xaabbcc);
    expect(parseHexColour("A1B2C3")).toBe(0xa1b2c3);
    expect(parseHexColour("rebeccapurple")).toBeNull();
    expect(lightnessOf(0xffffff)).toBeCloseTo(1, 6);
    expect(lightnessOf(0x000000)).toBe(0);
  });

  it("puts the sun in the same place on every sheet", () => {
    const a = sunDirection(sceneStyleFor(FLOORPLAN_VIZ_PRESETS.contemporary).lighting);
    const b = sunDirection(sceneStyleFor(FLOORPLAN_VIZ_PRESETS.haredi_classic).lighting);
    expect(a.y).toBeGreaterThan(0);
    // Same bearing, so a booklet reads as one set; elevation may differ.
    expect(Math.atan2(a.x, a.z)).toBeCloseTo(Math.atan2(b.x, b.z), 6);
  });

  it("warms the lamps without making them orange", () => {
    expect(kelvinColour(2800)).toBeGreaterThan(0xffb478);
    expect(kelvinColour(3500)).toBeGreaterThan(kelvinColour(2800));
  });
});

describe("where the camera stands", () => {
  const scene = buildScene(sceneInputFromFlat(fixtureFlat(), FIXTURE_ROOMS));

  it("keeps the plan the way the sheet prints it", () => {
    const rig = cameraFor(scene, { id: "overview" }, 4 / 3);
    // Up is -Z, so north on the page is up in the frame. A still from this
    // engine cannot come back mirrored or turned.
    expect(rig.up).toEqual(PLAN_UP);
    expect(rig.position.y).toBeGreaterThan(0);
    expect(rig.cutawayM).toBeGreaterThan(0);
  });

  it("stands further back for a bigger flat, and for a narrower frame", () => {
    const small = overviewDistance(8, 6, 4 / 3);
    const large = overviewDistance(16, 12, 4 / 3);
    expect(large).toBeGreaterThan(small * 1.8);
    expect(overviewDistance(16, 12, 0.6)).toBeGreaterThan(large);
  });

  it("photographs the isometric orthographically, at the architect's angle", () => {
    const rig = cameraFor(scene, { id: "isometric" }, 4 / 3);
    expect(rig.kind).toBe("orthographic");
    // 45 degrees around: equal offsets in x and z from the centre.
    const dx = rig.position.x - rig.target.x;
    const dz = rig.position.z - rig.target.z;
    expect(Math.abs(dx)).toBeCloseTo(Math.abs(dz), 6);
  });

  it("stands inside the room it is photographing", () => {
    const room = scene.rooms[0]!;
    const rig = cameraFor(scene, { id: "interior", roomId: room.id }, 4 / 3);
    expect(rig.position.y).toBeCloseTo(1.55, 6);
    expect(rig.position.x).toBeGreaterThanOrEqual(room.bounds.x);
    expect(rig.position.x).toBeLessThanOrEqual(room.bounds.x + room.bounds.w);
  });

  it("is the same rig every time", () => {
    expect(cameraFor(scene, { id: "overview" }, 1.5)).toEqual(cameraFor(scene, { id: "overview" }, 1.5));
  });
});

describe("how hard the renderer works", () => {
  it("draws the booklet still at twice its delivered width", () => {
    expect(QUALITY.booklet.renderWidthPx).toBe(2 * QUALITY.booklet.outputWidthPx);
  });

  it("gives up resolution before it gives up shadows, and shadows before it fails", () => {
    const first = degrade(QUALITY.booklet)!;
    expect(first.renderWidthPx).toBe(QUALITY.booklet.outputWidthPx);
    expect(first.shadows).toBe(true);
    const second = degrade(first)!;
    expect(second.shadows).toBe(false);
    expect(degrade(second)).toBeNull();
  });
});
