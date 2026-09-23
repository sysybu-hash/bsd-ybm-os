/**
 * The measured flat as a scene, in metres — and nothing else.
 *
 * This is the hard seam of the deterministic renderer. Everything above it
 * (the CAD measurement) is what the drawing says; everything below it (three.js
 * in a browser, three.js in a headless Chromium, a path tracer on a GPU) only
 * photographs what is here. The type is deliberately poor: axis-aligned boxes,
 * a material name, and where each box came from. A renderer that wants to draw
 * something this type cannot express is a renderer that is inventing.
 *
 * Coordinates: metres, Y up, and the drawing's own axes otherwise — the page's
 * X becomes the scene's X and the page's Y becomes the scene's Z, both
 * recentred on the flat's extent. A camera above the origin looking down with
 * its up vector along -Z therefore sees the plan the way the sheet prints it.
 * That is why no still from this engine can come out mirrored or turned: the
 * orientation is not a choice a renderer makes.
 */

export type Vec3 = { x: number; y: number; z: number };

/** What a box is, which is also what a test can count. */
export type SceneMeshKind =
  | "wall"
  | "wallHead"
  | "wallSill"
  | "wallCap"
  | "floor"
  | "terrace"
  | "railing"
  | "glazing"
  | "frame"
  | "threshold"
  | "skirting"
  | "furniture"
  | "prop";

export type MaterialId =
  | "wall"
  | "wallCut"
  | "floorWood"
  | "floorTile"
  | "floorStone"
  | "skirting"
  | "glass"
  | "joinery"
  | "metal"
  | "linen"
  | "upholstery"
  | "timber"
  | "worktop"
  | "ceramic"
  | "steel"
  | "neutral";

export type SceneBox = {
  kind: SceneMeshKind;
  material: MaterialId;
  /** Centre of the box, metres. */
  centre: Vec3;
  /** Full extents, metres. */
  size: Vec3;
  /**
   * What this box was made from: a wall index, a furniture index, a room name.
   * Staging anchors to it, and a test can ask what a mesh is doing there.
   */
  sourceId: string;
  /**
   * For a prop: the measured mesh it rests on.
   *
   * A test walks every prop and every light and asks for this. A bowl of fruit
   * has to sit on a worktop the drawing draws; if nothing was measured there,
   * there is no bowl. It is how "lived-in" stays honest.
   */
  anchorId?: string;
};

export type SceneRoomKind =
  | "living"
  | "kitchen"
  | "bedroom"
  | "mmd"
  | "bathroom"
  | "balcony"
  | "circulation"
  | "utility"
  | "other";

export type SceneRoom = {
  id: string;
  name: string;
  kind: SceneRoomKind;
  areaM2: number;
  /** The measured region, merged into rectangles. Metres. */
  rects: Array<{ x: number; z: number; w: number; d: number }>;
  /** Bounding box of those rectangles, metres. */
  bounds: { x: number; z: number; w: number; d: number };
};

export type SceneOpeningKind = "door" | "window" | "opening" | "slider";

export type SceneOpening = {
  id: string;
  kind: SceneOpeningKind;
  /** The hole itself, metres: its footprint plus the heights it spans. */
  centre: Vec3;
  size: Vec3;
  sillM: number;
  headM: number;
  /** True where the wall it sits in is part of the flat's envelope. */
  exterior: boolean;
};

/**
 * A lamp that is switched on.
 *
 * Every one of these is anchored to something measured — a pendant over a
 * dining table the drawing places, a strip under a kitchen run it draws — so
 * lighting is staging, exactly as the brief has always said, and never
 * architecture the renderer invented.
 */
export type SceneLight = {
  id: string;
  kind: "pendant" | "strip" | "lamp" | "sun" | "sky";
  position: Vec3;
  /** Kelvin, and how bright relative to the style's own exposure. */
  kelvin: number;
  intensity: number;
  /** The measured mesh this light hangs over. Absent only for sun and sky. */
  anchorId?: string;
};

export type FlatScene = {
  version: 1;
  /** Drawing units per metre, kept so a caller can go back to page space. */
  unitsPerMetre: number;
  /** The flat's footprint in scene coordinates, metres. */
  extent: { x: number; z: number; width: number; depth: number };
  meshes: SceneBox[];
  rooms: SceneRoom[];
  openings: SceneOpening[];
  lights: SceneLight[];
};
