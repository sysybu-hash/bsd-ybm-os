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
  /** Jerusalem stone around an exterior window. Interior doors stay joinery. */
  | "stoneFrame"
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
  /** Edges rounded to this radius, metres: the box is built as a rounded box (a cushion, a worktop's edge). */
  round?: number;
  /**
   * Any other form. With one, `size` is the form's bounding box (what audits, the hash and the cutaway read) and the form itself is built inside it,
   * in coordinates relative to `centre`.
   */
  shape?: SceneShape;
  /** Turns about the vertical axis, radians, about `centre`: a piece set at an angle to the walls. */
  rotY?: number;
  /**
   * The form's own extents before it is turned, when a quarter turn has made `size` its footprint on the page's axes (audits and the cutaway read the footprint;
   * the geometry is built from these).
   */
  local?: Vec3;
  /** Slopes, radians about the x and z axes through `centre` (a leaning back rest, a raked headboard, a ramp): applied before `rotY`. */
  tiltX?: number;
  tiltZ?: number;
};

/**
 * What a mesh can be besides a box. Every form is built from numbers the caller gives, in metres relative to the mesh's centre; nothing is picked
 * from a catalogue, so any outline, slope or curve can be handed to the renderer.
 */
export type SceneShape =
  /** An ellipsoid filling the bounding box: a pillow's bulk, a bowl, a lamp shade's globe. */
  | { kind: "ellipsoid"; segments?: number }
  /** A solid of revolution about the vertical axis (a vase, a lamp base, a round table). Profile points are (radius, y), bottom to top. */
  | { kind: "lathe"; profile: Array<[number, number]>; segments?: number }
  /** A plan outline (x, z) extruded up through the box's height; `bevel` rounds the top and bottom edges. Any curved outline is just many points. */
  | { kind: "extrude"; outline: Array<[number, number]>; bevel?: number; /** Rings cut through it: a worktop with its sink's opening. */ holes?: Array<Array<[number, number]>> }
  /** A loft: horizontal sections at heights y, each a closed ring of the same number of (x, z) points, joined into a skin: tapers, slopes, bulges and curves of any kind. */
  | { kind: "loft"; sections: Array<{ y: number; ring: Array<[number, number]> }>; capped?: boolean }
  /** A tube of constant radius along a path of 3-D points, smoothed through them: a bent leg, a handle, a lamp's arm. */
  | { kind: "sweep"; path: Array<[number, number, number]>; radius: number; segments?: number }
  /** Raw triangles: positions (x, y, z flattened) and indices into them. */
  | { kind: "mesh"; positions: number[]; indices: number[] };

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
  /** The page point the scene's origin stands on: page = origin · upm + this. */
  pageCentre?: { x: number; y: number };
  /** The flat's footprint in scene coordinates, metres. */
  extent: { x: number; z: number; width: number; depth: number };
  meshes: SceneBox[];
  rooms: SceneRoom[];
  openings: SceneOpening[];
  lights: SceneLight[];
};
