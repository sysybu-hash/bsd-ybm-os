import { THREE_MODULE_URL } from "@/lib/projects/scene3d/chromium-page";
import type { RenderPayload } from "@/lib/projects/scene3d/render-payload";

/**
 * The page that draws one frame.
 *
 * It is as stupid as it can be on purpose: a box per mesh, a material per
 * spec, a light per light, one camera, one render, and a flag to say it is
 * done. Every decision was taken on the server, so there is nothing here that
 * could be decided differently than the viewer decides it — and nothing here
 * that needs a bundler, a dependency or a network.
 *
 * Math.random is replaced before anything runs. Nothing in the page should
 * reach for it; if something ever does, it will at least do so identically on
 * every render.
 */
export function renderPageHtml(payload: RenderPayload): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}canvas{display:block}</style></head>
<body>
<script>
(function () {
  var seed = 0x2f6e2b1;
  Math.random = function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
})();
window.addEventListener("error", function (e) { window.__renderError = String(e.message); });
</script>
<script type="module">
import * as THREE from "${THREE_MODULE_URL}";

const P = ${JSON.stringify(payload)};

try {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(P.width, P.height, false);
  renderer.shadowMap.enabled = P.sun.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.background);

  const materials = {};
  for (const id of Object.keys(P.materials)) {
    const spec = P.materials[id];
    materials[id] = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      transparent: spec.opacity != null,
      opacity: spec.opacity == null ? 1 : spec.opacity,
    });
  }

  // One geometry per material, so a flat of a few thousand boxes is a handful
  // of draw calls. A software rasteriser cannot afford anything else.
  const byMaterial = new Map();
  for (const mesh of P.meshes) {
    const key = mesh.m + (mesh.sh ? "|s" : "");
    let list = byMaterial.get(key);
    if (!list) { list = { id: mesh.m, shadow: mesh.sh, boxes: [] }; byMaterial.set(key, list); }
    list.boxes.push(mesh);
  }
  for (const group of byMaterial.values()) {
    const geometries = [];
    for (const box of group.boxes) {
      const geo = new THREE.BoxGeometry(box.s[0], box.s[1], box.s[2]);
      geo.translate(box.c[0], box.c[1], box.c[2]);
      geometries.push(geo.toNonIndexed());
    }
    let total = 0;
    for (const geo of geometries) total += geo.getAttribute("position").count;
    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    let at = 0;
    for (const geo of geometries) {
      const p = geo.getAttribute("position");
      const n = geo.getAttribute("normal");
      for (let i = 0; i < p.count; i++) {
        position[(at + i) * 3] = p.getX(i);
        position[(at + i) * 3 + 1] = p.getY(i);
        position[(at + i) * 3 + 2] = p.getZ(i);
        normal[(at + i) * 3] = n.getX(i);
        normal[(at + i) * 3 + 1] = n.getY(i);
        normal[(at + i) * 3 + 2] = n.getZ(i);
      }
      at += p.count;
      geo.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, materials[group.id] || materials.neutral);
    mesh.castShadow = group.shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const sun = new THREE.DirectionalLight(P.sun.colour, P.sun.intensity);
  sun.position.set(
    P.sun.direction[0] * P.sun.distance,
    P.sun.direction[1] * P.sun.distance,
    P.sun.direction[2] * P.sun.distance,
  );
  sun.castShadow = P.sun.shadows;
  if (P.sun.shadows) {
    sun.shadow.mapSize.set(P.sun.mapSize, P.sun.mapSize);
    const cam = sun.shadow.camera;
    cam.left = -P.sun.span; cam.right = P.sun.span;
    cam.top = P.sun.span; cam.bottom = -P.sun.span;
    cam.near = 0.5; cam.far = P.sun.span * 4;
    sun.shadow.normalBias = 0.02;
    cam.updateProjectionMatrix();
  }
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(P.sky.colour, P.sky.ground, P.sky.intensity));

  for (const light of P.lights) {
    const point = new THREE.PointLight(light.colour, light.intensity, light.distance, 2);
    point.position.set(light.p[0], light.p[1], light.p[2]);
    scene.add(point);
  }

  const rig = P.camera;
  const aspect = P.width / P.height;
  const camera = rig.kind === "orthographic"
    ? new THREE.OrthographicCamera(-rig.halfWidth, rig.halfWidth, rig.halfHeight, -rig.halfHeight, rig.near, rig.far)
    : new THREE.PerspectiveCamera(rig.fovDeg, aspect, rig.near, rig.far);
  camera.position.set(rig.position.x, rig.position.y, rig.position.z);
  camera.up.set(rig.up.x, rig.up.y, rig.up.z);
  camera.lookAt(rig.target.x, rig.target.y, rig.target.z);

  renderer.render(scene, camera);
  renderer.getContext().finish();
  window.__renderDone = true;
} catch (err) {
  window.__renderError = err && err.message ? err.message : String(err);
}
</script>
</body></html>`;
}
