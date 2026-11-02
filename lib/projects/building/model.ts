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
  /** Coloured plaster, light greige: a private house's body. */
  | "renderGray"
  /** Coloured plaster, deep greige: a private house's side wings. */
  | "renderBrown"
  /** Jerusalem stone: the frame around a private house's window. */
  | "jerusalemStone"
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
  /** Street paint: the red of a red-and-white kerb, the blue of a disabled bay. */
  | "kerbRed"
  | "lineBlue"
  /** The black of a traffic island's black-and-white kerb. */
  | "kerbBlack"
  /** A stair head's warning surface ("משטח אזהרה"): dark grey ribbed tile. */
  | "tactile"
  /** The yellow locator strip that leads the blind to the lift ("סימן מאתר"). */
  | "tactileYellow"
  /** Red concrete pavers: the street's islands and the plaza's walks (Street View, 2012). */
  | "brickRed"
  | "paving"
  | "grass"
  | "soil"
  /** A dry Judean hillside after the summer: olive-grey grass, pale earth and limestone (Pisga's photographs, 29/10/2026). */
  | "hillside"
  /** The blue sheet a kindergarten's fence carries over its lower part ("גדר פח"). */
  | "fenceBlue"
  /** Painted dark green steel: the side stairs' railings. */
  | "railGreen"
  /** A neighbour's walls: cream stone with a grid of windows, three metres a storey (context buildings, not the project). */
  | "neighbourFacade"
  /** Red clay roof tile. */
  | "roofTile"
  | "rock"
  | "existing"
  | "metal"
  | "timber"
  | "upholstery"
  | "upholsteryAccent"
  | "whiteboard"
  | "screen"
  | "darkSteel"
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
  /** A stair tread's oak in four tones, the lowest step the darkest (stairs only: house-features treadPrims), and the soft shade a step casts on the one below. */
  | "stairOak0"
  | "stairOak1"
  | "stairOak2"
  | "stairOak3"
  | "stairShade"
  /** An outside flight's stone in four tones, the lowest step the darkest (house-features flightPrimitives). */
  | "stairStone0"
  | "stairStone1"
  | "stairStone2"
  | "stairStone3"
  | "floorPorcelain"
  | "floorWet"
  /** A terrace's outdoor tile, a shade deeper than the rooms' porcelain. */
  | "terraceTile"
  /** A private house's balcony deck: grey 60 cm tiles, as the sheet hatches it apart from the paving below. */
  | "balconyTile"
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
      /** Pitch about local +x after `rotY` (railing on a stair slope); rotation order YXZ in the page script. */
      rotX?: number;
      /**
       * Sloped rail: bottom-centre at `start` and `end`. The page aligns local +Z along that segment
       * (Matrix4 basis) and ignores `rotX` / `rotY` for the mesh. `rotY` and `centre` stay for the fence checker.
       */
      span?: { start: Vec3; end: Vec3 };
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
      /**
       * Sloped handrail: bottom face y at each ring vertex; top = bottom + railThick * railAxis (unit vector).
       */
      ringY0?: number[];
      railThick?: number;
      railAxis?: { nx: number; ny: number; nz: number };
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
      /**
       * A photograph laid on this ground: its data URL and pixel size, `s` metres a pixel, the plan point (cx, cz) at its pixel (cu, cv), and `rot`
       * radians of turn (plan x = cx + ((u − cu)·cos − (v − cv)·sin)·s …, north up when rot is 0).
       */
      photo?: { src: string; pw: number; ph: number; s: number; cu: number; cv: number; cx: number; cz: number; rot: number };
      /** Plan rectangles this grid leaves undrawn (its heights there still stand for the ground): a finer grid over them draws the ground instead. */
      holes?: Array<{ x0: number; z0: number; x1: number; z1: number }>;
    }
  /**
   * A surface draped on a height grid: the plan ring (with holes) triangulated, cut to cells a metre or so across, each vertex at the
   * grid's level there plus `lift`. A road that follows the slope rather than a flat slab.
   */
  | {
      type: "drape";
      ring: Array<[number, number]>;
      holes?: Array<Array<[number, number]>>;
      grid: { x0: number; z0: number; dx: number; nx: number; nz: number; heights: number[] };
      lift: number;
      material: BuildingMaterial;
      tag?: string;
    }
  /** A tree; `kind` draws a hillside olive (short twisted trunk, silver-green crown) or scrub (a dense dark bush from the ground, no trunk). */
  | { type: "tree"; at: Vec3; height: number; crown: number; kind?: "olive" | "scrub"; tag?: string }
  /** A plant in a pot: staging beside a sofa, in a terrace's corner. */
  | { type: "plant"; at: Vec3; height: number; spread: number; tag?: string }
  | { type: "car"; at: Vec3; rotY: number; colour: number; tag?: string }
  | { type: "person"; at: Vec3; rotY: number; colour: number; height: number; tag?: string }
  | {
      /**
       * One solid wall. `stations` run along the centreline: the coping is `yTop` and the foot is `yFoot`,
       * so the two edges need not be parallel. The page builds a single BufferGeometry, `thick` metres across.
       */
      type: "custom-mesh";
      stations: Array<{ x: number; z: number; yTop: number; yFoot: number }>;
      thick: number;
      material: BuildingMaterial;
      tag?: string;
    }
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
  /** A house's street front, the plan's side its plot meets the street on (house-additions streetSide), where it was found. */
  street?: "north" | "south" | "east" | "west";
  /** A house's plot, its boundary's box: where its elevations cut the ground. */
  plot?: { x0: number; z0: number; x1: number; z1: number };
  /**
   * A building's own look where the defaults (white-ish stone, grey paving) are not the site's: `colors` replaces a material's
   * colour (its texture becomes a plain one of that colour), `limestone` swaps the stone for honed sand-cream courses with dark
   * joints, `redPavers` the paving for red-brown pavers in running bond, `golden` the golden hour (a low warm sun, an amber sky,
   * the exterior lamps lit) for the perspective views.
   */
  palette?: BuildingPalette;
};

export type BuildingPalette = { colors?: Partial<Record<BuildingMaterial, string>>; limestone?: boolean; redPavers?: boolean; golden?: boolean };
