import type * as ThreeNS from "three";

import type { CameraRig } from "@/lib/projects/scene3d/cameras";
import { sunDirection, type MaterialSpec, type SceneStyle } from "@/lib/projects/scene3d/style";
import type { QualityProfile } from "@/lib/projects/scene3d/quality";
import type { FlatScene, MaterialId, SceneBox, SceneMeshKind } from "@/lib/projects/scene3d/types";

/**
 * The scene, in three.js.
 *
 * Isomorphic on purpose: it takes the THREE namespace as an argument and never
 * touches the DOM, so the viewer in the app, a headless Chromium and anything
 * later all build the identical scene graph. The only thing a renderer adds is
 * how it photographs it.
 *
 * Boxes of the same material are merged into one geometry. That is not an
 * optimisation for later: a flat is a few thousand boxes, and a thousand draw
 * calls is the difference between a frame that takes ten seconds on a software
 * rasteriser and one that takes a minute.
 */

type THREE = typeof ThreeNS;

/**
 * Placeholder finishes, P1.
 *
 * Real materials arrive with the style kits, where each of the seven presets
 * maps to its own table. These are the colours the oblique plate already uses,
 * so the two renderers describe the same flat until then.
 */
export const DEFAULT_MATERIALS: Record<MaterialId, MaterialSpec> = {
  wall: { color: 0xf1e9dd, roughness: 0.95, metalness: 0 },
  wallCut: { color: 0xbdb3a4, roughness: 0.95, metalness: 0 },
  floorWood: { color: 0xc4a574, roughness: 0.7, metalness: 0 },
  floorTile: { color: 0xd8d2c6, roughness: 0.45, metalness: 0 },
  floorStone: { color: 0xded5c4, roughness: 0.8, metalness: 0 },
  skirting: { color: 0xf6f1e8, roughness: 0.6, metalness: 0 },
  glass: { color: 0xbcd8e4, roughness: 0.08, metalness: 0, opacity: 0.35 },
  joinery: { color: 0xeae6df, roughness: 0.5, metalness: 0 },
  metal: { color: 0x9a958c, roughness: 0.35, metalness: 0.8 },
  linen: { color: 0xf3efe6, roughness: 0.85, metalness: 0 },
  upholstery: { color: 0xd8cdba, roughness: 0.9, metalness: 0 },
  timber: { color: 0xa9764a, roughness: 0.6, metalness: 0 },
  worktop: { color: 0xeae6df, roughness: 0.4, metalness: 0 },
  ceramic: { color: 0xf7fbfc, roughness: 0.15, metalness: 0 },
  steel: { color: 0x8e959c, roughness: 0.3, metalness: 0.75 },
  neutral: { color: 0xcbb79c, roughness: 0.8, metalness: 0 },
};

/** Boxes that do not cast shadow: a floor slab, a pane of glass. */
const NO_SHADOW = new Set(["floor", "terrace", "glazing"]);

export type ThreeSceneOptions = {
  /** The style's own finishes. Without one, the neutral table below is used. */
  materials?: Partial<Record<MaterialId, MaterialSpec>>;
  shadows?: boolean;
  /** Metres above the floor to cut the walls at. Omit for full height. */
  cutawayM?: number;
  /** Build only these kinds — how the viewer's layer toggles are served. */
  include?: (kind: SceneMeshKind) => boolean;
};

/** A wall clipped to the cutaway height, or null when it is entirely above it. */
export function cutBox(mesh: SceneBox, cutawayM: number): SceneBox | null {
  const bottom = mesh.centre.y - mesh.size.y / 2;
  const top = mesh.centre.y + mesh.size.y / 2;
  if (top <= cutawayM) return mesh;
  if (bottom >= cutawayM) return null;
  const height = cutawayM - bottom;
  return { ...mesh, centre: { ...mesh.centre, y: bottom + height / 2 }, size: { ...mesh.size, y: height } };
}

/** What a view actually draws: the scene, cut at the height the view asks for. */
export function meshesForView(scene: FlatScene, cutawayM?: number): SceneBox[] {
  if (cutawayM == null) return scene.meshes;
  const out: SceneBox[] = [];
  for (const mesh of scene.meshes) {
    // Everything is cut at the same plane, furniture included. Leaving it out
    // was tried first and was worse: with the walls at 1.35 m, a wardrobe
    // standing its full 2.00 m towered over the section as a slab, and read as
    // an error. Cut at the same height it reads as what it is — a section
    // through an apartment, which is what a doll's-house still is.
    const kept = cutBox(mesh, cutawayM);
    if (kept) out.push(kept);
  }
  return out;
}

export function buildThreeScene(
  THREE: THREE,
  scene: FlatScene,
  options?: ThreeSceneOptions,
): ThreeNS.Group {
  const specs = { ...DEFAULT_MATERIALS, ...(options?.materials ?? {}) };
  const group = new THREE.Group();
  group.name = "flat";

  const byMaterial = new Map<MaterialId, SceneBox[]>();
  for (const mesh of meshesForView(scene, options?.cutawayM)) {
    if (options?.include && !options.include(mesh.kind)) continue;
    const list = byMaterial.get(mesh.material);
    if (list) list.push(mesh);
    else byMaterial.set(mesh.material, [mesh]);
  }

  for (const [id, boxes] of byMaterial) {
    const spec = specs[id] ?? DEFAULT_MATERIALS.neutral;
    const material = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: spec.opacity != null,
      opacity: spec.opacity ?? 1,
    });
    // One geometry per material: the boxes are baked into it by position.
    const geometries: ThreeNS.BufferGeometry[] = [];
    for (const box of boxes) {
      const geo = new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z);
      geo.translate(box.centre.x, box.centre.y, box.centre.z);
      geometries.push(geo);
    }
    const merged = mergeGeometries(THREE, geometries);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = id;
    const shadow = options?.shadows !== false && !boxes.every((b) => NO_SHADOW.has(b.kind));
    mesh.castShadow = shadow;
    mesh.receiveShadow = options?.shadows !== false;
    group.add(mesh);
  }
  return group;
}

/** Kelvin to an RGB colour, warm enough to read as lamplight and no warmer. */
export function kelvinColour(kelvin: number): number {
  // A two-point fit over the range a home is lit in, 2500K to 4000K, which is
  // all this needs: below it looks like candlelight and above like an office.
  const t = Math.min(1, Math.max(0, (kelvin - 2500) / 1500));
  const r = 255;
  const g = Math.round(180 + 45 * t);
  const b = Math.round(120 + 105 * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * The lights: a sun, a sky, and every lamp the staging anchored to a piece of
 * measured furniture. Each lamp is switched on and each one pools, which is
 * what the brief has always asked for and what a renderer can simply do.
 */
export function addSceneLights(
  THREE: THREE,
  target: ThreeNS.Object3D,
  scene: FlatScene,
  style: SceneStyle,
  quality: QualityProfile,
): void {
  const span = Math.max(scene.extent.width, scene.extent.depth);
  const dir = sunDirection(style.lighting);
  const sun = new THREE.DirectionalLight(kelvinColour(style.lighting.kelvin), style.lighting.sunIntensity);
  sun.position.set(dir.x * span * 1.6, dir.y * span * 1.6, dir.z * span * 1.6);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const cam = sun.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 0.5;
    cam.far = span * 4;
    sun.shadow.normalBias = 0.02;
    cam.updateProjectionMatrix();
  }
  target.add(sun);
  target.add(
    new THREE.HemisphereLight(style.lighting.skyColor, style.lighting.groundColor, style.lighting.skyIntensity),
  );

  for (const light of scene.lights) {
    const colour = kelvinColour(light.kelvin);
    const point = new THREE.PointLight(colour, light.intensity * 4, span * 0.9, 2);
    point.position.set(light.position.x, light.position.y, light.position.z);
    point.name = light.id;
    target.add(point);
  }
}

/** The camera a rig describes. */
export function cameraFromRig(THREE: THREE, rig: CameraRig, aspect: number): ThreeNS.Camera {
  const camera =
    rig.kind === "orthographic"
      ? new THREE.OrthographicCamera(
          -(rig.halfWidth ?? 10),
          rig.halfWidth ?? 10,
          rig.halfHeight ?? 10,
          -(rig.halfHeight ?? 10),
          rig.near,
          rig.far,
        )
      : new THREE.PerspectiveCamera(rig.fovDeg ?? 30, aspect, rig.near, rig.far);
  camera.position.set(rig.position.x, rig.position.y, rig.position.z);
  camera.up.set(rig.up.x, rig.up.y, rig.up.z);
  camera.lookAt(rig.target.x, rig.target.y, rig.target.z);
  return camera;
}

/**
 * Merge box geometries into one.
 *
 * three ships BufferGeometryUtils for this, but it lives in examples/jsm and
 * pulling an examples module into a server bundle is more trouble than the
 * twenty lines it saves. Boxes are all position/normal/uv, non-indexed once
 * the index is expanded, so the merge is a concatenation.
 */
function mergeGeometries(THREE: THREE, geometries: ThreeNS.BufferGeometry[]): ThreeNS.BufferGeometry {
  const expanded = geometries.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const total = expanded.reduce((sum, geo) => sum + geo.getAttribute("position").count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let vertex = 0;
  for (const geo of expanded) {
    const p = geo.getAttribute("position");
    const n = geo.getAttribute("normal");
    const t = geo.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      position[(vertex + i) * 3] = p.getX(i);
      position[(vertex + i) * 3 + 1] = p.getY(i);
      position[(vertex + i) * 3 + 2] = p.getZ(i);
      normal[(vertex + i) * 3] = n.getX(i);
      normal[(vertex + i) * 3 + 1] = n.getY(i);
      normal[(vertex + i) * 3 + 2] = n.getZ(i);
      uv[(vertex + i) * 2] = t ? t.getX(i) : 0;
      uv[(vertex + i) * 2 + 1] = t ? t.getY(i) : 0;
    }
    vertex += p.count;
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
