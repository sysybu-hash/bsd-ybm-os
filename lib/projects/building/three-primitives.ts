import type * as ThreeNS from "three";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";

type THREE = typeof ThreeNS;

/**
 * A building's primitives (model.json) as three.js meshes, for the browser studio: the same shapes the renderer's page
 * draws (render-page.ts), in plain colours — no textures, no environment, no tracer. What it shows is where things
 * stand and how big they are; the booklet's pictures are the finish.
 */

/** Each material's colour as the renderer's page tints it (its textures' base), and what is see-through. */
const COLOUR: Partial<Record<BuildingMaterial, number>> = {
  stone: 0xe6dccb, stoneDeep: 0xb9ab95, render: 0xece7dd, renderGray: 0xcdbfac, renderBrown: 0x86786a, jerusalemStone: 0xeadcc2,
  louvre: 0xc8c6c0, stoneDark: 0x55585c, concrete: 0xb8b4ac, plaster: 0xe9e3d8, frame: 0x3c3f43, slab: 0xd9d5cd,
  floorStone: 0xd8d2c6, floorVinyl: 0xbfb3a0, floorWood: 0xa77c52, carpet: 0x8b8378, asphalt: 0x4a4b4d, parkingLine: 0xf2f2ee,
  paving: 0xb5a999, grass: 0x6f8f4a, soil: 0xa08d6e, rock: 0xa89a86, existing: 0xd6d2cc, metal: 0x8c9096, timber: 0x9a7350,
  upholstery: 0x3e5566, upholsteryAccent: 0xc58b3a, velvet: 0x5c1420, pewCushion: 0x9a1c26, whiteboard: 0xf7f7f5, screen: 0x15171a,
  darkSteel: 0x4d5256, worktop: 0xe8e4dc, ceramic: 0xf4f4f2, signage: 0xd9c08a, planter: 0x5f5a54, foliage: 0x4f6b35,
  ceiling: 0xefede8, lightPanel: 0xffffff, seatFabric: 0x1f5c66, linen: 0xf6f3ec, sofaFabric: 0x8f8476, cushion: 0xd9d0c2,
  rug: 0x9b8c7a, floorOak: 0xb08a5e, floorPorcelain: 0xe4e0d8, floorWet: 0xcfcac2, terraceTile: 0xc9b9a3, balconyTile: 0xbfb2a0,
  cabinet: 0xf1eee8, quartz: 0x5d5a57, walnut: 0x6b4a33, poche: 0x3b3a38, stainless: 0xc8ccd0, crateBlue: 0x2f6aa8,
  safetyOrange: 0xe0661c, sausage: 0x8a3b22, wrapFilm: 0xe9ecef, rubber: 0x1b1c1e, epoxy: 0xc9ccc9,
};
const GLASS: Partial<Record<BuildingMaterial, number>> = { glass: 0x2a3540, glassTint: 0x1a2025, glassWarm: 0x2a2a2a, railGlass: 0xe8f1f2, houseGlass: 0x1d2428 } as Partial<Record<BuildingMaterial, number>>;
const HIDDEN = new Set<string>(["roomGlow", "roomGlowDim", "stairShade"]);

export type PrimitiveBuildOptions = { clip?: ThreeNS.Plane[]; include?: (p: Primitive) => boolean };

/** Every primitive the studio draws, in one group; materials are shared by colour. */
export function buildPrimitives(three: THREE, primitives: Primitive[], opts: PrimitiveBuildOptions = {}): ThreeNS.Group {
  const group = new three.Group();
  const mats = new Map<string, ThreeNS.Material>();
  const mat = (m: BuildingMaterial | "bark" | "skin" | "car", colour?: number): ThreeNS.Material => {
    const key = `${m}:${colour ?? ""}`;
    let made = mats.get(key);
    if (!made) {
      const glass = GLASS[m as BuildingMaterial];
      made =
        glass != null
          ? new three.MeshStandardMaterial({ color: glass, transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.3, depthWrite: false, clippingPlanes: opts.clip ?? null, side: three.DoubleSide })
          : new three.MeshStandardMaterial({ color: colour ?? COLOUR[m as BuildingMaterial] ?? (m === "bark" ? 0x5a4636 : 0xd8d4cc), roughness: 0.85, clippingPlanes: opts.clip ?? null, side: three.DoubleSide });
      mats.set(key, made);
    }
    return made;
  };
  const add = (geo: ThreeNS.BufferGeometry, m: ThreeNS.Material, at?: { x: number; y: number; z: number }, rotY?: number) => {
    const mesh = new three.Mesh(geo, m);
    if (at) mesh.position.set(at.x, at.y, at.z);
    if (rotY) mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const shape = (ring: Array<[number, number]>, flip: number) => {
    const s = new three.Shape(ring.map(([a, b]) => new three.Vector2(a, b * flip)));
    return s;
  };

  for (const p of primitives) {
    if (opts.include && !opts.include(p)) continue;
    if ("material" in p && HIDDEN.has(p.material)) continue;
    if (p.type === "box") {
      add(new three.BoxGeometry(p.size.x, p.size.y, p.size.z), mat(p.material), p.centre, p.rotY);
    } else if (p.type === "prism" && p.ring.length >= 3) {
      if (p.side) {
        // (u, y) stands in the wall's face and runs through it from t0 to t1.
        const geo = new three.ExtrudeGeometry(shape(p.ring, 1), { depth: p.side.t1 - p.side.t0, bevelEnabled: false });
        const m4 = new three.Matrix4();
        if (p.side.along === "x") m4.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, p.side.t0, 0, 0, 0, 1);
        else m4.set(0, 0, 1, p.side.t0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
        geo.applyMatrix4(m4);
        add(geo, mat(p.material));
      } else {
        // The ring is (x, z) in plan: drawn as (x, −z) and stood up, it extrudes up from y0.
        const s = shape(p.ring, -1);
        for (const h of p.holes ?? []) s.holes.push(new three.Path(h.map(([a, b]) => new three.Vector2(a, -b))));
        const geo = new three.ExtrudeGeometry(s, { depth: Math.max(0.005, p.y1 - p.y0), bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, p.y0, 0);
        add(geo, mat(p.material));
      }
    } else if (p.type === "cylinder") {
      add(new three.CylinderGeometry(p.radius, p.radius, p.height, 24), mat(p.material), p.centre);
    } else if (p.type === "terrain" && p.nx > 1 && p.nz > 1) {
      const geo = new three.PlaneGeometry(p.dx * (p.nx - 1), p.dx * (p.nz - 1), p.nx - 1, p.nz - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position!;
      // After the turn the plane's vertices run row by row from −z to +z, each row −x to +x: (ix, iz) as the heights are kept.
      for (let iz = 0; iz < p.nz; iz++) {
        for (let ix = 0; ix < p.nx; ix++) pos.setY(iz * p.nx + ix, p.heights[iz * p.nx + ix] ?? 0);
      }
      geo.computeVertexNormals();
      geo.translate(p.x0 + (p.dx * (p.nx - 1)) / 2, 0, p.z0 + (p.dx * (p.nz - 1)) / 2);
      add(geo, mat(p.material));
    } else if (p.type === "tree") {
      add(new three.CylinderGeometry(0.12, 0.16, p.height * 0.45, 8), mat("bark"), { x: p.at.x, y: p.at.y + p.height * 0.225, z: p.at.z });
      add(new three.SphereGeometry(p.crown / 2, 12, 10), mat("foliage"), { x: p.at.x, y: p.at.y + p.height - p.crown / 2, z: p.at.z });
    } else if (p.type === "plant") {
      add(new three.ConeGeometry(p.spread / 2, p.height, 10), mat("foliage"), { x: p.at.x, y: p.at.y + p.height / 2, z: p.at.z });
    } else if (p.type === "car") {
      add(new three.BoxGeometry(4.4, 1.4, 1.8), mat("car", p.colour), { x: p.at.x, y: p.at.y + 0.7, z: p.at.z }, p.rotY);
    } else if (p.type === "person") {
      add(new three.CylinderGeometry(0.2, 0.2, p.height, 10), mat("skin", p.colour), { x: p.at.x, y: p.at.y + p.height / 2, z: p.at.z });
    }
  }
  return group;
}
