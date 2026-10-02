/**
 * A building as the renderer draws it: volumes with a material each, in
 * metres. x runs east (right on the plan), z south (down the plan), y up from
 * the project's ±0.00.
 *
 * Deliberately primitive: a box, a prism extruded from a plan outline, a
 * cylinder. Every decision about what a wall or a window is has been taken by
 * the builder, so the page that draws this has nothing to decide.
 */
export type Vec3 = { x: number; y: number; z: number };

export type BuildingMaterial =
  | "stone"
  /** A darker stone the elevation names for parts of a facade ("אבן כהה"). */
  | "stoneDeep"
  /** Exterior render ("טיח"), as an elevation calls for it. */
  | "render"
  /** Aluminium slats: a laundry screen ("מסתור כביסה"). */
  | "louvre"
  | "stoneDark"
  | "concrete"
  | "plaster"
  | "glass"
  | "frame"
  | "slab"
  | "floorStone"
  | "floorVinyl"
  | "floorWood"
  | "carpet"
  | "asphalt"
  | "parkingLine"
  | "paving"
  | "grass"
  | "soil"
  | "rock"
  | "existing"
  | "metal"
  | "timber"
  | "upholstery"
  | "upholsteryAccent"
  | "whiteboard"
  | "screen"
  | "worktop"
  | "ceramic"
  | "signage"
  | "planter"
  | "foliage"
  | "ceiling"
  | "lightPanel"
  | "seatFabric"
  | "linen"
  /** An apartment's own finishes: a sofa's weave, a rug, oak and porcelain, a wet room's tile. */
  | "sofaFabric"
  | "cushion"
  | "rug"
  | "floorOak"
  | "floorPorcelain"
  | "floorWet"
  /** A terrace's outdoor tile, a shade deeper than the rooms' porcelain. */
  | "terraceTile"
  | "cabinet"
  /** A kitchen's worktop: dark quartz over white cabinets. */
  | "quartz"
  /** Furniture timber: walnut, a shade darker than the oak floors it stands on. */
  | "walnut"
  /** A balustrade's clear glass. */
  | "railGlass"
  /** The cut top of a wall in a plan: drawn solid, as a plan draws it. */
  | "poche";

export type Primitive =
  | {
      type: "box";
      centre: Vec3;
      size: Vec3;
      material: BuildingMaterial;
      tag?: string;
      rotY?: number;
      /** Edges rounded to this radius, metres: a cushion, a mattress. */
      round?: number;
    }
  | {
      type: "prism";
      /** Outline in plan, metres (x, z), counter-clockwise or not. */
      ring: Array<[number, number]>;
      holes?: Array<Array<[number, number]>>;
      y0: number;
      y1: number;
      material: BuildingMaterial;
      tag?: string;
    }
  | { type: "cylinder"; centre: Vec3; radius: number; height: number; material: BuildingMaterial; tag?: string }
  | {
      /** Ground as a grid of heights: nx by nz samples, dx metres apart, from (x0, z0). */
      type: "terrain";
      x0: number;
      z0: number;
      dx: number;
      nx: number;
      nz: number;
      heights: number[];
      material: BuildingMaterial;
      tag?: string;
    }
  | { type: "tree"; at: Vec3; height: number; crown: number; tag?: string }
  /** A plant in a pot: staging beside a sofa, in a terrace's corner. */
  | { type: "plant"; at: Vec3; height: number; spread: number; tag?: string }
  | { type: "car"; at: Vec3; rotY: number; colour: number; tag?: string }
  | { type: "person"; at: Vec3; rotY: number; colour: number; height: number; tag?: string }
  | {
      type: "text";
      text: string;
      /** Middle of the lettering's baseline, and the way it faces (unit normal in plan). */
      at: Vec3;
      facing: { x: number; z: number };
      heightM: number;
      material: BuildingMaterial;
      tag?: string;
    };

export type BuildingModel = {
  name: string;
  primitives: Primitive[];
  /** Ground extent the camera rigs frame, metres. */
  extent: { x: number; z: number; width: number; depth: number; yMin: number; yMax: number };
  /** Which way is north, as a unit vector in plan (x, z). */
  north: { x: number; z: number };
};
