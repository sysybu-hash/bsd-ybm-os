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
  /** Standing inside: lit by the rooms' own light, not the open sky. */
  interior?: boolean;
  /** Parallel projection, as an elevation is drawn: half the frame's width in metres. */
  orthoHalfWidth?: number;
  /** For an elevation: metres behind the face the ground line is the lowest of (25 by default; 0 cuts at the face). */
  groundBand?: number;
  /** The camera's up vector; a plan seen from above has north, -z, up. */
  up?: { x: number; y: number; z: number };
  /** A vertical section: everything on the far side of the plane x (or z) = at is kept, the near side cut away. */
  section?: { axis: "x" | "z"; at: number; keep: 1 | -1 };
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
};

export const BUILDING_ORIGIN = "https://building3d.local";

export function buildingPageHtml(payload: BuildingRenderPayload): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#fff}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"${BUILDING_ORIGIN}/three/three.module.js","three/addons/":"${BUILDING_ORIGIN}/jsm/"}}</script>
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
  scene.environmentIntensity = inside ? 0.38 : P.camera.cutAboveM != null ? 0.55 : 0.45;

  const M = P.model;
  const ext = M.extent;
  const cx = ext.x + ext.width / 2, cz = ext.z + ext.depth / 2;
  const span = Math.max(ext.width, ext.depth);

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.1);
  sun.position.set(cx + sunDir.x * span * 1.5, sunDir.y * span * 1.5, cz + sunDir.z * span * 1.5);
  sun.target.position.set(cx, 8, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -span * 0.8; sc.right = span * 0.8; sc.top = span * 0.8; sc.bottom = -span * 0.8;
  sc.near = 1; sc.far = span * 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(inside ? 0xfff3e2 : 0xdfe9f5, 0x8a7a66, inside ? 0.18 : 0.35));
  // Inside, the ceiling's panels light the room: a warm light over each.
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
  const grassTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#6f8a47"; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 16000; k++) { g.fillStyle = "rgba(" + (60 + rnd() * 60) + "," + (100 + rnd() * 70) + "," + (30 + rnd() * 30) + ",0.7)"; g.fillRect(rnd() * w, rnd() * h, 1, 2 + rnd() * 3); }
  }, 3.0);
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
  const carpetTex = plainTex("#5f6a78", 18, 1);

  const MAT = {
    stone: new THREE.MeshStandardMaterial({ map: stoneTex([0, 0, 0]), roughness: 0.86 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.62, metalness: 0.15 }),
    concrete: new THREE.MeshStandardMaterial({ map: plainTex("#b8b4ac", 16, 3), roughness: 0.92 }),
    plaster: new THREE.MeshStandardMaterial({ map: plainTex("#e9e3d8", 5, 2), roughness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x3f5560, metalness: 0.55, roughness: 0.04, transparent: true, opacity: 0.8, envMapIntensity: 1.4, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3c3f43, roughness: 0.42, metalness: 0.65 }),
    slab: new THREE.MeshStandardMaterial({ map: plainTex("#d9d5cd", 8, 3), roughness: 0.9 }),
    floorStone: new THREE.MeshStandardMaterial({ map: floorStoneTex, roughness: 0.55 }),
    floorVinyl: new THREE.MeshStandardMaterial({ map: vinylTex, roughness: 0.6 }),
    floorWood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95 }),
    parkingLine: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 }),
    paving: new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.85 }),
    grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
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
    worktop: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.35 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.2 }),
    signage: new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.3, metalness: 0.7 }),
    planter: new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.8 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x4f6b35, roughness: 0.95 }),
    foliage0: new THREE.MeshStandardMaterial({ color: 0x566f37, roughness: 0.95 }),
    foliage1: new THREE.MeshStandardMaterial({ color: 0x6a7f3e, roughness: 0.95 }),
    foliage2: new THREE.MeshStandardMaterial({ color: 0x455e30, roughness: 0.95 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xefede8, roughness: 0.95 }),
    seatFabric: new THREE.MeshStandardMaterial({ color: 0x1f5c66, roughness: 0.92 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.85 }),
    lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 }),
    carGlass: new THREE.MeshPhysicalMaterial({ color: 0x1c2328, metalness: 0.4, roughness: 0.05 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xefece6, roughness: 0.8 }),
  };
  const planes = [];
  if (P.camera.cutAboveM != null) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), P.camera.cutAboveM));
  const sec = P.camera.section;
  if (sec) {
    const n = sec.axis === "x" ? new THREE.Vector3(sec.keep, 0, 0) : new THREE.Vector3(0, 0, sec.keep);
    planes.push(new THREE.Plane(n, -sec.keep * sec.at));
  }
  const clip = planes.length ? planes : null;
  if (clip) for (const m of Object.values(MAT)) { m.clippingPlanes = clip; m.clipShadows = true; if (sec && P.camera.interior) m.side = THREE.DoubleSide; }

  // A box whose faces carry UVs in metres, so every texture keeps its scale.
  const worldBox = (sx, sy, sz, repeatM) => {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const uv = geo.attributes.uv, nrm = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const [a, b] = nx > 0.5 ? [sz, sy] : ny > 0.5 ? [sx, sz] : [sx, sy];
      uv.setXY(i, (uv.getX(i) * a) / repeatM, (uv.getY(i) * b) / repeatM);
    }
    return geo;
  };
  const repeatOf = (m) => (m.map && m.map.userData.repeatM) || 1;
  const hidden = (tag) => P.camera.hideTags && tag && P.camera.hideTags.some((h) => tag.startsWith(h));

  for (const p of M.primitives) {
    if (hidden(p.tag)) continue;
    const mat = MAT[p.material] || MAT.plaster;
    let mesh;
    if (p.type === "box") {
      mesh = new THREE.Mesh(worldBox(p.size.x, p.size.y, p.size.z, repeatOf(mat)), mat);
      mesh.position.set(p.centre.x, p.centre.y, p.centre.z);
      if (p.rotY) mesh.rotation.y = p.rotY;
    } else if (p.type === "prism") {
      const shape = new THREE.Shape(p.ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const h of p.holes || []) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.y1 - p.y0, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, p.y0, 0);
      // UVs in metres from world position, projected by each face's normal.
      const pos = geo.attributes.position, uv = geo.attributes.uv; geo.computeVertexNormals(); const nrm = geo.attributes.normal;
      const r = repeatOf(mat);
      for (let i = 0; i < uv.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const ny = Math.abs(nrm.getY(i)), nx = Math.abs(nrm.getX(i));
        uv.setXY(i, ny > 0.5 ? x / r : (nx > 0.5 ? z : x) / r, ny > 0.5 ? z / r : y / r);
      }
      mesh = new THREE.Mesh(geo, mat);
    } else if (p.type === "cylinder") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, p.height, 32), mat);
      mesh.position.set(p.centre.x, p.centre.y, p.centre.z);
    } else if (p.type === "terrain") {
      const geo = new THREE.PlaneGeometry((p.nx - 1) * p.dx, (p.nz - 1) * p.dx, p.nx - 1, p.nz - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      const r = repeatOf(mat);
      for (let j = 0; j < p.nz; j++) for (let i = 0; i < p.nx; i++) {
        const k = j * p.nx + i;
        const x = p.x0 + i * p.dx, z = p.z0 + j * p.dx;
        pos.setXYZ(k, x, p.heights[k], z);
        uv.setXY(k, x / r, z / r);
      }
      geo.computeVertexNormals();
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
        const geo = new THREE.IcosahedronGeometry(r, 3);
        const pos = geo.attributes.position;
        // Lumpy by direction, so a vertex shared by faces moves once and the
        // crown stays whole.
        const seedK = rnd() * 100;
        for (let v = 0; v < pos.count; v++) {
          const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
          const n = Math.sin((x / r) * 5.1 + seedK) * Math.sin((y / r) * 4.3 + seedK * 0.7) * Math.sin((z / r) * 5.7 + seedK * 1.3);
          const f = 0.9 + 0.16 * n;
          pos.setXYZ(v, x * f, y * f, z * f);
        }
        geo.computeVertexNormals();
        const leaf = new THREE.Mesh(geo, MAT["foliage" + (k % 3)]);
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
    } else if (p.type === "car") {
      const g = new THREE.Group();
      const paint = new THREE.MeshPhysicalMaterial({ color: p.colour, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, clippingPlanes: clip });
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.82, 0.72, 4.5, 4, 0.22), paint);
      body.position.y = 0.62; g.add(body);
      const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.62, 0.6, 2.4, 4, 0.2), MAT.carGlass);
      cabin.position.set(0, 1.18, -0.15); g.add(cabin);
      for (const [x, z] of [[-0.82, 1.45], [0.82, 1.45], [-0.82, -1.45], [0.82, -1.45]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20), MAT.tyre);
        w.rotation.z = Math.PI / 2; w.position.set(x, 0.33, z); g.add(w);
      }
      g.position.set(p.at.x, p.at.y, p.at.z);
      g.rotation.y = p.rotY;
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
    mesh.castShadow = p.material !== "glass";
    mesh.receiveShadow = true;
    if (p.material === "glass") mesh.renderOrder = 2;
    scene.add(mesh);
  }

  // The hills round the site, to the horizon, fading into haze.
  if (P.camera.cutAboveM == null) {
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
      } else if (p.type === "prism" && p.tag && (p.tag.startsWith("kindergarten") || p.tag.startsWith("site:"))) {
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
      }
    }
  }

  const cam = P.camera.orthoHalfWidth
    ? new THREE.OrthographicCamera(-P.camera.orthoHalfWidth, P.camera.orthoHalfWidth, (P.camera.orthoHalfWidth * P.height) / P.width, (-P.camera.orthoHalfWidth * P.height) / P.width, 0.1, 6000)
    : new THREE.PerspectiveCamera(P.camera.fovDeg, P.width / P.height, 0.1, 6000);
  if (P.camera.up) cam.up.set(P.camera.up.x, P.camera.up.y, P.camera.up.z);
  cam.position.set(P.camera.position.x, P.camera.position.y, P.camera.position.z);
  cam.lookAt(P.camera.target.x, P.camera.target.y, P.camera.target.z);

  const composer = new EffectComposer(renderer);
  composer.setSize(P.width, P.height);
  composer.addPass(new RenderPass(scene, cam));
  if (P.ao) {
    const ao = new GTAOPass(scene, cam, P.width, P.height);
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  }
  composer.addPass(new OutputPass());
  composer.addPass(new SMAAPass(P.width, P.height));
  composer.render();
  window.__renderDone = true;
}
main().catch((e) => { window.__renderError = String(e && e.stack || e); });
`;
