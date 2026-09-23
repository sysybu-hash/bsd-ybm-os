import { cameraFor, type CameraRig, type ViewSpec } from "@/lib/projects/scene3d/cameras";
import type { QualityProfile } from "@/lib/projects/scene3d/quality";
import { sunDirection, type MaterialSpec, type SceneStyle } from "@/lib/projects/scene3d/style";
import { kelvinColour, meshesForView } from "@/lib/projects/scene3d/three-scene";
import type { FlatScene, MaterialId } from "@/lib/projects/scene3d/types";

/**
 * Everything a browser needs to draw one frame, as data.
 *
 * The page that renders this is deliberately stupid: it makes a box per entry,
 * a material per spec, a light per light, and one camera. Every decision —
 * which boxes exist, what they are made of, where the camera stands, how the
 * sun is angled — is taken here, in TypeScript, under test, on the server.
 * Nothing is computed in the page, so nothing can be computed differently
 * there than it is in the viewer.
 */

export type RenderMesh = {
  /** Centre and size, metres. */
  c: [number, number, number];
  s: [number, number, number];
  m: MaterialId;
  /** Whether this box casts a shadow — a floor slab does not. */
  sh: boolean;
};

export type RenderLight = {
  p: [number, number, number];
  colour: number;
  intensity: number;
  distance: number;
};

export type RenderPayload = {
  width: number;
  height: number;
  meshes: RenderMesh[];
  materials: Record<string, MaterialSpec>;
  lights: RenderLight[];
  sun: {
    direction: [number, number, number];
    colour: number;
    intensity: number;
    distance: number;
    shadows: boolean;
    mapSize: number;
    span: number;
  };
  sky: { colour: number; ground: number; intensity: number };
  exposure: number;
  camera: CameraRig;
  background: number;
};

/** A floor is lit, not a caster; glass would only cast a grey rectangle. */
const NEVER_CASTS = new Set(["floor", "terrace", "glazing"]);

/**
 * The frame a flat wants.
 *
 * A long narrow apartment photographed into a landscape frame leaves half the
 * picture empty, which is what the first renders did. The still is shaped like
 * the flat, clamped so it stays a sales image and not a letterbox.
 */
export function frameFor(scene: FlatScene, widthPx: number): { width: number; height: number } {
  const ratio = scene.extent.depth / Math.max(scene.extent.width, 0.001);
  const clamped = Math.min(1.6, Math.max(0.62, ratio * 0.82));
  return { width: widthPx, height: Math.round((widthPx * clamped) / 2) * 2 };
}

export function buildRenderPayload(
  scene: FlatScene,
  style: SceneStyle,
  view: ViewSpec,
  quality: QualityProfile,
): RenderPayload {
  const { width, height } = frameFor(scene, quality.renderWidthPx);
  const aspect = width / height;
  const camera = cameraFor(scene, view, aspect);
  const span = Math.max(scene.extent.width, scene.extent.depth);
  const dir = sunDirection(style.lighting);

  return {
    width,
    height,
    meshes: meshesForView(scene, camera.cutawayM).map((mesh) => ({
      c: [mesh.centre.x, mesh.centre.y, mesh.centre.z],
      s: [mesh.size.x, mesh.size.y, mesh.size.z],
      m: mesh.material,
      sh: quality.shadows && !NEVER_CASTS.has(mesh.kind),
    })),
    materials: style.materials,
    lights: scene.lights.map((light) => ({
      p: [light.position.x, light.position.y, light.position.z],
      colour: kelvinColour(light.kelvin),
      intensity: light.intensity * 4,
      distance: span * 0.9,
    })),
    sun: {
      direction: [dir.x, dir.y, dir.z],
      colour: kelvinColour(style.lighting.kelvin),
      intensity: style.lighting.sunIntensity,
      distance: span * 1.6,
      shadows: quality.shadows,
      mapSize: quality.shadowMapSize,
      span,
    },
    sky: {
      colour: style.lighting.skyColor,
      ground: style.lighting.groundColor,
      intensity: style.lighting.skyIntensity,
    },
    exposure: style.lighting.exposure,
    camera,
    // The backdrop of a sales still is paper, not sky: the sheet it sits
    // beside in the booklet is white, and a blue horizon behind a cutaway
    // reads as a photograph of a model rather than of a flat.
    background: 0xf4efe6,
  };
}
