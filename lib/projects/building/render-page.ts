import type { BuildingModel } from "@/lib/projects/building/model";

/**
 * The page that draws one frame of a building.
 *
 * The same idea as the flat renderer's page — every decision taken on the
 * server, nothing fetched but three itself — with what a building needs on
 * top: an environment for the glass and the metal to reflect, the sun's
 * shadow over fifty metres, ambient occlusion in the corners, and surfaces
 * painted in metres (a course of stone is 40 cm on every wall it covers).
 */
export type BuildingCamera = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fovDeg: number;
  /** Cut everything above this height away, for a floor seen from above. */
  cutAboveM?: number;
  /** Leave out primitives whose tag starts with any of these. */
  hideTags?: string[];
  /**
   * An elevation's cut: primitives tagged with one of `tags` that stand past
   * the plane x (or z) = at, toward `toward` — the boundary wall between the
   * camera and the face — are left out, as the drawing cuts them.
   */
  hideBefore?: { axis: "x" | "z"; at: number; toward: 1 | -1; tags: string[] };
  /** Standing inside: lit by the rooms' own light, not the open sky. */
  interior?: boolean;
  /** The room an interior view stands in, its floor and its ceiling: where its downlights and pendants hang. */
  room?: { x0: number; x1: number; z0: number; z1: number; floorY: number; ceilingY: number };
  /** Parallel projection, as an elevation is drawn: half the frame's width in metres. */
  orthoHalfWidth?: number;
  /** For an elevation: metres behind the face the ground line is the lowest of (25 by default; 0 cuts at the face). */
  groundBand?: number;
  /** The camera's up vector; a plan seen from above has north, -z, up. */
  up?: { x: number; y: number; z: number };
  /** A vertical section: everything on the far side of the plane x (or z) = at is kept, the near side cut away. */
  section?: { axis: "x" | "z"; at: number; keep: 1 | -1 };
  /** A model on a table, not a building on its site: no hills, no haze. */
  studio?: boolean;
  /** Glass as a clear pane that shows what is behind it (a daylit room, a bright sky), not the dark tinted glass of a permit elevation. */
  clearGlass?: boolean;
  /**
   * A floor plan read as a drawing: the cut walls solid charcoal, each kind of floor its own pale colour, no cast shadow — for a
   * building's storey from above, as a house's plan always was.
   */
  planStyle?: boolean;
  /**
   * A map, not a picture: every primitive flat black on white, no light, no
   * tone mapping — what a check lays a painting's edges against.
   */
  mask?: boolean;
};

export type BuildingRenderPayload = {
  model: BuildingModel;
  camera: BuildingCamera;
  width: number;
  height: number;
  /** Sun direction: azimuth from north, clockwise, and elevation, degrees. */
  sun: { azimuthDeg: number; elevationDeg: number };
  exposure: number;
  /** Ambient occlusion on: slower, and the frame reads as a photograph. */
  ao: boolean;
  /**
   * Trace the frame's light — bounced light, soft shadows, real glass —
   * with this many samples a pixel, rather than rasterise it. Local only:
   * the path tracer is a development dependency. A frame with a cut or a
   * section is rasterised whatever this says: the tracer clips nothing.
   */
  pathTrace?: { samples: number };
};

export const BUILDING_ORIGIN = "https://building3d.local";

export function buildingPageHtml(payload: BuildingRenderPayload): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#fff}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"${BUILDING_ORIGIN}/three/three.module.js","three/webgpu":"${BUILDING_ORIGIN}/three/three.webgpu.js","three/addons/":"${BUILDING_ORIGIN}/jsm/","three/examples/jsm/":"${BUILDING_ORIGIN}/jsm/","three-gpu-pathtracer":"${BUILDING_ORIGIN}/ptr/index.module.js","three-mesh-bvh":"${BUILDING_ORIGIN}/bvh/index.module.js"}}</script>
</head>
<body>
<script>
(function () {
  var seed = 0x2f6e2b1;
  Math.random = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
})();
window.addEventListener("error", function (e) { window.__renderError = String(e.message); });
</script>
<script type="module">
${PAGE_SCRIPT}
</script>
<script>window.__payload = ${JSON.stringify(payload)};</script>
</body></html>`;
}

/**
 * The drawing itself. Kept as one string so the page has nothing to resolve
 * but three and its add-ons.
 */
const PAGE_SCRIPT = String.raw`
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { Sky } from "three/addons/objects/Sky.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

async function main() {
  while (!window.__payload) await new Promise((r) => setTimeout(r, 5));
  const P = window.__payload;
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(P.width, P.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  document.body.appendChild(renderer.domElement);
  // A ground that carries a photograph: its texture loaded before the scene is built.
  const PHOTOS = new Map();
  for (const q of P.model.primitives) {
    if (q.type === "terrain" && q.photo && !PHOTOS.has(q.photo.src)) {
      const tex = await new Promise((res, rej) => new THREE.TextureLoader().load(q.photo.src, res, undefined, rej));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      PHOTOS.set(q.photo.src, tex);
    }
  }

  const scene = new THREE.Scene();

  // Sky and sun.
  const sky = new Sky();
  sky.scale.setScalar(2500);
  const su = sky.material.uniforms;
  su.turbidity.value = 3.2;
  su.rayleigh.value = 1.1;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  const az = THREE.MathUtils.degToRad(P.sun.azimuthDeg);
  const el = THREE.MathUtils.degToRad(P.sun.elevationDeg);
  // North is -z; azimuth runs clockwise from it, so east is +x.
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const sky2 = sky.clone();
  skyScene.add(sky2);
  const envSky = pmrem.fromScene(skyScene, 0.02).texture;
  const envRoom = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const inside = P.camera.interior === true;
  scene.environment = P.camera.cutAboveM != null || inside ? envRoom : envSky;
  // A model on a table, rasterised, takes the sky's whole fill on pale walls
  // and floors and washes out; traced, the fill is the tracer's own.
  const studioRaster = P.camera.studio === true && !inside && !P.pathTrace;
  // A private house in its yard, seen from outside. Its plaster is coloured,
  // and the blue sky's fill washed both colours to the sky's own pale grey:
  // the painting over it found the walls' edges against the sky, and the
  // render had none there. Only a house's model carries these plasters.
  const houseOut = !inside && P.camera.cutAboveM == null && !P.camera.studio && !P.camera.section &&
    P.model.primitives.some((p) => p.material === "renderBrown" || p.material === "renderGray");
  scene.environmentIntensity = inside ? 0.38 : P.camera.cutAboveM != null ? 0.45 : studioRaster ? 0.22 : houseOut ? 0.2 : 0.45;
  // A house's street views in the golden hour the client chose: the sun low
  // and warm, the sky deepening to amber at the horizon, the distance hazed.
  const golden = houseOut && P.camera.orthoHalfWidth == null && P.sun.elevationDeg <= 18;
  if (golden) {
    su.turbidity.value = 6.5; su.rayleigh.value = 2.6; su.mieCoefficient.value = 0.007; su.mieDirectionalG.value = 0.86;
    scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
    scene.environmentIntensity = 0.32;
    scene.fog = new THREE.Fog(0xdcc9ad, 90, 800);
  }
  // and the room environment, not the blue sky, for its reflections.
  if (studioRaster) scene.environment = envRoom;
  if (studioRaster) renderer.toneMappingExposure = P.exposure * 0.82;

  const M = P.model;
  const ext = M.extent;
  const cx = ext.x + ext.width / 2, cz = ext.z + ext.depth / 2;
  const span = Math.max(ext.width, ext.depth);

  // A house's elevation in a softer sun: square on, the shadows of its
  // projections were the strongest lines on the face, and the painting
  // softened every one of them away.
  const houseFlat = houseOut && P.camera.orthoHalfWidth != null && Math.abs(P.camera.position.y - P.camera.target.y) < 1;
  // A private house's storey from above, as the booklet shows it unpainted:
  // in the golden hour's warm low light, not a white noon and a blue fill —
  // read as a computer model, not a visualisation (12/10/2026).
  // Cut in the geometry (cut-model.ts), a plan comes as a studio frame from
  // above with no cut of its own: so read, the house's plans never had this
  // light, and stood in the studio's grey fill (13/10/2026).
  const fromAbove = P.camera.cutAboveM != null || (P.camera.studio === true && P.camera.orthoHalfWidth != null && P.camera.position.y - P.camera.target.y > 10);
  const housePlan = fromAbove && !inside && (P.camera.planStyle === true || P.model.primitives.some((p) => p.material === "renderBrown" || p.material === "renderGray"));
  const sun = new THREE.DirectionalLight(housePlan ? 0xfff3e4 : golden ? 0xffc58c : houseOut ? 0xffe8cc : 0xfff1dc, housePlan ? 2.05 : golden ? 3.4 : houseFlat ? 1.9 : 3.1);
  sun.position.set(cx + sunDir.x * span * 1.5, sunDir.y * span * 1.5, cz + sunDir.z * span * 1.5);
  sun.target.position.set(cx, 8, cz);
  // House plan: no cast sun — wall bands washed the floors (13/10/2026). AO only.
  // Outside / interiors keep soft shadows.
  sun.castShadow = !housePlan;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  const shadowHalf = housePlan && P.camera.orthoHalfWidth != null ? P.camera.orthoHalfWidth * 1.15 : span * 0.8;
  if (housePlan && P.camera.orthoHalfWidth != null) {
    const t = P.camera.target;
    sun.target.position.set(t.x, t.y, t.z);
    sun.position.set(t.x + sunDir.x * span * 1.2, t.y + sunDir.y * span * 1.8, t.z + sunDir.z * span * 1.2);
  }
  sc.left = -shadowHalf; sc.right = shadowHalf; sc.top = shadowHalf; sc.bottom = -shadowHalf;
  sc.near = 1; sc.far = span * 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  // Outside: softer contact shadows (was harsh black on the hero).
  sun.shadow.radius = houseOut && !housePlan ? 6 : 3;
  if (houseOut && !housePlan) { renderer.shadowMap.type = THREE.PCFShadowMap; sun.shadow.blurSamples = 16; }
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(housePlan ? 0xffffff : inside ? 0xfff3e2 : studioRaster || houseOut ? 0xf6efe4 : 0xdfe9f5, housePlan ? 0xb9b3aa : 0x8a7a66, housePlan ? 1.05 : inside ? 0.18 : studioRaster ? 0.22 : houseFlat ? 1.1 : houseOut ? 0.55 : 0.35));
  // Inside, the ceiling's panels light the room: a warm light over each.
  // A room photographed lit as a home is in the evening: warm downlights let
  // into its ceiling every metre and a half, and a pendant low over each
  // dining table. Lit only by the sky and an even fill, the house's rooms
  // read as a model's empty boxes (13/10/2026).
  if (inside && P.camera.room) {
    const R = P.camera.room;
    // The lowest face over the floor: on a top storey it is the roof slab's, under which its ceiling's finish is buried.
    const overhead = P.model.primitives.filter((q) => q.type === "prism" && /(inside:ceiling|slab)/.test(q.tag || "") && q.y0 > R.floorY + 2 && q.y0 < R.floorY + 3.3).map((q) => q.y0);
    const cy = overhead.length ? Math.min(...overhead) : R.ceilingY;
    const nx = Math.max(1, Math.round((R.x1 - R.x0 - 1.2) / 1.5) + 1), nz = Math.max(1, Math.round((R.z1 - R.z0 - 1.2) / 1.5) + 1);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 2.4 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.4, metalness: 0.5 });
    let lit = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = nx === 1 ? (R.x0 + R.x1) / 2 : R.x0 + 0.6 + (i * (R.x1 - R.x0 - 1.2)) / (nx - 1);
      const z = nz === 1 ? (R.z0 + R.z1) / 2 : R.z0 + 0.6 + (j * (R.z1 - R.z0 - 1.2)) / (nz - 1);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24), rimMat);
      rim.position.set(x, cy - 0.006, z); scene.add(rim);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 24), discMat);
      disc.position.set(x, cy - 0.008, z); scene.add(disc);
      if (lit++ < 14) {
        const l = new THREE.SpotLight(0xffd9a8, 4.5, 6, 1.1, 0.8, 1.6);
        l.position.set(x, cy - 0.05, z);
        l.target.position.set(x, R.floorY, z);
        scene.add(l, l.target);
      }
    }
    // Over each dining table: a pendant, its shade dark outside and lit within.
    for (const q of P.model.primitives) {
      if (q.type !== "box" || q.material !== "walnut" || !/inside:furniture/.test(q.tag || "")) continue;
      const top = q.centre.y + q.size.y / 2;
      if (q.size.y > 0.06 || top < R.floorY + 0.68 || top > R.floorY + 0.8 || Math.min(q.size.x, q.size.z) < 0.45 || Math.max(q.size.x, q.size.z) < 1.0) continue;
      if (q.centre.x < R.x0 - 1 || q.centre.x > R.x1 + 1 || q.centre.z < R.z0 - 1 || q.centre.z > R.z1 + 1) continue;
      const hy = R.floorY + 1.6;
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 0.28, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }));
      shade.position.set(q.centre.x, hy, q.centre.z); scene.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd8a0, emissiveIntensity: 3 }));
      bulb.position.set(q.centre.x, hy - 0.06, q.centre.z); scene.add(bulb);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, cy - hy - 0.14, 8), rimMat);
      cord.position.set(q.centre.x, (cy + hy + 0.14) / 2, q.centre.z); scene.add(cord);
      const pl = new THREE.PointLight(0xffcf95, 6, 5, 1.6);
      pl.position.set(q.centre.x, hy - 0.12, q.centre.z); scene.add(pl);
    }
  }
  // A room's ceiling takes the light its floor and walls throw back up; the
  // rasteriser bounces none, and a top storey's ceiling stood dark grey.
  if (inside) scene.add(new THREE.HemisphereLight(0xfff1df, 0xd2bfa2, 0.55));
  if (inside) {
    for (const p of P.model.primitives) {
      if (p.type !== "box" || p.material !== "lightPanel") continue;
      const d = Math.hypot(p.centre.x - P.camera.position.x, p.centre.z - P.camera.position.z);
      if (d > 16 || Math.abs(p.centre.y - P.camera.position.y) > 4) continue;
      const l = new THREE.PointLight(0xffe9cc, 5.5, 7, 1.6);
      l.position.set(p.centre.x, p.centre.y - 0.15, p.centre.z);
      scene.add(l);
    }
  }

  // ---- surfaces, painted in metres ----
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
  const canvasTex = (w, h, draw, repeatM, colour = true) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.repeatM = repeatM;
    return t;
  };
  const noise = (g, w, h, a, base) => {
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rnd() - 0.5) * a;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  };
  // Jerusalem stone: courses 40 cm high, stones 50–110 cm long, each its own shade.
  const stoneTex = (tint) => canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#9d9281"; g.fillRect(0, 0, w, h);
    const course = h / 10;
    for (let r = 0; r < 10; r++) {
      let x = -rnd() * 200;
      while (x < w) {
        const len = 200 + rnd() * 240;
        const l = 196 + rnd() * 22, a = rnd() * 12;
        g.fillStyle = "rgb(" + (l + tint[0] + a) + "," + (l * 0.93 + tint[1]) + "," + (l * 0.79 + tint[2] - a) + ")";
        g.fillRect(x + 3, r * course + 3, len - 6, course - 6);
        // chiselling
        for (let k = 0; k < 90; k++) {
          g.fillStyle = "rgba(90,80,60," + (rnd() * 0.08) + ")";
          g.fillRect(x + 3 + rnd() * (len - 6), r * course + 3 + rnd() * (course - 6), 2 + rnd() * 5, 1 + rnd() * 2);
        }
        x += len;
      }
    }
    noise(g, w, h, 14);
  }, 4.0);
  const plainTex = (hex, a, sizeM) => canvasTex(256, 256, (g, w, h) => { g.fillStyle = hex; g.fillRect(0, 0, w, h); noise(g, w, h, a); }, sizeM);
  const paverTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#7d7366"; g.fillRect(0, 0, w, h);
    const s = w / 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const l = 168 + rnd() * 28;
      g.fillStyle = "rgb(" + l + "," + (l * 0.93) + "," + (l * 0.82) + ")";
      const off = (y % 2) * s / 2;
      g.fillRect(x * s + off + 2, y * s + 2, s - 4, s - 4);
      g.fillRect(x * s + off - w + 2, y * s + 2, s - 4, s - 4);
    }
    noise(g, w, h, 10);
  }, 2.4);
  const asphaltTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#4a4b4d"; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) { const l = 55 + rnd() * 50; g.fillStyle = "rgb(" + l + "," + l + "," + l + ")"; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
  }, 3.0);
  // A lawn as it grows: fine blades in many greens over a soft, low variation
  // that never repeats as a pattern. Its 4 m tile with dark blotches drew a
  // grid across the back garden from above (13/10/2026).
  const grassTex = canvasTex(2048, 2048, (g, w, h) => {
    // Olive lawn — avoid electric green that reads plastic after vividHouseFrame.
    g.fillStyle = "#5f7a42"; g.fillRect(0, 0, w, h);
    // Variation as wrapped, wide, faint washes — no dark spot to repeat.
    for (let k = 0; k < 220; k++) {
      const r = 120 + rnd() * 320, x = rnd() * w, y = rnd() * h, light = rnd() < 0.5;
      for (const [ox, oy] of [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, light ? "rgba(140,160,80,0.06)" : "rgba(50,80,30,0.06)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
      }
    }
    for (let k = 0; k < 260000; k++) { g.fillStyle = "rgba(" + (70 + rnd() * 70) + "," + (105 + rnd() * 65) + "," + (35 + rnd() * 30) + "," + (0.3 + rnd() * 0.4) + ")"; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 3); }
  }, 8.0);
  const soilTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#b39b78"; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 7000; k++) { const l = 130 + rnd() * 70; g.fillStyle = "rgba(" + l + "," + (l * 0.86) + "," + (l * 0.66) + ",0.6)"; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 2 + rnd() * 4); }
    for (let k = 0; k < 400; k++) { g.fillStyle = "rgba(" + (80 + rnd() * 40) + "," + (110 + rnd() * 40) + ",60,0.55)"; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 6, 0, 7); g.fill(); }
  }, 6.0);
  const floorStoneTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#9f978a"; g.fillRect(0, 0, w, h);
    const s = w / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const l = 186 + rnd() * 18; g.fillStyle = "rgb(" + l + "," + (l * 0.955) + "," + (l * 0.9) + ")"; g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2); }
    noise(g, w, h, 6);
  }, 2.4);
  const woodTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#b8895a"; g.fillRect(0, 0, w, h);
    const plank = h / 8;
    for (let r = 0; r < 8; r++) { const l = rnd() * 26; g.fillStyle = "rgb(" + (176 + l) + "," + (128 + l * 0.8) + "," + (84 + l * 0.5) + ")"; g.fillRect(0, r * plank + 1, w, plank - 2);
      for (let k = 0; k < 40; k++) { g.strokeStyle = "rgba(90,55,25," + rnd() * 0.18 + ")"; g.beginPath(); const y = r * plank + rnd() * plank; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 4 - 2, w * 0.6, y + rnd() * 4 - 2, w, y); g.stroke(); } }
  }, 1.6);
  const vinylTex = plainTex("#a9a192", 8, 2);
  // An apartment's floors: oak in long planks, porcelain in 80 cm slabs, a wet room's 30 cm tile.
  // Oak boards 15 cm wide and 1.2–2 m long, each its own shade of pale honey,
  // with fine grain, the odd knot and a hairline joint: wide flat planks of
  // one tone read as a drawing of a floor (13/10/2026).
  const oakTex = canvasTex(2048, 2048, (g, w, h) => {
    g.fillStyle = "#8c7356"; g.fillRect(0, 0, w, h);
    const rows = 16, plank = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 900;
      while (x < w) {
        const len = 1200 + rnd() * 800, t = rnd();
        const base = [196 + t * 26, 160 + t * 24, 118 + t * 20];
        const y0 = r * plank + 1.5, hh = plank - 3;
        const grad = g.createLinearGradient(x, y0, x, y0 + hh);
        grad.addColorStop(0, "rgb(" + (base[0] - 6) + "," + (base[1] - 6) + "," + (base[2] - 5) + ")");
        grad.addColorStop(0.5, "rgb(" + base[0] + "," + base[1] + "," + base[2] + ")");
        grad.addColorStop(1, "rgb(" + (base[0] - 8) + "," + (base[1] - 8) + "," + (base[2] - 6) + ")");
        g.fillStyle = grad;
        g.fillRect(x + 1.5, y0, len - 3, hh);
        for (let k = 0; k < 34; k++) {
          g.strokeStyle = "rgba(" + (105 + rnd() * 30) + "," + (72 + rnd() * 20) + ",42," + (0.05 + rnd() * 0.16) + ")";
          g.lineWidth = 0.4 + rnd() * 1.4;
          g.beginPath();
          const y = y0 + 1 + rnd() * (hh - 2), wob = 2 + rnd() * 4;
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (rnd() - 0.5) * wob, x + len * 0.65, y + (rnd() - 0.5) * wob, x + len, y + (rnd() - 0.5) * 2);
          g.stroke();
        }
        if (rnd() < 0.35) {
          const kx = x + 60 + rnd() * (len - 120), ky = y0 + hh * (0.25 + rnd() * 0.5);
          g.fillStyle = "rgba(95,62,35,0.55)"; g.beginPath(); g.ellipse(kx, ky, 5 + rnd() * 5, 2.5 + rnd() * 2, 0, 0, 7); g.fill();
          g.strokeStyle = "rgba(110,75,45,0.25)"; g.lineWidth = 1;
          for (let q = 1; q < 4; q++) { g.beginPath(); g.ellipse(kx, ky, 6 + q * 6, 3 + q * 2, 0, 0, 7); g.stroke(); }
        }
        x += len;
      }
    }
    noise(g, w, h, 5);
  }, 2.4);
  const slabTex = (base, joint, n, sizeM, vary) => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = joint; g.fillRect(0, 0, w, h);
    const s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const l = (rnd() - 0.5) * vary;
      g.fillStyle = "rgb(" + (base[0] + l) + "," + (base[1] + l) + "," + (base[2] + l) + ")";
      g.fillRect(x * s + 1.5, y * s + 1.5, s - 3, s - 3);
      for (let k = 0; k < 6; k++) { g.strokeStyle = "rgba(150,140,125," + rnd() * 0.08 + ")"; g.beginPath(); const yy = y * s + rnd() * s; g.moveTo(x * s, yy); g.bezierCurveTo(x * s + s * 0.4, yy + rnd() * 20 - 10, x * s + s * 0.6, yy + rnd() * 20 - 10, x * s + s, yy + rnd() * 10 - 5); g.stroke(); }
    }
    noise(g, w, h, 4);
  }, sizeM);
  // Polished porcelain in 80 cm slabs, a faint marble vein drifting across each.
  const porcelainTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#cfc7ba"; g.fillRect(0, 0, w, h);
    const n = 4, sz = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const l = (rnd() - 0.5) * 5;
      g.fillStyle = "rgb(" + (234 + l) + "," + (229 + l) + "," + (220 + l) + ")";
      g.fillRect(x * sz + 1.5, y * sz + 1.5, sz - 3, sz - 3);
      g.save(); g.beginPath(); g.rect(x * sz + 1.5, y * sz + 1.5, sz - 3, sz - 3); g.clip();
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = "rgba(" + (150 + rnd() * 30) + "," + (140 + rnd() * 25) + "," + (125 + rnd() * 20) + "," + (0.06 + rnd() * 0.1) + ")";
        g.lineWidth = 0.6 + rnd() * 2.2;
        g.beginPath();
        let px = x * sz + rnd() * sz, py = y * sz;
        g.moveTo(px, py);
        for (let t = 0; t < 8; t++) { px += (rnd() - 0.4) * sz * 0.3; py += sz / 8; g.lineTo(px, py); }
        g.stroke();
      }
      g.restore();
    }
    noise(g, w, h, 3);
  }, 3.2);
  const wetTex = slabTex([214, 214, 210], "#a9a7a2", 8, 2.4, 8);
  const walnutTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#5e4a3c"; g.fillRect(0, 0, w, h);
    const rows = 6, plank = h / rows;
    for (let r = 0; r < rows; r++) {
      const l = rnd() * 16;
      g.fillStyle = "rgb(" + (112 + l) + "," + (88 + l * 0.8) + "," + (70 + l * 0.6) + ")";
      g.fillRect(0, r * plank + 1, w, plank - 2);
      for (let k = 0; k < 30; k++) { g.strokeStyle = "rgba(40,28,20," + rnd() * 0.25 + ")"; g.lineWidth = 0.5 + rnd(); g.beginPath(); const y = r * plank + rnd() * plank; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.6, y + rnd() * 6 - 3, w, y); g.stroke(); }
    }
    noise(g, w, h, 6);
  }, 1.2);
  const terraceTex = slabTex([188, 176, 160], "#8f8576", 6, 3.6, 14);
  const balconyTex = slabTex([146, 146, 144], "#5f5f5e", 6, 3.6, 10);
  const weaveTex = (hex) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) { g.fillStyle = "rgba(0,0,0," + (0.03 + rnd() * 0.04) + ")"; g.fillRect(i, 0, 1, h); g.fillStyle = "rgba(255,255,255," + rnd() * 0.04 + ")"; g.fillRect(0, i, w, 1); }
  }, 0.5);
  const rugTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#7f8b92"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9c2b6"; g.lineWidth = 10; g.strokeRect(24, 24, w - 48, h - 48);
    g.lineWidth = 3; g.strokeRect(48, 48, w - 96, h - 96);
    for (let k = 0; k < 20000; k++) { g.fillStyle = "rgba(90,75,55," + rnd() * 0.08 + ")"; g.fillRect(rnd() * w, rnd() * h, 1, 1.5); }
  }, 2.4);
  const carpetTex = plainTex("#5f6a78", 18, 1);

  const MAT = {
    stone: new THREE.MeshStandardMaterial({ map: stoneTex([0, 0, 0]), roughness: 0.86 }),
    stoneDeep: new THREE.MeshStandardMaterial({ map: stoneTex([-34, -40, -46]), roughness: 0.88 }),
    render: new THREE.MeshStandardMaterial({ map: plainTex("#ece7dd", 4, 2), roughness: 0.93 }),
    renderGray: new THREE.MeshStandardMaterial({ map: plainTex("#cdbfac", 12, 2), roughness: 0.94 }),
    renderBrown: new THREE.MeshStandardMaterial({ map: plainTex("#86786a", 12, 2), roughness: 0.94 }),
    jerusalemStone: new THREE.MeshStandardMaterial({ map: stoneTex([14, 8, -4]), roughness: 0.82, metalness: 0.04 }),
    louvre: new THREE.MeshStandardMaterial({ color: 0xc8c6c0, roughness: 0.45, metalness: 0.4 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.62, metalness: 0.15 }),
    concrete: new THREE.MeshStandardMaterial({ map: plainTex("#b8b4ac", 16, 3), roughness: 0.92 }),
    plaster: new THREE.MeshStandardMaterial({ map: plainTex("#e9e3d8", 5, 2), roughness: 0.95 }),
    glass: P.camera.clearGlass === true
      ? new THREE.MeshPhysicalMaterial({ color: 0xbcd6e2, metalness: 0.0, roughness: 0.02, transparent: true, opacity: 0.28, envMapIntensity: 1.6, depthWrite: false })
      : new THREE.MeshPhysicalMaterial({ color: 0x3f5560, metalness: 0.55, roughness: 0.04, transparent: true, opacity: 0.8, envMapIntensity: 1.4, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3c3f43, roughness: 0.42, metalness: 0.65 }),
    slab: new THREE.MeshStandardMaterial({ map: plainTex("#d9d5cd", 8, 3), roughness: 0.9 }),
    floorStone: new THREE.MeshStandardMaterial({ map: floorStoneTex, roughness: 0.42, metalness: 0.02 }),
    floorVinyl: new THREE.MeshStandardMaterial({ map: vinylTex, roughness: 0.5 }),
    floorWood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.4, metalness: 0.02 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }),
    parkingLine: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 }),
    paving: new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.72 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }),
    soil: new THREE.MeshStandardMaterial({ map: soilTex, roughness: 1 }),
    soilFar: new THREE.MeshStandardMaterial({ color: 0xbfb393, roughness: 1 }),
    rock: new THREE.MeshStandardMaterial({ map: plainTex("#a89a86", 22, 4), roughness: 1 }),
    existing: new THREE.MeshStandardMaterial({ map: stoneTex([-6, -4, 4]), roughness: 0.9, color: 0xd6d2cc }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.35, metalness: 0.8 }),
    timber: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.5 }),
    upholstery: new THREE.MeshStandardMaterial({ color: 0x3e5566, roughness: 0.9 }),
    upholsteryAccent: new THREE.MeshStandardMaterial({ color: 0xc58b3a, roughness: 0.85 }),
    whiteboard: new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.25 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.2, metalness: 0.4 }),
    // A sink's bowl and a washer's door: dark against the worktop and the white box, so each reads as what it is from above.
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x4d5256, roughness: 0.3, metalness: 0.7 }),
    worktop: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.35 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.2 }),
    signage: new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.3, metalness: 0.7 }),
    planter: new THREE.MeshStandardMaterial({ color: 0x5f5a54, roughness: 0.7 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x4f6b35, roughness: 0.95 }),
    foliage0: new THREE.MeshStandardMaterial({ color: 0x566f37, roughness: 0.95 }),
    foliage1: new THREE.MeshStandardMaterial({ color: 0x6a7f3e, roughness: 0.95 }),
    foliage2: new THREE.MeshStandardMaterial({ color: 0x455e30, roughness: 0.95 }),
    leaves0: new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.95, vertexColors: true }),
    leaves1: new THREE.MeshStandardMaterial({ color: 0x6f8a42, roughness: 0.95, vertexColors: true }),
    leaves2: new THREE.MeshStandardMaterial({ color: 0x4a6a32, roughness: 0.95, vertexColors: true }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.95 }),
    seatFabric: new THREE.MeshStandardMaterial({ color: 0x1f5c66, roughness: 0.92 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.85 }),
    sofaFabric: new THREE.MeshStandardMaterial({ map: weaveTex("#8f8476"), roughness: 0.95 }),
    quartz: new THREE.MeshStandardMaterial({ color: 0x5d5a57, roughness: 0.25 }),
    walnut: new THREE.MeshStandardMaterial({ map: walnutTex, roughness: 0.42 }),
    cushion: new THREE.MeshStandardMaterial({ map: weaveTex("#d9d0c2"), roughness: 0.95 }),
    rug: new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }),
    floorOak: new THREE.MeshStandardMaterial({ map: oakTex, roughness: 0.5 }),
    // A stair's treads in four tones of the same oak, the lowest step the darkest: from straight above, a flight of one tone is a striped floor, and height is what tells a stair from one.
    stairOak0: new THREE.MeshStandardMaterial({ map: oakTex, color: 0xffffff, roughness: 0.5 }),
    stairOak1: new THREE.MeshStandardMaterial({ map: oakTex, color: 0xe9ddcc, roughness: 0.5 }),
    stairOak2: new THREE.MeshStandardMaterial({ map: oakTex, color: 0xd0bfa9, roughness: 0.5 }),
    stairOak3: new THREE.MeshStandardMaterial({ map: oakTex, color: 0xb6a186, roughness: 0.5 }),
    stairStone0: new THREE.MeshStandardMaterial({ map: floorStoneTex, color: 0xffffff, roughness: 0.42, metalness: 0.02 }),
    stairStone1: new THREE.MeshStandardMaterial({ map: floorStoneTex, color: 0xe6dfd4, roughness: 0.42, metalness: 0.02 }),
    stairStone2: new THREE.MeshStandardMaterial({ map: floorStoneTex, color: 0xcbc1b2, roughness: 0.42, metalness: 0.02 }),
    stairStone3: new THREE.MeshStandardMaterial({ map: floorStoneTex, color: 0xaea291, roughness: 0.42, metalness: 0.02 }),
    // The shade a step casts on the next one down: a dark film, laid in two widths so its edge is soft.
    stairShade: new THREE.MeshStandardMaterial({ color: 0x2a1d10, roughness: 1, transparent: true, opacity: 0.17, depthWrite: false }),
    floorPorcelain: new THREE.MeshStandardMaterial({ map: porcelainTex, roughness: 0.16, metalness: 0.02 }),
    floorWet: new THREE.MeshStandardMaterial({ map: wetTex, roughness: 0.4 }),
    terraceTile: new THREE.MeshStandardMaterial({ map: terraceTex, roughness: 0.7 }),
    balconyTile: new THREE.MeshStandardMaterial({ map: balconyTex, roughness: 0.6 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.45 }),
    railGlass: new THREE.MeshPhysicalMaterial({ color: 0xe8f1f2, roughness: 0.03, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.5, transparent: true, opacity: 0.22, depthWrite: false }),
    poche: new THREE.MeshStandardMaterial({ color: P.camera.planStyle ? 0x24232a : P.camera.studio ? 0xd8cbb8 : 0x3b3a38, roughness: 0.9 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 }),
    carGlass: new THREE.MeshPhysicalMaterial({ color: 0x1c2328, metalness: 0.4, roughness: 0.05 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    tailLamp: new THREE.MeshStandardMaterial({ color: 0x9a1616, roughness: 0.25, emissive: 0x3a0505 }),
    headLamp: new THREE.MeshPhysicalMaterial({ color: 0xe8ecef, roughness: 0.08, metalness: 0.3, clearcoat: 1 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xe8c33a, roughness: 0.5 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xefece6, roughness: 0.8 }),
    // A house's windows dark, as a photograph sees them by day, and its flat
    // roof a grey membrane below the parapet's plaster: pale glass and a white
    // roof drew neither a window's nor a roof's edge.
    houseGlass: new THREE.MeshPhysicalMaterial({ color: 0x1d2428, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.88, envMapIntensity: 1.5, depthWrite: false }),
    roofing: new THREE.MeshStandardMaterial({ map: plainTex("#8f8d89", 10, 2), roughness: 0.9 }),
  };
  // A house's plan as a drawing is read: every kind of floor and of furniture its own colour. In the one warm beige of a photograph's
  // light, the oak, the porcelain, the tiles and the sofas ran into each other (17/10/2026). Walls solid charcoal, the living floors a
  // light stone, the wet rooms and the kitchen a blue-grey tile, the bedrooms honey oak, the upholstery deep teal, the joinery walnut.
  if (housePlan) {
    const tint = (name, hex) => { if (MAT[name]) MAT[name].color = new THREE.Color(hex); };
    tint("poche", 0x2b2a2f);
    // The walls the cut passes through: solid, as a plan draws them.
    for (const w of ["renderGray", "renderBrown", "plaster", "render", "stone", "stoneDeep", "existing"]) tint(w, 0x3a3940);
    if (P.camera.planStyle) {
      // A building's floors: oak, stone, vinyl, carpet and ceramic, each its own pale tone.
      tint("floorWood", 0xe9cf9f);
      tint("floorStone", 0xdcddd8);
      tint("floorVinyl", 0xd3d9dc);
      tint("carpet", 0x8aa0b4);
      tint("ceramic", 0x9dbccb);
      tint("paving", 0xcfcac2);
    }
    tint("floorPorcelain", 0xd9dbd6);
    tint("floorWet", 0x86a7b8);
    tint("floorOak", 0xffe6bd);
    tint("terraceTile", 0xb5bcc2);
    tint("balconyTile", 0xc7ced4);
    tint("sofaFabric", 0x5e93b0);
    tint("walnut", 0xb89c84);
    tint("cabinet", 0xffffff);
    tint("rug", 0xb9d3e0);
    tint("cushion", 0xe0d4c4);
  }
  // Relief, from the surfaces' own paint: a stone's joints and pits, a plaster's grain, the lawn's blades, the asphalt's aggregate
  // stand in the light instead of lying flat on it — what the raster lacks of a photograph's microdetail. Not on a plan: seen
  // straight down, it only dirties the floors the painting is checked against.
  if (!fromAbove) {
    const relief = { stone: 2.2, stoneDeep: 2.2, jerusalemStone: 2.6, existing: 1.6, render: 0.9, renderGray: 1.1, renderBrown: 1.1, plaster: 0.7, concrete: 1.2, paving: 1.8, asphalt: 1.4, grass: 1.5, floorStone: 0.8, balconyTile: 0.8, terraceTile: 0.8, roofing: 0.8 };
    for (const [name, scale] of Object.entries(relief)) {
      const m = MAT[name];
      if (m && m.map) { m.bumpMap = m.map; m.bumpScale = scale; }
    }
  }
  const materialOf = (p) => {
    if (houseOut && p.material === "glass" && !(p.tag && p.tag.includes("railing"))) return MAT.houseGlass;
    if (houseOut && p.material === "slab" && p.tag === "roof:slab") return MAT.roofing;
    return MAT[p.material] || MAT.plaster;
  };
  const planes = [];
  if (P.camera.cutAboveM != null) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), P.camera.cutAboveM));
  const sec = P.camera.section;
  if (sec) {
    const n = sec.axis === "x" ? new THREE.Vector3(sec.keep, 0, 0) : new THREE.Vector3(0, 0, sec.keep);
    planes.push(new THREE.Plane(n, -sec.keep * sec.at));
  }
  const clip = planes.length ? planes : null;
  const unclippedCache = new Map();
  const unclipped = (m) => {
    if (!unclippedCache.has(m)) {
      const c = m.clone();
      // Keep a vertical section's plane; drop only the horizontal cut.
      c.clippingPlanes = planes.filter((pl) => Math.abs(pl.normal.y) < 0.5);
      unclippedCache.set(m, c);
    }
    return unclippedCache.get(m);
  };
  if (clip) for (const m of Object.values(MAT)) { m.clippingPlanes = clip; m.clipShadows = true; if (sec && P.camera.interior) m.side = THREE.DoubleSide; }

  // A box whose faces carry UVs in metres, so every texture keeps its scale.
  // Its faces take them from where they are in the world: a floor
  // is many rectangles, and each starting its boards and tiles at its own
  // corner drew the floor as patches with a seam at every join.
  const worldBox = (sx, sy, sz, repeatM, at) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const uv = geo.attributes.uv, nrm = geo.attributes.normal, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      if (ny > 0.5 && at) {
        uv.setXY(i, (pos.getX(i) + at.x) / repeatM, -(pos.getZ(i) + at.z) / repeatM);
        continue;
      }
      // Its sides too: a garden wall is a run of boxes, and each starting its
      // stone courses at its own corner drew the wall as patches (Gottlieb, 11/10/2026).
      if (at && ny <= 0.5) {
        uv.setXY(i, (nx > 0.5 ? pos.getZ(i) + at.z : pos.getX(i) + at.x) / repeatM, (pos.getY(i) + at.y) / repeatM);
        continue;
      }
      const [a, b] = nx > 0.5 ? [sz, sy] : ny > 0.5 ? [sx, sz] : [sx, sy];
      uv.setXY(i, (uv.getX(i) * a) / repeatM, (uv.getY(i) * b) / repeatM);
    }
    return geo;
  };
  const repeatOf = (m) => (m.map && m.map.userData.repeatM) || 1;
  // An elevation sees the yard's slabs edge on, a band of ground under the
  // house: their joints there are not the drawing's lines, and a painting
  // that smoothed them was refused as one that lost structure. Their sides
  // are drawn plain, in the colour of their top.
  const SIDE_COLOUR = { floorStone: "#c3baaf", paving: "#c3baaf", grass: "#c3baaf" };
  const sideCache = new Map();
  const groundSide = (p, mat) => {
    const hex = P.camera.hideBefore && p.tag && p.tag.startsWith("yard:") ? SIDE_COLOUR[p.material] : null;
    if (!hex) return mat;
    if (!sideCache.has(hex)) sideCache.set(hex, new THREE.MeshStandardMaterial({ map: plainTex(hex, 5, 2), roughness: 0.9, clippingPlanes: clip }));
    return [mat, sideCache.get(hex)];
  };
  // And the plot's paving goes on down out of the frame: a band that stopped
  // short drew an edge over the empty sky below it that no painting kept.
  const groundFloorOf = (p) => {
    const c = P.camera;
    if (!c.hideBefore || p.tag !== "yard:paving" || c.orthoHalfWidth == null) return p.y0;
    return Math.min(p.y0, c.target.y - (c.orthoHalfWidth * P.height) / P.width - 1);
  };
  const hidden = (tag) => P.camera.hideTags && tag && P.camera.hideTags.some((h) => tag.startsWith(h));
  const cutBefore = (p) => {
    const hb = P.camera.hideBefore;
    if (!hb || !p.tag || !p.centre || !hb.tags.some((h) => p.tag.startsWith(h))) return false;
    return (p.centre[hb.axis] - hb.at) * hb.toward > 0;
  };

  // A house seen from its street stands in a neighbourhood, not on an empty
  // green plain to the horizon (13/10/2026): its neighbours' houses either
  // side and across the road, trees along the far pavement, and the hills
  // beyond in the evening haze. Scenery only — outside the plot, never in a
  // plan or an elevation, and nothing of the sheet's own is touched.
  const scenery = [];
  if (houseOut && P.camera.orthoHalfWidth == null && M.plot && M.street) {
    const ground = M.primitives.find((q) => q.type === "terrain" && q.tag === "site:ground");
    const hAt = (x, z) => {
      if (!ground) return 0;
      const i = Math.max(0, Math.min(ground.nx - 1, Math.round((x - ground.x0) / ground.dx)));
      const j = Math.max(0, Math.min(ground.nz - 1, Math.round((z - ground.z0) / ground.dx)));
      return ground.heights[j * ground.nx + i];
    };
    // The street's frame: u along it, v out to it.
    const W = { south: (u, v) => ({ x: u, z: v }), north: (u, v) => ({ x: u, z: -v }), east: (u, v) => ({ x: v, z: u }), west: (u, v) => ({ x: -v, z: u }) }[M.street];
    const U = { south: (x, z) => [x, z], north: (x, z) => [x, -z], east: (x, z) => [z, x], west: (x, z) => [z, -x] }[M.street];
    const corners = [[M.plot.x0, M.plot.z0], [M.plot.x1, M.plot.z1], [M.plot.x0, M.plot.z1], [M.plot.x1, M.plot.z0]].map(([x, z]) => U(x, z));
    const u0 = Math.min(...corners.map((c) => c[0])), u1 = Math.max(...corners.map((c) => c[0]));
    const vF = Math.max(...corners.map((c) => c[1])), vB = Math.min(...corners.map((c) => c[1]));
    const road = M.primitives.find((q) => q.type === "terrain" && q.tag === "site:road");
    const vRoad = road ? Math.max(...[[road.x0, road.z0], [road.x0 + road.nx * road.dx, road.z0 + road.nz * road.dx]].map(([x, z]) => U(x, z)[1])) : vF + 9.5;
    const box = (ua, ub, va, vb, y0, y1, material, tag = "scenery") => {
      const a = W(ua, va), b = W(ub, vb);
      scenery.push({ type: "box", centre: { x: (a.x + b.x) / 2, y: (y0 + y1) / 2, z: (a.z + b.z) / 2 }, size: { x: Math.abs(b.x - a.x), y: y1 - y0, z: Math.abs(b.z - a.z) }, material, tag });
    };
    const bodies = ["jerusalemStone", "render", "renderGray", "jerusalemStone", "stone", "render"];
    let nHouse = 0;
    // A house whose street face is at v = face, its back at v = face - deep * facing.
    // Never where the camera stands, nor between it and the house.
    const [camU, camV] = U(P.camera.position.x, P.camera.position.z);
    const [tgtU, tgtV] = U(P.camera.target.x, P.camera.target.z);
    const inTheWay = (ua, ub, va, vb) => {
      for (let k = 0; k <= 24; k++) {
        const f = k / 24, u = camU + (tgtU - camU) * f, v = camV + (tgtV - camV) * f;
        if (u > ua - 6 && u < ub + 6 && v > Math.min(va, vb) - 6 && v < Math.max(va, vb) + 6) return true;
      }
      return false;
    };
    const house = (ua, ub, face, deep, facing) => {
      const [va, vb] = facing > 0 ? [face - deep, face] : [face, face + deep];
      if (inTheWay(ua, ub, va, vb)) return;
      const pts = [[ua, va], [ub, va], [ua, vb], [ub, vb]].map(([u, v]) => { const w = W(u, v); return hAt(w.x, w.z); });
      const y = Math.min(...pts);
      const storeys = rnd() < 0.7 ? 2 : 3, top = y + 0.6 + storeys * 3.0;
      const mat = bodies[nHouse++ % bodies.length];
      box(ua, ub, va, vb, y - 1.5, top, mat);
      box(ua - 0.05, ub + 0.05, va - 0.05, vb + 0.05, top, top + 0.12, "stone");
      box(ua, ub, va, vb, y - 1.5, y + 0.6, "stoneDeep");
      // Windows on the street face, in stone surrounds; a door in the middle.
      const t = facing > 0 ? vb : va, out = facing * 0.04;
      for (let k = 0; k < storeys; k++) {
        const wy = y + 0.6 + k * 3.0;
        for (let u = ua + 1.4; u < ub - 1.6; u += 2.9) {
          if (k === 0 && Math.abs(u + 0.65 - (ua + ub) / 2) < 1.4) continue;
          box(u - 0.12, u + 1.42, t - out, t + out * 2, wy + 0.85, wy + 2.35, "stone");
          box(u, u + 1.3, t + out * 2, t + out * 3, wy + 0.95, wy + 2.25, "houseGlass");
        }
      }
      // And on its sides: a blank flank beside the plot read as a block.
      for (const su of [ua, ub]) {
        const so = su === ua ? -0.04 : 0.04;
        for (let k = 0; k < storeys; k++) {
          const wy = y + 0.6 + k * 3.0;
          for (let v = Math.min(va, vb) + 1.6; v < Math.max(va, vb) - 1.8; v += 3.4) {
            box(su - so, su + so * 2, v - 0.1, v + 1.3, wy + 0.85, wy + 2.35, "stone");
            box(su + so * 2, su + so * 3, v, v + 1.2, wy + 0.95, wy + 2.25, "houseGlass");
          }
        }
      }
      const mid = (ua + ub) / 2;
      box(mid - 0.6, mid + 0.6, t + out * 2, t + out * 3, y + 0.6, y + 2.8, "walnut");
      box(mid - 0.75, mid + 0.75, t - out, t + out * 2, y + 0.6, y + 2.95, "stone");
      // Its solar heater on the roof.
      const sv = facing > 0 ? va + 1.5 : vb - 2.7;
      box(mid - 0.9, mid + 0.9, sv, sv + 1.2, top + 0.12, top + 1.4, "louvre");
      // Its garden wall along the street, a gate's gap in front of the door.
      const gv = facing > 0 ? face + 4.5 : face - 4.5;
      const gy = Math.min(hAt(W(ua, gv).x, W(ua, gv).z), hAt(W(ub, gv).x, W(ub, gv).z));
      box(ua - 2, mid - 0.9, gv - 0.15, gv + 0.15, gy - 0.5, gy + 1.1, "jerusalemStone");
      box(mid + 0.9, ub + 2, gv - 0.15, gv + 0.15, gy - 0.5, gy + 1.1, "jerusalemStone");
      if (rnd() < 0.8) {
        const tu = rnd() < 0.5 ? ua + 1 : ub - 1, tv = (face + gv) / 2, tw = W(tu, tv);
        scenery.push({ type: "tree", at: { x: tw.x, y: hAt(tw.x, tw.z), z: tw.z }, height: 4 + rnd() * 2.5, crown: 1.6 + rnd() * 1.1, tag: "tree:scenery" });
      }
    };
    // Either side, set back as this pair is.
    const deep = Math.min(16, Math.max(10, (vF - vB) * 0.6));
    for (const side of [-1, 1]) {
      let edge = side < 0 ? u0 - 3.5 : u1 + 3.5;
      for (let k = 0; k < 3; k++) {
        const w = 13 + rnd() * 6;
        const [a, b] = side < 0 ? [edge - w, edge] : [edge, edge + w];
        house(a, b, vF - 5.5 - rnd() * 1.5, deep, 1);
        edge = side < 0 ? a - 7 : b + 7;
      }
    }
    // Across the road, facing it.
    for (let u = u0 - 60; u < u1 + 60; ) {
      const w = 13 + rnd() * 6;
      house(u, u + w, vRoad + 7 + rnd() * 2, deep, -1);
      u += w + 6 + rnd() * 3;
    }
    // Trees along the far pavement.
    for (let u = u0 - 50; u < u1 + 50; u += 8 + rnd() * 3) {
      // Never across from the plot itself: there they stood between the camera and the house.
      if (u > u0 - 8 && u < u1 + 8) continue;
      if (inTheWay(u - 2, u + 2, vRoad, vRoad + 3)) continue;
      const tw = W(u, vRoad + 1.4);
      scenery.push({ type: "tree", at: { x: tw.x, y: hAt(tw.x, tw.z), z: tw.z }, height: 5 + rnd() * 2, crown: 1.9 + rnd() * 0.8, tag: "tree:scenery" });
    }
    // The hills beyond, in the haze: a ring of ground rising from the plain.
    const ringIn = 260, ringOut = 1100, segA = 220, segR = 30;
    const geo = new THREE.BufferGeometry();
    const posArr = [], idx = [], colArr = [];
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      for (let j = 0; j <= segR; j++) {
        const t = j / segR, r = ringIn + (ringOut - ringIn) * t;
        const swell = Math.sin(a * 3 + ph[0]) * 0.5 + Math.sin(a * 7 + ph[1]) * 0.3 + Math.sin(a * 13 + ph[2]) * 0.2;
        const hgt = -3 + Math.pow(t, 0.8) * (30 + 26 * swell) + Math.sin(t * 11 + a * 9) * 3 * t + Math.sin(a * 31 + t * 7) * 1.5 * t;
        posArr.push(cx + Math.cos(a) * r, hgt, cz + Math.sin(a) * r);
        // Olive groves, terraces and pale rock in patches.
        const patch = 0.5 + 0.5 * Math.sin(a * 23 + t * 17 + ph[1]) * Math.sin(a * 11 - t * 13 + ph[2]);
        colArr.push(0.5 + 0.12 * patch, 0.5 + 0.08 * patch, 0.38 + 0.1 * patch);
        if (i < segA && j < segR) { const k = i * (segR + 1) + j; idx.push(k, k + segR + 1, k + 1, k + 1, k + segR + 1, k + segR + 2); }
      }
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const hills = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    hills.receiveShadow = false;
    scene.add(hills);
  }

  for (const p of [...M.primitives, ...scenery]) {
    if (hidden(p.tag) || cutBefore(p)) continue;
    // A plan's horizontal cut goes through the building only: the street, the
    // site's stairs and walls, trees and cars are drawn whole, as the sheet
    // draws them above the cut.
    // yard:car — the plan cut must not slice saloons at the street (16/10/2026).
    const siteTag = p.tag && /^(site:|tree|car|yard:car)/.test(p.tag);
    // From inside, a top storey's ceiling is its roof slab's underside: plastered white, not the concrete's grey.
    const slabOverhead = inside && p.type === "prism" && /slab/.test(p.tag || "") && P.camera.room && p.y0 > P.camera.room.floorY + 2;
    const photoMat = p.type === "terrain" && p.photo ? new THREE.MeshStandardMaterial({ map: PHOTOS.get(p.photo.src), roughness: 1, metalness: 0 }) : null;
    const mat = photoMat ? photoMat : slabOverhead ? MAT.ceiling : siteTag && P.camera.cutAboveM != null ? unclipped(materialOf(p)) : materialOf(p);
    let mesh;
    // A thin flat part rounded in plan — a basin's oval bowl, a washer's round
    // door — is a rounded outline extruded to its thickness: a rounded box is
    // rounded no more than half its height, and they stayed square.
    const flatRound = p.type === "box" && p.round && p.size.y < 0.2 * Math.min(p.size.x, p.size.z) && p.round > p.size.y;
    if (flatRound) {
      const hx = p.size.x / 2, hz = p.size.z / 2, r = Math.min(p.round, hx * 0.999, hz * 0.999);
      const sh = new THREE.Shape();
      sh.moveTo(-hx + r, -hz); sh.lineTo(hx - r, -hz); sh.quadraticCurveTo(hx, -hz, hx, -hz + r);
      sh.lineTo(hx, hz - r); sh.quadraticCurveTo(hx, hz, hx - r, hz); sh.lineTo(-hx + r, hz);
      sh.quadraticCurveTo(-hx, hz, -hx, hz - r); sh.lineTo(-hx, -hz + r); sh.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: p.size.y, bevelEnabled: false, curveSegments: 16 });
      geo.rotateX(Math.PI / 2);
      geo.translate(0, p.size.y / 2, 0);
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.centre.x, p.centre.y, p.centre.z);
      if (p.rotY) mesh.rotation.y = p.rotY;
    } else if (p.type === "box" && p.round) {
      const r = Math.min(p.round, p.size.x / 2.01, p.size.y / 2.01, p.size.z / 2.01);
      mesh = new THREE.Mesh(new RoundedBoxGeometry(p.size.x, p.size.y, p.size.z, 3, r), mat);
      mesh.position.set(p.centre.x, p.centre.y, p.centre.z);
      if (p.rotY) mesh.rotation.y = p.rotY;
    } else if (p.type === "box") {
      mesh = new THREE.Mesh(worldBox(p.size.x, p.size.y, p.size.z, repeatOf(mat), p.rotY ? null : p.centre), mat);
      mesh.position.set(p.centre.x, p.centre.y, p.centre.z);
      if (p.rotY) mesh.rotation.y = p.rotY;
    } else if (p.type === "prism") {
      const shape = new THREE.Shape(p.ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const h of p.holes || []) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
      const y0 = groundFloorOf(p);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.y1 - y0, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, y0, 0);
      // UVs in metres from world position, projected by each face's normal.
      const pos = geo.attributes.position, uv = geo.attributes.uv; geo.computeVertexNormals(); const nrm = geo.attributes.normal;
      const r = repeatOf(mat);
      for (let i = 0; i < uv.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ny = Math.abs(nrm.getY(i)), nx = Math.abs(nrm.getX(i));
        uv.setXY(i, ny > 0.5 ? x / r : (nx > 0.5 ? z : x) / r, ny > 0.5 ? z / r : y / r);
      }
      mesh = new THREE.Mesh(geo, groundSide(p, mat));
    } else if (p.type === "cylinder") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.height, 32), mat);
      mesh.position.set(p.centre.x, p.centre.y, p.centre.z);
    } else if (p.type === "terrain") {
      // An elevation's cut: the slope between the camera and the face, seen
      // edge on, drew stray lines over the yard — only the rows behind it.
      let [ia, ib, ja, jb] = [0, p.nx - 1, 0, p.nz - 1];
      const hb = P.camera.hideBefore;
      if (hb) {
        const [o, n] = hb.axis === "x" ? [p.x0, p.nx] : [p.z0, p.nz];
        const edge = (hb.at - o) / p.dx;
        const [lo, hi] = hb.toward > 0 ? [0, Math.min(n - 1, Math.floor(edge))] : [Math.max(0, Math.ceil(edge)), n - 1];
        if (hb.axis === "x") [ia, ib] = [lo, hi];
        else [ja, jb] = [lo, hi];
      }
      if (ib - ia < 1 || jb - ja < 1) continue;
      const cols = ib - ia + 1, rows = jb - ja + 1;
      const geo = new THREE.PlaneGeometry((cols - 1) * p.dx, (rows - 1) * p.dx, cols - 1, rows - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      const r = repeatOf(mat);
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const k = (j - ja) * cols + (i - ia);
        const x = p.x0 + i * p.dx, z = p.z0 + j * p.dx;
        pos.setXYZ(k, x, p.heights[j * p.nx + i], z);
        if (p.photo) {
          // The fit's own mapping: pixel = ((dx·cos + dz·sin) / s + cu, (−dx·sin + dz·cos) / s + cv), the image's v counted down.
          const ph = p.photo, c = Math.cos(ph.rot), sn = Math.sin(ph.rot), dx = x - ph.cx, dz = z - ph.cz;
          uv.setXY(k, ((dx * c + dz * sn) / ph.s + ph.cu) / ph.pw, 1 - ((-dx * sn + dz * c) / ph.s + ph.cv) / ph.ph);
        }
        else uv.setXY(k, x / r, z / r);
      }
      geo.computeVertexNormals();
      // From above, a house's plan lights its ground as flat: lit as it
      // slopes, the bank between the back garden and the lower side yard read
      // as a square patch of another green (Gottlieb A, 13/10/2026).
      if (housePlan) { const nr = geo.attributes.normal; for (let k = 0; k < nr.count; k++) nr.setXYZ(k, 0, 1, 0); nr.needsUpdate = true; }
      mesh = new THREE.Mesh(geo, mat);
    } else if (p.type === "tree") {
      // A trunk and a crown of overlapping clumps, each its own green.
      const g = new THREE.Group();
      const trunkH = p.height * 0.42;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, trunkH, 10), MAT.bark);
      trunk.position.y = trunkH / 2; g.add(trunk);
      const clumps = 14;
      for (let k = 0; k < clumps; k++) {
        const r = p.crown * (0.3 + rnd() * 0.2);
        // Welded, so the clump is shaded round rather than in facets, and
        // speckled leaf by leaf through its vertices' colours.
        const ico = new THREE.IcosahedronGeometry(r, 4);
        ico.deleteAttribute("normal"); ico.deleteAttribute("uv");
        const geo = mergeVertices(ico);
        const pos = geo.attributes.position;
        // Lumpy by direction, so a vertex shared by faces moves once and the
        // crown stays whole.
        const seedK = rnd() * 100;
        const tone = new Float32Array(pos.count * 3);
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
          const n = Math.sin((x / r) * 5.1 + seedK) * Math.sin((y / r) * 4.3 + seedK * 0.7) * Math.sin((z / r) * 5.7 + seedK * 1.3);
          const leafy = Math.sin((x / r) * 23 + seedK) * Math.sin((y / r) * 19) * Math.sin((z / r) * 21 + seedK);
          const f = 0.9 + 0.16 * n + 0.05 * leafy;
          pos.setXYZ(v, x * f, y * f, z * f);
          const t = 0.72 + 0.28 * rnd() + 0.12 * leafy;
          tone[v * 3] = t; tone[v * 3 + 1] = t; tone[v * 3 + 2] = t;
        }
        geo.setAttribute("color", new THREE.BufferAttribute(tone, 3));
        geo.computeVertexNormals();
        const leaf = new THREE.Mesh(geo, MAT["leaves" + (k % 3)]);
        const a = (k / clumps) * Math.PI * 2 + rnd();
        const d = k === 0 ? 0 : p.crown * 0.45 * rnd() + p.crown * 0.2;
        leaf.position.set(Math.cos(a) * d, trunkH + p.crown * 0.55 + (rnd() - 0.3) * p.crown * 0.6, Math.sin(a) * d);
        leaf.castShadow = true; leaf.receiveShadow = true;
        g.add(leaf);
      }
      g.position.set(p.at.x, p.at.y, p.at.z);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      scene.add(g);
      continue;
    } else if (p.type === "plant") {
      // A pot, and leaves in clumps over it, each its own green.
      const g = new THREE.Group();
      const potH = Math.min(0.42, p.height * 0.35), potR = p.spread * 0.42;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.8, potH, 24), MAT.planter);
      pot.position.y = potH / 2; g.add(pot);
      const clumps = 9;
      for (let k = 0; k < clumps; k++) {
        const r = p.spread * (0.32 + rnd() * 0.16);
        const geo = new THREE.IcosahedronGeometry(r, 2);
        const pos = geo.attributes.position;
        const seedK = rnd() * 100;
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
          const f = 0.85 + 0.25 * Math.sin((x / r) * 7 + seedK) * Math.sin((z / r) * 6 + seedK);
          pos.setXYZ(v, x * f, y * f * 1.2, z * f);
        }
        geo.computeVertexNormals();
        const leaf = new THREE.Mesh(geo, MAT["foliage" + (k % 3)]);
        const a = (k / clumps) * Math.PI * 2 + rnd();
        const d = k === 0 ? 0 : p.spread * (0.15 + 0.3 * rnd());
        leaf.position.set(Math.cos(a) * d, potH + (p.height - potH) * (0.35 + 0.55 * rnd()), Math.sin(a) * d);
        g.add(leaf);
      }
      g.position.set(p.at.x, p.at.y, p.at.z);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      scene.add(g);
      continue;
    } else if (p.type === "car") {
      // A modern saloon modelled as one: its side profile — bumper, bonnet,
      // windscreen, roof, boot — extruded with rounded edges, a glasshouse set
      // in from the body, black arches, spoked rims, mirrors, door seams, a
      // grille and lamps. A box body under a glass box read as a toy (13/10/2026).
      const g = new THREE.Group();
      // A plan's cut is the storey's, 1.3 m over its floor: a car in the yard stands outside it, on ground the floor sits above or
      // below, and is drawn whole — the site is never cut (line 779's siteTag). Cut at 1.3 m, a car set on its wheels on the ramp
      // lost its roof and most of its body from above (17/10/2026).
      const wholeCar = P.camera.cutAboveM != null && /^(yard|site)/.test(p.tag || "");
      const carClip = wholeCar ? planes.filter((pl) => Math.abs(pl.normal.y) < 0.5) : clip;
      const mm = (m) => (wholeCar ? unclipped(m) : m);
      const paint = new THREE.MeshPhysicalMaterial({ color: p.colour, metalness: 0.62, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, clippingPlanes: carClip });
      const trim = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.55, clippingPlanes: carClip });
      // Profiles drawn as (z, y), the front at +z; extruded across x and turned to lie along z.
      const extrudeAlongX = (pts, width, bevel) => {
        const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
        geo.rotateY(-Math.PI / 2);
        geo.translate((width - 2 * bevel) / 2, 0, 0);
        return geo;
      };
      const bodyPts = [[-2.22, 0.24], [2.22, 0.24], [2.3, 0.4], [2.27, 0.62], [2.12, 0.74], [1.25, 0.86], [-1.62, 0.9], [-2.16, 0.84], [-2.3, 0.62], [-2.28, 0.4]];
      g.add(new THREE.Mesh(extrudeAlongX(bodyPts, 1.8, 0.14), paint));
      const glassPts = [[1.3, 0.84], [0.42, 1.36], [-0.9, 1.38], [-1.66, 0.9]];
      g.add(new THREE.Mesh(extrudeAlongX(glassPts, 1.5, 0.07), mm(MAT.carGlass)));
      const roof = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.05, 1.22, 3, 0.02), paint);
      roof.position.set(0, 1.43, -0.24); g.add(roof);
      // Pillars and the window line in black trim, the doors' seams on each side.
      for (const sx of [-1, 1]) {
        const sill = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 2.9), trim);
        sill.position.set(sx * 0.76, 0.9, -0.2); g.add(sill);
        const bpillar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.46, 0.09), trim);
        bpillar.position.set(sx * 0.74, 1.13, -0.22); g.add(bpillar);
        for (const z of [0.95, -0.25, -1.45]) {
          const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), trim);
          seam.position.set(sx * 0.9, 0.6, z); g.add(seam);
        }
        const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.11, 0.2, 2, 0.04), paint);
        mirror.position.set(sx * 0.98, 0.98, 0.95); g.add(mirror);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.16), trim);
        handle.position.set(sx * 0.91, 0.75, 0.45); g.add(handle);
      }
      for (const [x, z] of [[-0.79, 1.4], [0.79, 1.4], [-0.79, -1.42], [0.79, -1.42]]) {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 32), mm(MAT.tyre));
        tyre.rotation.z = Math.PI / 2; tyre.position.set(x, 0.33, z); g.add(tyre);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.25, 28), mm(MAT.metal));
        rim.rotation.z = Math.PI / 2; rim.position.set(x, 0.33, z); g.add(rim);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 12), trim);
        hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.33, z); g.add(hub);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.035, 0.17), trim);
          spoke.position.set(x, 0.33 + Math.sin(a) * 0.12, z + Math.cos(a) * 0.12);
          spoke.rotation.x = -a; g.add(spoke);
        }
      }
      const grille = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.16, 0.05, 2, 0.02), trim);
      grille.position.set(0, 0.52, 2.42); g.add(grille);
      for (const x of [-0.62, 0.62]) {
        const head = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.1, 0.08, 2, 0.03), mm(MAT.headLamp));
        head.position.set(x, 0.67, 2.4); head.rotation.x = -0.5; g.add(head);
        const tail = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.1, 0.06, 2, 0.03), mm(MAT.tailLamp));
        tail.position.set(x, 0.72, -2.4); g.add(tail);
      }
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.03), mm(MAT.plate));
      plate.position.set(0, 0.38, 2.45); g.add(plate);
      const plate2 = plate.clone(); plate2.position.set(0, 0.5, -2.44); g.add(plate2);
      // The car stands on its four wheels, not on its middle: a bay on a ramp falls most of a metre under a car's length,
      // and one set level at the height of its centre hung its street end in the air (Gottlieb A's right bay, 17/10/2026).
      const parks = M.primitives.filter((q) => q.type === "terrain" && q.tag === "yard:parking");
      const groundAt = (x, z) => {
        for (const t of parks) {
          const fi = (x - t.x0) / t.dx, fj = (z - t.z0) / t.dx;
          if (fi < 0 || fj < 0 || fi > t.nx - 1 || fj > t.nz - 1) continue;
          const i0 = Math.min(t.nx - 2, Math.floor(fi)), j0 = Math.min(t.nz - 2, Math.floor(fj)), u = fi - i0, v = fj - j0;
          const H = (a, b) => t.heights[b * t.nx + a];
          return (H(i0, j0) * (1 - u) + H(i0 + 1, j0) * u) * (1 - v) + (H(i0, j0 + 1) * (1 - u) + H(i0 + 1, j0 + 1) * u) * v;
        }
        return null;
      };
      const [sy, cy] = [Math.sin(p.rotY), Math.cos(p.rotY)];
      const wheelAt = (off, lx, lz) => groundAt(p.at.x + off * sy + lx * cy + lz * sy, p.at.z + off * cy - lx * sy + lz * cy);
      // Tilted nose-down on its ramp, the car's tail swings back and up: its bumper and roof would stand in the house's wall,
      // which reads as the house pushed in (the first fix, 17/10/2026). So it is slid forward by what the tail gained, and
      // the wheels read again where it now stands.
      let off = 0, pose = null;
      for (let pass = 0; pass < 3; pass++) {
        const w = [wheelAt(off, -0.79, 1.4), wheelAt(off, 0.79, 1.4), wheelAt(off, -0.79, -1.42), wheelAt(off, 0.79, -1.42)];
        if (!w.every((h) => h != null)) { pose = null; off = 0; break; }
        const pitch = -Math.atan((w[0] + w[1] - w[2] - w[3]) / 2 / 2.82);
        const roll = Math.atan((w[1] + w[3] - w[0] - w[2]) / 2 / 1.58);
        pose = { y: (w[0] + w[1] + w[2] + w[3]) / 4, pitch, roll };
        // The tail's rearmost point after the tilt, along the car, against the level car's -2.3.
        const rearmost = Math.min(...[[0.9, -2.3], [0.62, -2.3], [0.24, -2.22], [0.84, -2.16]].map(([y, z]) => y * Math.sin(pitch) + z * Math.cos(pitch)));
        const next = Math.max(0, -2.3 - rearmost);
        if (Math.abs(next - off) < 0.005) break;
        off = next;
      }
      g.position.set(p.at.x + off * sy, p.at.y, p.at.z + off * cy);
      g.rotation.order = "YXZ";
      g.rotation.y = p.rotY;
      if (pose) {
        g.position.y = pose.y;
        // Front (+z) higher than the rear is a rotation about x by a negative angle; the right side higher, about z by a positive one.
        g.rotation.x = pose.pitch;
        g.rotation.z = pose.roll;
      }
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      scene.add(g);
      continue;
    } else if (p.type === "person") {
      const g = new THREE.Group();
      // Figures for scale, drawn as an architect draws them: pale and plain.
      const cloth = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.9, clippingPlanes: clip });
      const h = p.height;
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, h * 0.38, 4, 8), MAT.trousers);
      legs.position.y = h * 0.27; g.add(legs);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, h * 0.22, 4, 10), cloth);
      torso.position.y = h * 0.62; g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.065, 16, 12), MAT.skin);
      head.position.y = h * 0.9; g.add(head);
      g.position.set(p.at.x, p.at.y, p.at.z);
      g.rotation.y = p.rotY;
      g.traverse((o) => { o.castShadow = true; });
      scene.add(g);
      continue;
    } else if (p.type === "text") {
      const c = document.createElement("canvas"); c.width = 2048; c.height = 256;
      const g = c.getContext("2d");
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = "#" + (mat.color ? mat.color.getHexString() : "ffffff");
      g.font = "bold 190px 'Segoe UI', Arial, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.direction = "rtl";
      g.fillText(p.text, c.width / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const w = p.heightM * (c.width / c.height);
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, p.heightM), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0.4, clippingPlanes: clip }));
      mesh.position.set(p.at.x, p.at.y, p.at.z);
      mesh.rotation.y = Math.atan2(p.facing.x, p.facing.z);
    }
    if (!mesh) continue;
    // The walls stop at the roof's top face; grey over them, they showed through in streaks.
    if (mat === MAT.roofing) mesh.position.y += 0.02;
    mesh.castShadow = p.material !== "glass" && p.material !== "railGlass" && p.material !== "stairShade";
    mesh.receiveShadow = true;
    if (p.material === "glass" || p.material === "railGlass" || p.material === "stairShade") mesh.renderOrder = 2;
    scene.add(mesh);
  }

  // The hills round the site, to the horizon, fading into haze.
  if (P.camera.cutAboveM == null && !P.camera.studio) {
    const far = new THREE.Mesh(new THREE.CircleGeometry(2500, 64), MAT.soilFar);
    far.rotation.x = -Math.PI / 2; far.position.set(cx, -3, cz); far.receiveShadow = true;
    scene.add(far);
    scene.fog = new THREE.Fog(0xb9d3ec, 220, 1600);
  }

  // Where a vertical section cuts, the cut is drawn solid — poche — as an
  // architect draws it: the ground in earth, the existing building in stone.
  // Without it a cut prism shows its hollow inside, and the finishing model
  // furnished the kindergarten with rooms nobody drew.
  if (sec) {
    const along = sec.axis === "x" ? "z" : "x";
    const eps = -sec.keep * 0.004;
    const put = (pts2) => {
      // pts2: [u, y] with u along the plane.
      const contour = pts2.map(([u, y]) => new THREE.Vector2(u, y));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const pos = [];
      for (const [u, y] of pts2) {
        if (sec.axis === "x") pos.push(sec.at + eps, y, u);
        else pos.push(u, y, sec.at + eps);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(tris.flat());
      g.computeVertexNormals();
      return g;
    };
    const earth = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1, side: THREE.DoubleSide });
    const poche = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.9, side: THREE.DoubleSide });
    const cut = new THREE.MeshStandardMaterial({ color: 0x34333a, roughness: 0.9, side: THREE.DoubleSide });
    const CAPPED = new Set(["plaster", "stone", "stoneDeep", "stoneDark", "render", "concrete", "existing", "slab"]);
    for (const p of M.primitives) {
      if (hidden(p.tag)) continue;
      if (p.type === "terrain") {
        // A section cuts the ground where it cuts; an elevation shows the
        // ground line along the face — the lowest ground in the 25 m behind
        // the plane, where the building stands, not the slope in front.
        const band = P.camera.interior ? 0 : Math.round((P.camera.groundBand ?? 25) / p.dx);
        const prof = [];
        if (sec.axis === "x") {
          const i0 = Math.round((sec.at - p.x0) / p.dx);
          if (i0 < 0 || i0 >= p.nx) continue;
          for (let j = 0; j < p.nz; j++) {
            let h = Infinity;
            for (let d = 0; d <= band; d++) {
              const i = i0 + sec.keep * d;
              if (i >= 0 && i < p.nx) h = Math.min(h, p.heights[j * p.nx + i]);
            }
            prof.push([p.z0 + j * p.dx, h]);
          }
        } else {
          const j0 = Math.round((sec.at - p.z0) / p.dx);
          if (j0 < 0 || j0 >= p.nz) continue;
          for (let i = 0; i < p.nx; i++) {
            let h = Infinity;
            for (let d = 0; d <= band; d++) {
              const j = j0 + sec.keep * d;
              if (j >= 0 && j < p.nz) h = Math.min(h, p.heights[j * p.nx + i]);
            }
            prof.push([p.x0 + i * p.dx, h]);
          }
        }
        const bottom = Math.min(...prof.map(([, h]) => h)) - 14;
        const pts2 = [...prof, [prof[prof.length - 1][0], bottom], [prof[0][0], bottom]];
        scene.add(new THREE.Mesh(put(pts2.reverse()), earth));
      } else if (p.type === "prism" && p.tag && (p.tag.startsWith("kindergarten") || p.tag.startsWith("site:") || p.tag.startsWith("yard:"))) {
        const hits = [];
        const r = p.ring;
        for (let k = 0; k < r.length; k++) {
          const [ax, az] = r[k], [bx, bz] = r[(k + 1) % r.length];
          const [a, b, ua, ub] = sec.axis === "x" ? [ax, bx, az, bz] : [az, bz, ax, bx];
          if ((a - sec.at) * (b - sec.at) < 0) hits.push(ua + ((sec.at - a) / (b - a)) * (ub - ua));
        }
        if (hits.length < 2) continue;
        const u0 = Math.min(...hits), u1 = Math.max(...hits);
        const mat = p.tag.startsWith("kindergarten") ? poche : earth;
        scene.add(new THREE.Mesh(put([[u0, p.y0], [u1, p.y0], [u1, p.y1], [u0, p.y1]]), mat));
      } else if (p.type === "prism" && p.tag && /^(floor-\d|roof)/.test(p.tag) && p.material === "slab") {
        // The centre's own slabs, cut: solid charcoal.
        const hits = [];
        const r = p.ring;
        for (let k = 0; k < r.length; k++) {
          const [ax, az] = r[k], [bx, bz] = r[(k + 1) % r.length];
          const [a, b, ua, ub] = sec.axis === "x" ? [ax, bx, az, bz] : [az, bz, ax, bx];
          if ((a - sec.at) * (b - sec.at) < 0) hits.push(ua + ((sec.at - a) / (b - a)) * (ub - ua));
        }
        if (hits.length < 2) continue;
        hits.sort((a, b) => a - b);
        for (let h = 0; h + 1 < hits.length; h += 2) scene.add(new THREE.Mesh(put([[hits[h], p.y0], [hits[h + 1], p.y0], [hits[h + 1], p.y1], [hits[h], p.y1]]), cut));
      } else if (p.type === "box" && p.tag && !p.tag.includes(":inside:") && CAPPED.has(p.material) && (/^(floor-\d|roof|kindergarten)/.test(p.tag) || p.tag === "floor-1" || p.tag === "floor-2")) {
        // A wall or a slab the plane passes through: its section solid.
        const c = sec.axis === "x" ? p.centre.x : p.centre.z;
        const half = (sec.axis === "x" ? p.size.x : p.size.z) / 2;
        if (Math.abs(c - sec.at) >= half || p.rotY) continue;
        const u = sec.axis === "x" ? p.centre.z : p.centre.x;
        const hu = (sec.axis === "x" ? p.size.z : p.size.x) / 2;
        const y0 = p.centre.y - p.size.y / 2, y1 = p.centre.y + p.size.y / 2;
        scene.add(new THREE.Mesh(put([[u - hu, y0], [u + hu, y0], [u + hu, y1], [u - hu, y1]]), p.tag.startsWith("kindergarten") ? poche : cut));
      }
    }
  }

  // A house's elevation is cut at its plot's edge (dwf-views): the ground
  // along the cut is one profile — the top of whatever of the yard the plane
  // passes through, its paving, its sunk bays and its terraces — and solid
  // earth under it to the frame's foot, in front of all the cut slabs' hollow
  // insides, as the architect's elevation draws its ground.
  if (sec && P.camera.hideBefore) {
    const along = (pt) => (sec.axis === "x" ? pt[1] : pt[0]);
    const across = (pt) => (sec.axis === "x" ? pt[0] : pt[1]);
    const spans = [];
    for (const p of M.primitives) {
      if (p.type !== "prism" || !p.tag || !p.tag.startsWith("yard:") || hidden(p.tag)) continue;
      const r = p.ring;
      const hits = [];
      for (let k = 0; k < r.length; k++) {
        const a = r[k], b = r[(k + 1) % r.length];
        const [ca, cb] = [across(a), across(b)];
        if ((ca - sec.at) * (cb - sec.at) < 0) hits.push(along(a) + ((sec.at - ca) / (cb - ca)) * (along(b) - along(a)));
      }
      if (hits.length >= 2) spans.push({ u0: Math.min(...hits), u1: Math.max(...hits), top: p.y1 });
    }
    if (spans.length) {
      const u0 = Math.min(...spans.map((q) => q.u0)) - 30;
      const u1 = Math.max(...spans.map((q) => q.u1)) + 30;
      const lowest = Math.min(...spans.map((q) => q.top));
      const prof = [];
      for (let u = u0; u <= u1 + 1e-6; u += 0.05) {
        const over = spans.filter((q) => u >= q.u0 && u <= q.u1);
        prof.push([u, over.length ? Math.max(...over.map((q) => q.top)) : lowest]);
      }
      const bottom = lowest - 30;
      const pts2 = [...prof, [u1, bottom], [u0, bottom]];
      const soilFace = new THREE.MeshStandardMaterial({ color: 0x6b5843, roughness: 1, side: THREE.DoubleSide });
      const eps2 = -sec.keep * 0.02;
      const pos = [];
      for (const [u, y] of pts2) {
        if (sec.axis === "x") pos.push(sec.at + eps2, y, u);
        else pos.push(u, y, sec.at + eps2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(THREE.ShapeUtils.triangulateShape(pts2.map(([u, y]) => new THREE.Vector2(u, y)), []).flat());
      g.computeVertexNormals();
      scene.add(new THREE.Mesh(g, soilFace));
    }
  }

  const cam = P.camera.orthoHalfWidth
    ? new THREE.OrthographicCamera(-P.camera.orthoHalfWidth, P.camera.orthoHalfWidth, (P.camera.orthoHalfWidth * P.height) / P.width, (-P.camera.orthoHalfWidth * P.height) / P.width, 0.1, 6000)
    : new THREE.PerspectiveCamera(P.camera.fovDeg, P.width / P.height, 0.1, 6000);
  if (P.camera.up) cam.up.set(P.camera.up.x, P.camera.up.y, P.camera.up.z);
  cam.position.set(P.camera.position.x, P.camera.position.y, P.camera.position.z);
  cam.lookAt(P.camera.target.x, P.camera.target.y, P.camera.target.z);

  if (P.camera.mask) {
    const ink = new THREE.MeshBasicMaterial({ color: 0x000000 });
    scene.traverse((o) => { if (o.isMesh) o.material = ink; });
    scene.remove(sky);
    scene.fog = null;
    scene.background = new THREE.Color(0xffffff);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, cam);
    window.__renderDone = true;
    return;
  }

  if (P.pathTrace && P.camera.cutAboveM == null && !P.camera.section) {
    await traceFrame(renderer, scene, cam, sky, sunDir, P);
    window.__renderDone = true;
    return;
  }

  const composer = new EffectComposer(renderer);
  composer.setSize(P.width, P.height);
  composer.addPass(new RenderPass(scene, cam));
  if (P.ao) {
    const ao = new GTAOPass(scene, cam, P.width, P.height);
    // House plan: very light contact AO — heavier washed walls grey (13/10/2026).
    ao.updateGtaoMaterial({ radius: housePlan ? 0.4 : 0.9, distanceExponent: 1.4, thickness: housePlan ? 0.65 : 1.2, scale: 1.0, samples: housePlan ? 10 : 16 });
    ao.blendIntensity = housePlan ? 0.32 : 0.85;
    composer.addPass(ao);
  }
  composer.addPass(new OutputPass());
  composer.addPass(new SMAAPass(P.width, P.height));
  composer.render();
  window.__renderDone = true;
}
/**
 * The frame path-traced. The tracer draws only what has a standard material,
 * so the shader sky goes and an equirectangular one of the same sun comes in
 * its place — a gradient from zenith to a hazed horizon, and the sun itself,
 * bright past white — as background and light both. The fog goes: the
 * tracer's own air is the sky's light.
 */
async function traceFrame(renderer, scene, cam, sky, sunDir, P) {
  const { WebGLPathTracer } = await import("three-gpu-pathtracer");
  scene.remove(sky);
  scene.fog = null;
  const W = 1024, H = 512;
  const data = new Float32Array(W * H * 4);
  const zen = [0.12, 0.32, 0.86], hor = [0.5, 0.7, 0.95], gnd = [0.42, 0.4, 0.37];
  // A DataTexture's first row is the BOTTOM of the picture (v = 0): written from the zenith down, the sky was upside
  // down and the horizon's haze stood where the ground is — the grey every traced sky came out. And three reads an
  // equirectangular direction as u = atan2(z, x) / 2π + ½, so the sun's glow is set by that, not by u alone.
  for (let y = 0; y < H; y++) {
    const el = -Math.PI / 2 + (y / (H - 1)) * Math.PI;
    for (let x = 0; x < W; x++) {
      const az = (x / W - 0.5) * Math.PI * 2;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      let c;
      if (el >= 0) {
        const t = Math.pow(1 - el / (Math.PI / 2), 3);
        c = zen.map((z, i) => z + (hor[i] - z) * t);
      } else c = gnd;
      const cosS = d[0] * sunDir.x + d[1] * sunDir.y + d[2] * sunDir.z;
      const glow = Math.pow(Math.max(0, cosS), 64) * 2.5 + (cosS > 0.9995 ? 60 : 0);
      const i = (y * W + x) * 4;
      data[i] = (c[0] * 0.55 + glow); data[i + 1] = (c[1] * 0.55 + glow * 0.95); data[i + 2] = (c[2] * 0.55 + glow * 0.85); data[i + 3] = 1;
    }
  }
  const env = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.needsUpdate = true;
  scene.background = env;
  scene.environment = env;
  // A room's windows look out on a bright day: the sky that lights and shows through them is brighter than the sky an outside view is lit by.
  scene.environmentIntensity = P.camera.interior === true ? 1.1 : 1;
  scene.backgroundIntensity = P.camera.interior === true ? 2.2 : 1;
  // Traced, the light is what reaches the face — no ambient fill the
  // rasteriser adds — so the exposure the plates were set at reads dark.
  renderer.toneMappingExposure = P.exposure * (P.camera.interior === true ? 1.1 : 1.6);
  const tracer = new WebGLPathTracer(renderer);
  tracer.tiles.set(2, 2);
  tracer.filterGlossyFactor = 0.5;
  tracer.setScene(scene, cam);
  const samples = P.pathTrace.samples;
  for (let i = 0; i < samples; i++) {
    tracer.renderSample();
    if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
  }
}

main().catch((e) => { window.__renderError = String(e && e.stack || e); });
`;
