import fs from "node:fs";
import path from "node:path";

import {
  FLOORPLAN_VIZ_PRESET_IDS,
  FLOORPLAN_VIZ_PRESETS,
  buildCustomStyleKitFromAnswers,
} from "@/lib/projects/floorplan-viz-styles";
import { buildScene, type SceneInput } from "@/lib/projects/scene3d/build-scene";
import { hashScene } from "@/lib/projects/scene3d/hash";
import { FORBIDDEN_FURNITURE_KINDS, rulesFor } from "@/lib/projects/scene3d/rules";
import { TWIN_MATTRESS_W_M } from "@/lib/projects/scene3d/standards";
import type { FlatScene } from "@/lib/projects/scene3d/types";

/**
 * Every rule, on every reference plan, in every style.
 *
 * This is what replaces asking a vision model whether the still kept the
 * rules — which it answered honestly and which the image model failed on five
 * sheets out of five, with two screens, three double beds and one frame with
 * letters rendered into it.
 *
 * The scenes are the ten reference sheets as the pipeline measures them,
 * captured once into lib/__fixtures__/scene3d. Eighty scenes are built and
 * checked in about a second, with no model, no network and no cost.
 */

const FIXTURE_DIR = path.join(process.cwd(), "lib", "__fixtures__", "scene3d");

const PLANS = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    name: f.replace(/\.json$/, ""),
    input: JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), "utf8")) as SceneInput,
  }));

/** The seven presets, plus a custom kit of each audience. */
const KITS = [
  ...FLOORPLAN_VIZ_PRESET_IDS.map((id) => ({ id: id as string, kit: FLOORPLAN_VIZ_PRESETS[id] })),
  { id: "custom-general", kit: buildCustomStyleKitFromAnswers({ audience: "general", mood: "light" }) },
  { id: "custom-haredi", kit: buildCustomStyleKitFromAnswers({ audience: "haredi", mood: "light" }) },
];

function partsOf(scene: FlatScene, tag: string) {
  return scene.meshes.filter((m) => m.sourceId.endsWith(`/${tag}`));
}

function bedIds(scene: FlatScene): string[] {
  return [...new Set(partsOf(scene, "mattress").map((m) => m.sourceId.split("/")[0]!))];
}

describe("the rules hold on every plan, in every style", () => {
  it("has the reference plans to check", () => {
    expect(PLANS.length).toBeGreaterThanOrEqual(10);
    expect(KITS).toHaveLength(9);
  });

  for (const { id, kit } of KITS) {
    describe(id, () => {
      const rules = rulesFor(kit.audience);

      for (const { name, input } of PLANS) {
        it(`${name}: keeps every rule`, () => {
          const scene = buildScene(input, { rules });

          // 1. No screen, no television, no media unit — anywhere, ever. The
          //    library has no constructor for one, and this states it.
          for (const mesh of scene.meshes) {
            for (const forbidden of FORBIDDEN_FURNITURE_KINDS) {
              expect(mesh.sourceId.toLowerCase()).not.toContain(forbidden);
            }
          }

          // 2. Every prop and every lamp rests on something that was measured.
          const ids = new Set([...scene.meshes.map((m) => m.sourceId), ...scene.openings.map((o) => o.id)]);
          for (const prop of scene.meshes.filter((m) => m.kind === "prop")) {
            expect(prop.anchorId).toBeTruthy();
            expect(ids.has(prop.anchorId!)).toBe(true);
          }
          for (const light of scene.lights) {
            expect(light.anchorId).toBeTruthy();
            expect(ids.has(light.anchorId!)).toBe(true);
          }

          // 3. The entrance and the circulation carry nothing standing on them.
          const circulation = scene.rooms.filter((r) => r.kind === "circulation");
          for (const prop of scene.meshes.filter((m) => m.kind === "prop")) {
            for (const room of circulation) {
              const inside = room.rects.some(
                (r) =>
                  prop.centre.x >= r.x &&
                  prop.centre.x <= r.x + r.w &&
                  prop.centre.z >= r.z &&
                  prop.centre.z <= r.z + r.d,
              );
              // A mezuzah is on a doorpost, which is a wall, not a floor.
              if (prop.sourceId === "prop:mezuzah") continue;
              expect(inside).toBe(false);
            }
          }

          // 4. Nothing outside the extent the camera will be framed on. Props
          //    stand a little proud — a tap, a handle — so the margin is theirs.
          const { x, z, width, depth } = scene.extent;
          for (const mesh of scene.meshes) {
            expect(mesh.centre.x - mesh.size.x / 2).toBeGreaterThanOrEqual(x - 0.25);
            expect(mesh.centre.x + mesh.size.x / 2).toBeLessThanOrEqual(x + width + 0.25);
            expect(mesh.centre.z - mesh.size.z / 2).toBeGreaterThanOrEqual(z - 0.25);
            expect(mesh.centre.z + mesh.size.z / 2).toBeLessThanOrEqual(z + depth + 0.25);
          }

          // 5. The same scene every time it is built.
          expect(hashScene(buildScene(input, { rules }))).toBe(hashScene(scene));

          if (rules.audience === "haredi") {
            // 6. No double bed, however wide the rectangle the sheet draws.
            for (const mattress of partsOf(scene, "mattress")) {
              expect(Math.min(mattress.size.x, mattress.size.z)).toBeLessThanOrEqual(
                TWIN_MATTRESS_W_M + 1e-9,
              );
            }
            // 7. One pillow and one headboard per bed.
            for (const bed of bedIds(scene)) {
              expect(scene.meshes.filter((m) => m.sourceId === `${bed}/pillow`)).toHaveLength(1);
              expect(scene.meshes.filter((m) => m.sourceId === `${bed}/headboard`)).toHaveLength(1);
            }
            // 8. At most one cabinet of sefarim, and a mezuzah on the doors.
            expect(scene.meshes.filter((m) => m.sourceId === "prop:sefarim").length).toBeLessThanOrEqual(1);
            const doors = scene.openings.filter((o) => o.kind === "door" || o.kind === "opening");
            expect(scene.meshes.filter((m) => m.sourceId === "prop:mezuzah")).toHaveLength(doors.length);
          } else {
            // A general still has no mezuzot and no sefarim cabinet.
            expect(scene.meshes.some((m) => m.sourceId === "prop:mezuzah")).toBe(false);
            expect(scene.meshes.some((m) => m.sourceId === "prop:sefarim")).toBe(false);
          }
        });
      }
    });
  }
});
