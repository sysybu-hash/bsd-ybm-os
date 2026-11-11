// Planting for the architect-style set: a copy of the measured model with street trees and shrubs on the bare earth.
// The drawings draw no planting; this is the client's marketing look, kept apart from the measured model.
//   npx tsx scripts/_damesek/landscape.mts <model dir> <out dir>
import fs from "node:fs";
import path from "node:path";

type Prim = { type: string; tag?: string; material?: string; ring?: number[][]; y0?: number; y1?: number; centre?: { x: number; y: number; z: number }; size?: { x: number; y: number; z: number }; side?: unknown; [k: string]: unknown };
type Terrain = { x0: number; z0: number; dx: number; nx: number; nz: number; heights: number[] };

const [dir, out] = process.argv.slice(2) as [string, string];
const model = JSON.parse(fs.readFileSync(path.join(dir, "model.json"), "utf8")) as { primitives: Prim[] };
const ter = model.primitives.find((p) => p.type === "terrain") as unknown as Terrain;
const hAt = (x: number, z: number) => {
  const i = Math.round((x - ter.x0) / ter.dx), j = Math.round((z - ter.z0) / ter.dx);
  if (i < 0 || j < 0 || i >= ter.nx || j >= ter.nz) return 0;
  return Math.max(0, ter.heights[j * ter.nx + i] ?? 0);
};
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// everything built that stands above the ground: a plant keeps its crown clear of it
const solids: Array<[number, number, number, number]> = [];
for (const p of model.primitives) {
  if (!p.tag || /^(ground|street:(road|sidewalk|lane)|site:ground|light:|tree)/.test(p.tag) || p.type === "terrain") continue;
  let b: [number, number, number, number] | null = null;
  if (p.type === "box" && p.centre && p.size) b = [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2, p.centre.z - p.size.z / 2, p.centre.z + p.size.z / 2];
  else if (p.ring && !p.side) { const xs = p.ring.map((r) => r[0]!), zs = p.ring.map((r) => r[1]!); b = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]; }
  if (b && b[1] - b[0] < 60 && b[3] - b[2] < 60) solids.push(b);
}
const clear = (x: number, z: number, r: number) => solids.every(([x0, x1, z0, z1]) => x < x0 - r || x > x1 + r || z < z0 - r || z > z1 + r);
// the building's footprint and its forecourt toward the street stay open
const BX0 = -18.5, BX1 = 10, BZ0 = -14, BZ1 = 9;
const nearBuilding = (x: number, z: number, m: number) => x > BX0 - m && x < BX1 + m && z > BZ0 - m && z < BZ1 + m;
// the street: its near kerb line runs from (-13.6,-96.4) to (19.6,39.6); the sidewalk is 3 m wide on its road side
const A = { x: -13.6, z: -96.4 }, B = { x: 19.6, z: 39.6 };
const len = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / len, uz = (B.z - A.z) / len, nx = uz, nz = -ux; // n points to the road (east)
const onStreet = (x: number, z: number) => { const v = (x - A.x) * nx + (z - A.z) * nz; return v > -0.5 && v < 21; };
// the cameras: nothing stands in a lens's face
const cams = [[21, 25], [28, -2.5], [21, -29], [-34, 27], [-4, 33], [-35, -2.5], [15, -31]];
// the straight-on facade views: no tree or cypress in the lens's cone up to the face (shrubs stay, they are below the eye)
const views = [
  { c: [31, -3.5], aim: [4, -3.5], half: 24 }, // the street front
  { c: [-4, 33], aim: [-4, 8], half: 36 }, // the seven arches' face
  { c: [-35, -2.5], aim: [-18.5, -2.5], half: 34 }, // the hill side
  { c: [15, -31], aim: [-4, -14], half: 27 }, // the face toward the neighbour, from the street corner
] as const;
const inView = (x: number, z: number) => views.some(({ c, aim, half }) => {
  const ax = aim[0] - c[0], az = aim[1] - c[1], L = Math.hypot(ax, az), dx = x - c[0], dz = z - c[1], d = Math.hypot(dx, dz);
  if (d > L + 1 || d < 0.5) return d < 0.5;
  const cos = (dx * ax + dz * az) / (d * L);
  return cos > Math.cos(((half + 4) * Math.PI) / 180);
});
const offCam = (x: number, z: number) => cams.every(([cx, cz]) => Math.hypot(x - cx!, z - cz!) > 6);

const added: Prim[] = [];
const tree = (x: number, z: number, height: number, crown: number, tag: string) => added.push({ type: "tree", at: { x, y: hAt(x, z), z }, height, crown, tag });

// street trees in the near sidewalk, 1.4 m in from its kerb, every 7 m — none in front of the street front itself
let street = 0;
for (let s = 0; s < len; s += 7) {
  const x = A.x + ux * s + nx * 1.4, z = A.z + uz * s + nz * 1.4;
  // none between the corner cameras and the building: the corners stay open to the lens, as in the architect's view
  if (z > -24 && z < 32) continue;
  if (Math.abs(x) > 60 || Math.abs(z) > 45 || !offCam(x, z) || inView(x, z) || !clear(x, z, 1)) continue;
  tree(x, z, 6 + rnd() * 1.5, 2.1 + rnd() * 0.5, "tree:street"); street++;
}
// and in the far sidewalk, every 9 m
for (let s = 4; s < len; s += 9) {
  const x = A.x + ux * s + nx * 12.2, z = A.z + uz * s + nz * 12.2;
  if (Math.abs(z) > 45 || cams.some(([cx, cz]) => Math.hypot(x - cx!, z - cz!) < 10)) continue;
  tree(x, z, 6 + rnd() * 1.5, 2.1 + rnd() * 0.5, "tree:street"); street++;
}
// the bare earth: trees and cypresses on a loose grid, shrubs between them
let trees = 0, shrubs = 0;
for (let z = -42; z < 42; z += 1.5) for (let x = -46; x < 30; x += 1.5) {
  const jx = x + (rnd() - 0.5) * 1.1, jz = z + (rnd() - 0.5) * 1.1;
  const h = hAt(jx, jz);
  if (h < 0.25 || onStreet(jx, jz) || nearBuilding(jx, jz, 0.8) || !offCam(jx, jz)) continue;
  const r = rnd();
  if (r < 0.05 && !inView(jx, jz) && !nearBuilding(jx, jz, 4) && clear(jx, jz, 2.2)) { tree(jx, jz, 5 + rnd() * 2, 1.8 + rnd() * 0.6, "tree:garden"); trees++; }
  else if (r < 0.08 && !inView(jx, jz) && !nearBuilding(jx, jz, 2.5) && clear(jx, jz, 0.8)) { tree(jx, jz, 6.5 + rnd() * 1.5, 0.75, "tree:cypress"); trees++; }
  else if (r < 0.55 && !inView(jx, jz) && clear(jx, jz, 0.7)) { tree(jx, jz, 0.45 + rnd() * 0.25, 0.6 + rnd() * 0.3, "tree:shrub"); shrubs++; }
}
// NEIGHBOURS=1: the apartment block the architect's own render stands north of the synagogue (a stone residential block, seven
// storeys, balconies on its street face), just past the plot's north edge — staging for the marketing view, not a drawn building
if (process.env.NEIGHBOURS) {
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: string, tag: string) =>
    added.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 }, material, tag });
  // A building of a haredi neighbourhood (Ramat Beit Shemesh): Jerusalem stone, six storeys over a stone-arched lobby, sukkah
  // balconies staggered floor to floor (each open to the sky, none roofed by the one above) behind stone parapets, white
  // aluminium windows with roller-shutter boxes, laundry screens on the side face, solar water heaters in rows on the roof.
  const X0 = -30, X1 = -11, Z0 = -42, Z1 = -21, FH = 3.1, FLOORS = 6, H = FLOORS * FH + 0.9;
  box(X0, X1, 0, H, Z0, Z1, "jerusalemStone", "neighbour:block");
  box(X0 - 0.15, X1 + 0.15, H - 0.25, H, Z0 - 0.15, Z1 + 0.15, "jerusalemStone", "neighbour:coping");
  // the street face (x = X1) in three bays, two windows each; a bay's sukkah balcony on alternate floors, the next bay's between
  const bays = [[Z0 + 0.8, Z0 + 7.2], [Z0 + 7.4, Z0 + 13.6], [Z0 + 13.8, Z0 + 20.2]] as const;
  const win = (zA: number, y: number, w: number, h: number, x: number, face: 1 | -1) => {
    box(x - 0.02, x + 0.02, y, y + h, zA, zA + w, "glass", "neighbour:window");
    box(x, x + face * 0.06, y - 0.05, y, zA - 0.05, zA + w + 0.05, "plaster", "neighbour:window:frame");
    box(x, x + face * 0.06, y + h, y + h + 0.05, zA - 0.05, zA + w + 0.05, "plaster", "neighbour:window:frame");
    for (const z of [zA - 0.05, zA + w / 2 - 0.025, zA + w]) box(x, x + face * 0.06, y, y + h, z, z + 0.05, "plaster", "neighbour:window:frame");
    box(x, x + face * 0.12, y + h + 0.05, y + h + 0.3, zA - 0.05, zA + w + 0.05, "plaster", "neighbour:shutter-box");
  };
  for (let f = 0; f < FLOORS; f++) {
    const y = 0.6 + f * FH; // the floor's level
    bays.forEach(([za, zb], b) => {
      const sukkah = f >= 1 && (b + f) % 2 === 0;
      if (sukkah) {
        // the balcony: its slab out 1.7 m, a stone parapet 1.05 m with a slim white rail over it, a glazed door and window behind
        box(X1, X1 + 1.7, y - 0.2, y, za, zb, "jerusalemStone", "neighbour:sukkah");
        box(X1 + 1.5, X1 + 1.7, y, y + 0.95, za, zb, "jerusalemStone", "neighbour:sukkah:parapet");
        for (const z of [za, zb - 0.2]) box(X1, X1 + 1.7, y, y + 0.95, z, z + 0.2, "jerusalemStone", "neighbour:sukkah:parapet");
        box(X1 + 1.55, X1 + 1.65, y + 0.95, y + 1.1, za, zb, "plaster", "neighbour:sukkah:rail");
        win(za + 0.6, y + 0.05, 1.8, 2.2, X1, 1);
        win(zb - 2.6, y + 0.95, 1.8, 1.3, X1, 1);
      } else {
        win(za + 0.7, y + 0.95, 1.6, 1.35, X1, 1);
        win(zb - 2.3, y + 0.95, 1.6, 1.35, X1, 1);
      }
    });
  }
  // the side face (z = Z1): windows facing +z, and the louvred laundry screens ("מסתור כביסה")
  for (let f = 1; f < FLOORS; f++) {
    const y = 0.6 + f * FH;
    for (const xa of [X1 - 5.5, X1 - 13]) {
      box(xa, xa + 1.5, y + 0.95, y + 2.3, Z1 - 0.02, Z1 + 0.02, "glass", "neighbour:window");
      box(xa - 0.05, xa + 1.55, y + 2.3, y + 2.55, Z1, Z1 + 0.12, "plaster", "neighbour:shutter-box");
      box(xa - 0.05, xa + 1.55, y + 0.9, y + 0.95, Z1, Z1 + 0.06, "plaster", "neighbour:window:frame");
    }
    box(X1 - 9.5, X1 - 7.3, y + 0.3, y + 2.5, Z1, Z1 + 0.45, "louvre", "neighbour:laundry-screen");
  }
  // the lobby: a stone-framed glazed entrance in the middle bay, a canopy over it
  box(X1 - 0.02, X1 + 0.02, 0, 2.6, Z0 + 9.2, Z0 + 11.8, "glass", "neighbour:entrance");
  box(X1, X1 + 0.25, 2.6, 3.0, Z0 + 8.9, Z0 + 12.1, "jerusalemStone", "neighbour:entrance:frame");
  for (const z of [Z0 + 8.9, Z0 + 11.8]) box(X1, X1 + 0.25, 0, 2.6, z, z + 0.3, "jerusalemStone", "neighbour:entrance:frame");
  box(X1, X1 + 1.6, 3.0, 3.15, Z0 + 8.6, Z0 + 12.4, "darkSteel", "neighbour:entrance:canopy");
  // the roof: solar water heaters in rows — a tilted collector facing south and its white tank behind — and a stair head
  const panel = (x: number, z: number) => {
    added.push({ type: "prism", side: { along: "z", t0: x, t1: x + 1.0 }, ring: [[z, H], [z + 1.8, H], [z + 1.8, H + 0.1], [z, H + 1.0], [z - 0.06, H + 0.95]], y0: H, y1: H + 1.0, material: "darkSteel", tag: "neighbour:solar" });
    box(x, x + 1.0, H, H + 1.3, z - 0.6, z - 0.05, "plaster", "neighbour:solar:tank");
  };
  for (let x = X0 + 1.5; x < X1 - 2; x += 1.6) for (const z of [Z0 + 3, Z0 + 8, Z0 + 13]) panel(x, z);
  box(X0 + 2, X0 + 7, H, H + 2.6, Z1 - 6, Z1 - 1.5, "jerusalemStone", "neighbour:stair-head");
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "model.json"), JSON.stringify({ ...model, primitives: [...model.primitives, ...added] }));
fs.copyFileSync(path.join(dir, "state.json"), path.join(out, "state.json"));
console.log(`street trees ${street}, garden trees ${trees}, shrubs ${shrubs}`);
