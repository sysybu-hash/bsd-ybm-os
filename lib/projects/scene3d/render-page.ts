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

  // Surfaces, drawn rather than shipped.
  //
  // A flat colour reads as a massing model however good the light is: the
  // first renders of דירה 14 came back as a beige diagram beside a photograph.
  // These are painted into a canvas here — planks with grain, tile with grout,
  // plaster with a fine tooth, fabric with a weave — from a seeded generator,
  // so there are no bytes to ship, nothing to fetch, and the same pixels every
  // render.
  const SEEDED = (function () {
    let s = 0x9e3779b9;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 0xffffffff;
    };
  })();

  function surface(kind, tint) {
    const size = 256;
    const cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    const g = cv.getContext("2d");
    g.fillStyle = tint;
    g.fillRect(0, 0, size, size);
    if (kind === "wood") {
      // Planks across the tile, with grain along each one.
      const planks = 4;
      for (let i = 0; i < planks; i++) {
        const y = (i * size) / planks;
        g.fillStyle = "rgba(0,0,0," + (0.03 + SEEDED() * 0.05).toFixed(3) + ")";
        g.fillRect(0, y, size, size / planks);
        g.strokeStyle = "rgba(0,0,0,0.16)";
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke();
        for (let k = 0; k < 14; k++) {
          const gy = y + SEEDED() * (size / planks);
          g.strokeStyle = "rgba(0,0,0," + (0.02 + SEEDED() * 0.05).toFixed(3) + ")";
          g.lineWidth = 0.6 + SEEDED();
          g.beginPath();
          g.moveTo(0, gy);
          g.bezierCurveTo(size * 0.3, gy + (SEEDED() - 0.5) * 6, size * 0.7, gy + (SEEDED() - 0.5) * 6, size, gy);
          g.stroke();
        }
      }
    } else if (kind === "tile") {
      const cells = 2;
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 2;
      for (let i = 0; i <= cells; i++) {
        const at = (i * size) / cells;
        g.beginPath(); g.moveTo(at, 0); g.lineTo(at, size); g.stroke();
        g.beginPath(); g.moveTo(0, at); g.lineTo(size, at); g.stroke();
      }
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = "rgba(0,0,0," + (SEEDED() * 0.04).toFixed(3) + ")";
        g.fillRect(SEEDED() * size, SEEDED() * size, 2, 2);
      }
    } else if (kind === "weave") {
      for (let i = 0; i < size; i += 3) {
        g.fillStyle = "rgba(0,0,0," + (0.02 + SEEDED() * 0.04).toFixed(3) + ")";
        g.fillRect(i, 0, 1.5, size);
        g.fillRect(0, i, size, 1.5);
      }
    } else {
      // Plaster: a fine tooth, nothing more.
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = "rgba(0,0,0," + (SEEDED() * 0.03).toFixed(3) + ")";
        g.fillRect(SEEDED() * size, SEEDED() * size, 1, 1);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // Which surface each material wears, and how big one tile of it is in metres.
  const SURFACE = {
    floorWood: ["wood", 1.2], timber: ["wood", 0.9], joinery: ["plaster", 1.0],
    floorTile: ["tile", 1.2], floorStone: ["tile", 1.4], worktop: ["tile", 2.0],
    wall: ["plaster", 2.0], wallCut: ["plaster", 2.0], skirting: ["plaster", 1.0],
    linen: ["weave", 0.6], upholstery: ["weave", 0.5], neutral: ["plaster", 1.0],
  };
  const textures = {};
  const materials = {};
  for (const id of Object.keys(P.materials)) {
    const spec = P.materials[id];
    const wear = SURFACE[id];
    if (wear && !textures[wear[0]]) textures[wear[0]] = surface(wear[0], "#ffffff");
    materials[id] = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      map: wear ? textures[wear[0]] : null,
      transparent: spec.opacity != null,
      opacity: spec.opacity == null ? 1 : spec.opacity,
    });
    materials[id].userData.tileM = wear ? wear[1] : 0;
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
    const uv = new Float32Array(total * 2);
    // The surface tiles by the metre, not by the box: a plank has to run the
    // length of a floor, not restart at every rectangle the region merged into.
    const material = materials[group.id] || materials.neutral;
    const tile = material.userData.tileM || 1;
    let at = 0;
    for (const geo of geometries) {
      const p = geo.getAttribute("position");
      const n = geo.getAttribute("normal");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        position[(at + i) * 3] = x;
        position[(at + i) * 3 + 1] = y;
        position[(at + i) * 3 + 2] = z;
        normal[(at + i) * 3] = n.getX(i);
        normal[(at + i) * 3 + 1] = n.getY(i);
        normal[(at + i) * 3 + 2] = n.getZ(i);
        let u = x, v = z;
        if (ny >= nx && ny >= nz) { u = x; v = z; }
        else if (nx >= nz) { u = z; v = y; }
        else { u = x; v = y; }
        uv[(at + i) * 2] = u / tile;
        uv[(at + i) * 2 + 1] = v / tile;
      }
      at += p.count;
      geo.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
    merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
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
