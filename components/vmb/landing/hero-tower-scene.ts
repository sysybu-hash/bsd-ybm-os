import type * as Three from "three";

/**
 * The landing hero's scene: a drawing on a blue sheet that rises into a tower, takes its materials, grows a city round
 * it and lights up at dusk. One number drives it all (`progress`, 0..1), so the timeline and the visitor's slider show
 * the same thing. An illustration, built from nothing but boxes and lines: no client's project, no downloaded model.
 */

export type HeroScene = { update(progress: number, seconds: number): void; resize(width: number, height: number): void; dispose(): void; /** Metres of tower standing at this progress. */ heightAt(progress: number): number };

const FLOORS = 40;
const FLOOR_H = 3.4;
const TOWER = { w: 26, d: 20, h: FLOORS * FLOOR_H };
const BLOCK = 46;
const ROAD = 14;

/** 0 before `a`, 1 after `b`, eased between. */
export const stage = (p: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The stages on the one timeline: the sheet, the lines rising, the materials, the city, the dusk. */
export const STAGES = { rise: [0.14, 0.42], fill: [0.4, 0.62], city: [0.58, 0.84], dusk: [0.8, 1] } as const;

/** A seeded generator, so the city is the same on every visit. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** The tower's lines, bottom to top: every floor's ring, then the mullions, so a draw range makes it rise. */
function towerLines(): Float32Array {
  const { w, d } = TOWER;
  const x = w / 2;
  const z = d / 2;
  const out: number[] = [];
  const ring = (y: number) => out.push(-x, y, -z, x, y, -z, x, y, -z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, y, -z);
  for (let f = 0; f <= FLOORS; f++) {
    const y = f * FLOOR_H;
    ring(y);
    if (f === FLOORS) break;
    for (let i = 0; i <= 6; i++) {
      const px = -x + (w * i) / 6;
      out.push(px, y, z, px, y + FLOOR_H, z, px, y, -z, px, y + FLOOR_H, -z);
    }
    for (let i = 1; i < 5; i++) {
      const pz = -z + (d * i) / 5;
      out.push(x, y, pz, x, y + FLOOR_H, pz, -x, y, pz, -x, y + FLOOR_H, pz);
    }
  }
  return new Float32Array(out);
}

/** The site plan's lines on the sheet: the plot, the streets' kerbs and the neighbours' footprints. */
function siteLines(lots: Array<{ x: number; z: number; w: number; d: number }>): Float32Array {
  const out: number[] = [];
  const rect = (cx: number, cz: number, w: number, d: number) => {
    const x = w / 2;
    const z = d / 2;
    out.push(cx - x, 0, cz - z, cx + x, 0, cz - z, cx + x, 0, cz - z, cx + x, 0, cz + z, cx + x, 0, cz + z, cx - x, 0, cz + z, cx - x, 0, cz + z, cx - x, 0, cz - z);
  };
  rect(0, 0, TOWER.w, TOWER.d);
  rect(0, 0, BLOCK, BLOCK);
  for (const l of lots) rect(l.x, l.z, l.w, l.d);
  for (let i = -3; i <= 3; i++) {
    const c = i * (BLOCK + ROAD) + (BLOCK + ROAD) / 2;
    for (const s of [-ROAD / 2, ROAD / 2]) out.push(c + s, 0, -260, c + s, 0, 260, -260, 0, c + s, 260, 0, c + s);
  }
  return new Float32Array(out);
}

/** A facade of windows: the colour map (glass in a stone frame) and the lights that come on at dusk. */
function facadeTextures(T: typeof Three, rnd: () => number) {
  const make = (lit: boolean) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 1024;
    const g = c.getContext("2d")!;
    g.fillStyle = lit ? "#000" : "#e2dccf";
    g.fillRect(0, 0, c.width, c.height);
    const cols = 8;
    const cw = c.width / cols;
    const rh = c.height / FLOORS;
    for (let r = 0; r < FLOORS; r++) {
      for (let k = 0; k < cols; k++) {
        const on = rnd() < 0.42;
        g.fillStyle = lit ? (on ? (rnd() < 0.7 ? "#ffd9a0" : "#cfe6ff") : "#05070a") : "#6f93b8";
        g.fillRect(k * cw + 4, r * rh + 5, cw - 8, rh - 9);
      }
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  };
  return { map: make(false), lights: make(true) };
}

export function createHeroScene(T: typeof Three, canvas: HTMLCanvasElement): HeroScene {
  const rnd = seeded(7);
  // In a right-to-left page the headline is on the right, so the tower goes left; the other way round otherwise.
  const side = getComputedStyle(canvas).direction === "rtl" ? 1 : -1;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.localClippingEnabled = true;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const scene = new T.Scene();
  const fog = new T.Fog(0x0a2a52, 260, 760);
  scene.fog = fog;
  const camera = new T.PerspectiveCamera(38, 1, 1, 2000);

  const hemi = new T.HemisphereLight(0xdfeaff, 0x5a564e, 2.4);
  const sun = new T.DirectionalLight(0xfff1dc, 3.4);
  sun.position.set(-160, 220, 120);
  scene.add(hemi, sun);

  // The sheet: a grid, and the plan's lines on it.
  const grid = new T.GridHelper(900, 90, 0x8cc8ff, 0x8cc8ff);
  const gridMat = grid.material as Three.Material;
  gridMat.transparent = true;
  gridMat.depthWrite = false;
  scene.add(grid);

  // The neighbours, seeded: a lot per block side, none on the tower's own block.
  const lots: Array<{ x: number; z: number; w: number; d: number; h: number; delay: number }> = [];
  for (let bx = -3; bx <= 3; bx++) {
    for (let bz = -3; bz <= 3; bz++) {
      if (bx === 0 && bz === 0) continue;
      const cx = bx * (BLOCK + ROAD);
      const cz = bz * (BLOCK + ROAD);
      const far = Math.hypot(bx, bz);
      for (let k = 0; k < 2; k++) {
        const w = 14 + rnd() * 12;
        const d = 14 + rnd() * 10;
        lots.push({ x: cx + (k ? 11 : -11) + (rnd() - 0.5) * 4, z: cz + (rnd() - 0.5) * 16, w, d, h: 14 + rnd() * (far < 2 ? 60 : 34), delay: Math.min(0.7, far * 0.12 + rnd() * 0.15) });
      }
    }
  }

  const lineMat = (opacity: number) => new T.LineBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity, depthWrite: false });
  const siteGeo = new T.BufferGeometry();
  siteGeo.setAttribute("position", new T.BufferAttribute(siteLines(lots), 3));
  const site = new T.LineSegments(siteGeo, lineMat(0.9));
  site.position.y = 0.05;
  const wireGeo = new T.BufferGeometry();
  wireGeo.setAttribute("position", new T.BufferAttribute(towerLines(), 3));
  const wire = new T.LineSegments(wireGeo, lineMat(1));
  const wireCount = wireGeo.getAttribute("position").count;
  const siteCount = siteGeo.getAttribute("position").count;
  scene.add(site, wire);

  // The tower's body, cut by a plane that rises: what is under it is built.
  const cut = new T.Plane(new T.Vector3(0, -1, 0), 0);
  const tex = facadeTextures(T, rnd);
  const towerMat = new T.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.lights, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55, metalness: 0.2, clippingPlanes: [cut] });
  const tower = new T.Mesh(new T.BoxGeometry(TOWER.w, TOWER.h, TOWER.d), towerMat);
  tower.position.y = TOWER.h / 2;
  const podiumMat = new T.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.9, clippingPlanes: [cut] });
  const podium = new T.Mesh(new T.BoxGeometry(TOWER.w + 12, 9, TOWER.d + 12), podiumMat);
  podium.position.y = 4.5;
  scene.add(tower, podium);

  // The ground of the built city: asphalt, with the blocks' pavements on it.
  const groundMat = new T.MeshStandardMaterial({ color: 0x23262b, roughness: 1, transparent: true, opacity: 0 });
  const ground = new T.Mesh(new T.PlaneGeometry(1400, 1400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  const paveMat = new T.MeshStandardMaterial({ color: 0x8e8a82, roughness: 1, transparent: true, opacity: 0 });
  const pave = new T.InstancedMesh(new T.BoxGeometry(BLOCK, 0.3, BLOCK), paveMat, 49);
  const m = new T.Matrix4();
  let pi = 0;
  for (let bx = -3; bx <= 3; bx++) for (let bz = -3; bz <= 3; bz++) pave.setMatrixAt(pi++, m.makeTranslation(bx * (BLOCK + ROAD), 0.1, bz * (BLOCK + ROAD)));
  scene.add(ground, pave);

  const cityTex = facadeTextures(T, rnd);
  const cityMat = new T.MeshStandardMaterial({ map: cityTex.map, emissiveMap: cityTex.lights, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
  const city = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), cityMat, lots.length);
  scene.add(city);

  // Trees along the tower's block, and the street lamps' glow.
  const treeSpots: Array<[number, number]> = [];
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) treeSpots.push([i * 7, s * (BLOCK / 2 - 3)], [s * (BLOCK / 2 - 3), i * 7]);
  const trees = new T.InstancedMesh(new T.IcosahedronGeometry(2.6, 1), new T.MeshStandardMaterial({ color: 0x4f7a43, roughness: 1 }), treeSpots.length);
  scene.add(trees);
  const lampPos: number[] = [];
  for (let i = -6; i <= 6; i++) for (let j = -3; j <= 3; j++) lampPos.push(i * 30, 6, j * (BLOCK + ROAD) + (BLOCK + ROAD) / 2, j * (BLOCK + ROAD) + (BLOCK + ROAD) / 2, 6, i * 30);
  const lampGeo = new T.BufferGeometry();
  lampGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(lampPos), 3));
  const lampMat = new T.PointsMaterial({ color: 0xffc98a, size: 5, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
  scene.add(new T.Points(lampGeo, lampMat));

  // Cars: headlights along the two streets by the tower.
  const carMat = new T.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0 });
  const cars = new T.InstancedMesh(new T.BoxGeometry(4.2, 1.2, 1.8), carMat, 10);
  scene.add(cars);

  const day = new T.Color(0xfff1dc);
  const dusk = new T.Color(0xff9a5c);
  const sheetFog = new T.Color(0x0a2a52);
  const duskFog = new T.Color(0x2a2140);
  const dayFog = new T.Color(0x9fb8d6);
  const one = new T.Vector3(1, 1, 1);
  const q = new T.Quaternion();
  const v = new T.Vector3();
  const s = new T.Vector3();

  const heightAt = (p: number) => TOWER.h * stage(p, STAGES.rise[0], STAGES.rise[1]);

  return {
    heightAt,
    update(p, seconds) {
      const rise = stage(p, STAGES.rise[0], STAGES.rise[1]);
      const fill = stage(p, STAGES.fill[0], STAGES.fill[1]);
      const grow = stage(p, STAGES.city[0], STAGES.city[1]);
      const night = stage(p, STAGES.dusk[0], STAGES.dusk[1]);

      siteGeo.setDrawRange(0, Math.floor((siteCount * stage(p, 0, 0.16)) / 2) * 2);
      wireGeo.setDrawRange(0, Math.floor((wireCount * rise) / 2) * 2);
      (wire.material as Three.LineBasicMaterial).opacity = 1 - fill * 0.8;
      (site.material as Three.LineBasicMaterial).opacity = 0.9 * (1 - grow);
      gridMat.opacity = 0.5 * (1 - grow * 0.95);

      cut.constant = fill * (TOWER.h + 0.5);
      tower.visible = podium.visible = fill > 0;
      towerMat.emissiveIntensity = night * 1.5;
      cityMat.emissiveIntensity = night * 1.2;

      groundMat.opacity = paveMat.opacity = grow;
      for (const [i, l] of lots.entries()) {
        const h = Math.max(0.001, l.h * stage(grow, l.delay, Math.min(1, l.delay + 0.3)));
        city.setMatrixAt(i, m.compose(v.set(l.x, h / 2, l.z), q, s.set(l.w, h, l.d)));
      }
      city.instanceMatrix.needsUpdate = true;
      city.visible = grow > 0;
      const tr = stage(grow, 0.5, 1);
      for (const [i, t] of treeSpots.entries()) trees.setMatrixAt(i, m.compose(v.set(t[0], 0.3 + 3.4 * tr, t[1]), q, s.copy(one).multiplyScalar(Math.max(0.001, tr))));
      trees.instanceMatrix.needsUpdate = true;
      trees.visible = tr > 0;

      lampMat.opacity = night;
      carMat.opacity = Math.max(night, grow * 0.5) * (grow > 0.6 ? 1 : 0);
      const lane = (BLOCK + ROAD) / 2;
      for (let i = 0; i < 10; i++) {
        const along = ((seconds * (14 + (i % 3) * 5) + i * 97) % 520) - 260;
        const side = i % 2 ? 1 : -1;
        if (i < 5) cars.setMatrixAt(i, m.makeTranslation(along * side, 0.9, side * lane + side * 3));
        else cars.setMatrixAt(i, m.makeRotationY(Math.PI / 2).setPosition(side * lane + side * 3, 0.9, along * side));
      }
      cars.instanceMatrix.needsUpdate = true;

      sun.color.copy(day).lerp(dusk, night);
      sun.intensity = 3.4 - night * 2.3;
      hemi.intensity = 2.4 - night * 1.5;
      fog.color.copy(sheetFog).lerp(dayFog, grow).lerp(duskFog, night);

      // The camera: over the sheet at first, then down and round the tower, slowly.
      const tilt = stage(p, 0.1, 0.5);
      const angle = -0.75 + seconds * 0.035 + p * 0.5;
      const dist = 300 + tilt * 40;
      const elev = 1.35 - tilt * 1.1;
      camera.position.set(Math.sin(angle) * Math.cos(elev) * dist, Math.sin(elev) * dist + 10, Math.cos(angle) * Math.cos(elev) * dist);
      camera.lookAt(0, 20 + tilt * 50, 0);
      renderer.render(scene, camera);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      // A phone's tall frame needs a wider lens to hold the tower.
      camera.fov = camera.aspect < 0.8 ? 58 : 38;
      // On a wide frame the headline stands on one side: the tower moves to the other (the page's inline end).
      if (camera.aspect > 1.2) camera.setViewOffset(width, height, width * 0.2 * side, 0, width, height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    dispose() {
      scene.traverse((o) => {
        const mesh = o as Three.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const mat of mats) mat.dispose();
      });
      for (const t of [tex.map, tex.lights, cityTex.map, cityTex.lights]) t.dispose();
      renderer.dispose();
    },
  };
}
