import { THREE_MODULE_URL } from "@/lib/projects/scene3d/chromium-page";

/**
 * The P0 spike page: does WebGL work at all in a Vercel function, and how long
 * does a frame the size of a real sales still take?
 *
 * The scene is not a triangle. A triangle would prove a GL context exists and
 * nothing about whether this is usable: the real workload is a few hundred
 * boxes, a shadow-casting sun, tone mapping and a 4000 px canvas, and the cost
 * lives in the shadow pass and the fill rate, not in the mesh count. So the
 * spike draws that, and the number it reports is the number that decides
 * whether the server-side renderer is real.
 */
export function spikeHtml(options: { width: number; height: number; shadows: boolean; boxes: number }): string {
  const config = JSON.stringify(options);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111}canvas{display:block}</style></head>
<body>
<script type="module">
import * as THREE from "${THREE_MODULE_URL}";

const cfg = ${config};
const t0 = performance.now();

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(cfg.width, cfg.height, false);
renderer.shadowMap.enabled = cfg.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e2d6);

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(24, 0.04, 16),
  new THREE.MeshStandardMaterial({ color: 0xcbb193, roughness: 0.85 }),
);
floor.receiveShadow = true;
scene.add(floor);

// A deterministic spread of boxes standing in for walls and furniture.
const wall = new THREE.MeshStandardMaterial({ color: 0xf1e9dd, roughness: 0.9 });
const wood = new THREE.MeshStandardMaterial({ color: 0x9c6b4a, roughness: 0.6 });
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < cfg.boxes; i++) {
  const tall = i % 3 === 0;
  const geo = new THREE.BoxGeometry(
    tall ? 0.18 : 0.4 + rnd() * 1.4,
    tall ? 2.7 : 0.4 + rnd() * 0.6,
    tall ? 1.2 + rnd() * 3 : 0.4 + rnd() * 1.6,
  );
  const mesh = new THREE.Mesh(geo, tall ? wall : wood);
  mesh.position.set((rnd() - 0.5) * 22, tall ? 1.35 : 0.3, (rnd() - 0.5) * 14);
  mesh.castShadow = cfg.shadows;
  mesh.receiveShadow = cfg.shadows;
  scene.add(mesh);
}

const sun = new THREE.DirectionalLight(0xffe9c9, 2.4);
sun.position.set(14, 18, 10);
sun.castShadow = cfg.shadows;
if (cfg.shadows) {
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -16; c.right = 16; c.top = 12; c.bottom = -12; c.near = 1; c.far = 60;
  c.updateProjectionMatrix();
}
scene.add(sun, new THREE.HemisphereLight(0xfff2e0, 0x8a7f6d, 0.9));

const camera = new THREE.PerspectiveCamera(30, cfg.width / cfg.height, 0.5, 200);
camera.position.set(16, 26, 20);
camera.lookAt(0, 0, 0);

const built = performance.now();
renderer.render(scene, camera);
renderer.getContext().finish();
const drawn = performance.now();

const gl = renderer.getContext();
window.__spike = {
  ok: true,
  vendor: gl.getParameter(gl.VENDOR),
  renderer: gl.getParameter(gl.RENDERER),
  version: gl.getParameter(gl.VERSION),
  buildMs: Math.round(built - t0),
  drawMs: Math.round(drawn - built),
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
};
</script>
<script>
window.addEventListener("error", (e) => {
  window.__spike = { ok: false, error: String(e.message) };
});
</script>
</body></html>`;
}
