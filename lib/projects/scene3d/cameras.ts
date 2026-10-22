import { CUTAWAY_OVERVIEW_M, WALL_HEIGHT_M } from "@/lib/projects/scene3d/standards";
import type { FlatScene, Vec3 } from "@/lib/projects/scene3d/types";

/**
 * Where the camera stands — as numbers, so it can be tested without a browser.
 *
 * Every rig is solved from the flat's own extent, so no plan needs tuning by
 * hand and two sheets in the same booklet are photographed the same way. The
 * yaw is fixed in the drawing's frame: that is why a still from this engine
 * cannot come back mirrored or turned, which the audit reported on more than
 * half the model's frames.
 */

export type ViewId = "overview" | "isometric" | "interior";

export type ViewSpec = {
  id: ViewId;
  /** For an interior: the room to stand in. */
  roomId?: string;
  /** Metres to cut the walls at. Defaults per view. */
  cutawayM?: number;
};

export type CameraRig = {
  kind: "perspective" | "orthographic";
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fovDeg?: number;
  /** Half-extents of an orthographic frustum. */
  halfWidth?: number;
  halfHeight?: number;
  near: number;
  far: number;
  cutawayM?: number;
};

const OVERVIEW_FOV = 28;
const OVERVIEW_PITCH_DEG = 62;
const INTERIOR_FOV = 78;
const EYE_HEIGHT_M = 1.55;
/** Room to breathe around the flat, as a fraction of its size. */
const MARGIN = 1.06;

/** Plan north stays up the page: the camera's up vector points to -Z. */
export const PLAN_UP: Vec3 = { x: 0, y: 0, z: -1 };

function centreOf(scene: FlatScene): Vec3 {
  return {
    x: scene.extent.x + scene.extent.width / 2,
    y: 0,
    z: scene.extent.z + scene.extent.depth / 2,
  };
}

/**
 * How far back a perspective camera has to stand to hold the whole flat.
 *
 * Solved rather than guessed, corner by corner. Seen in perspective the near
 * edge of the footprint is closer than the centre the camera aims at, so it
 * spreads wider and lower in the frame than the far edge: a terrace along the
 * near side came out cut off at the bottom of the frame when the footprint was
 * taken as symmetric. With h half the depth, H the wall height, t the tangent
 * of half the field of view:
 *   the near edge, on the floor:   D ≥ h·sin(p)/t + h·cos(p)
 *   the far wall top:              D ≥ (H·cos(p) + h·sin(p))/t + H·sin(p) − h·cos(p)
 *   the near corners, across:      D ≥ (w/2)/tx + h·cos(p)
 */
export function overviewDistance(
  widthM: number,
  depthM: number,
  aspect: number,
  fovDeg = OVERVIEW_FOV,
  pitchDeg = OVERVIEW_PITCH_DEG,
): number {
  const pitch = (pitchDeg * Math.PI) / 180;
  const fovY = (fovDeg * Math.PI) / 180;
  const t = Math.tan(fovY / 2);
  const tx = t * Math.max(aspect, 0.2);
  const h = depthM / 2;
  const H = WALL_HEIGHT_M;
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);
  const nearEdge = (h * sin) / t + h * cos;
  const farTop = (H * cos + h * sin) / t + H * sin - h * cos;
  const across = widthM / 2 / tx + h * cos;
  return Math.max(nearEdge, farTop, across) * MARGIN;
}

export function cameraFor(scene: FlatScene, view: ViewSpec, aspect: number): CameraRig {
  const centre = centreOf(scene);
  const { width, depth } = scene.extent;

  if (view.id === "overview") {
    const pitch = (OVERVIEW_PITCH_DEG * Math.PI) / 180;
    const distance = overviewDistance(width, depth, aspect);
    return {
      kind: "perspective",
      position: {
        x: centre.x,
        y: distance * Math.sin(pitch),
        z: centre.z + distance * Math.cos(pitch),
      },
      target: { ...centre, y: WALL_HEIGHT_M * 0.25 },
      up: PLAN_UP,
      fovDeg: OVERVIEW_FOV,
      near: Math.max(0.1, distance * 0.05),
      far: distance * 4,
      cutawayM: view.cutawayM ?? CUTAWAY_OVERVIEW_M,
    };
  }

  if (view.id === "isometric") {
    // True isometric: 45 degrees around, 35.264 up — the angle at which the
    // three axes foreshorten equally, and the one an architect expects.
    const yaw = Math.PI / 4;
    const pitch = Math.atan(Math.SQRT1_2);
    const span = Math.max(width, depth);
    const distance = span * 2.2;
    const half = (span * 0.78) / 2;
    return {
      kind: "orthographic",
      position: {
        x: centre.x + distance * Math.cos(pitch) * Math.sin(yaw),
        y: distance * Math.sin(pitch),
        z: centre.z + distance * Math.cos(pitch) * Math.cos(yaw),
      },
      target: { ...centre, y: WALL_HEIGHT_M / 2 },
      up: { x: 0, y: 1, z: 0 },
      halfWidth: half * Math.max(aspect, 0.2) * 1.4,
      halfHeight: half * 1.4,
      near: 0.1,
      far: distance * 3,
      cutawayM: view.cutawayM,
    };
  }

  // Interior: stand on the room's open floor, as far from its middle as the
  // furniture allows, at eye height, looking across it.
  const room = scene.rooms.find((r) => r.id === view.roomId) ?? scene.rooms[0];
  const bounds = room?.bounds ?? { x: centre.x - 2, z: centre.z - 2, w: 4, d: 4 };
  const roomCentre = { x: bounds.x + bounds.w / 2, z: bounds.z + bounds.d / 2 };
  const stand = room ? interiorStand(scene, room) : { x: bounds.x + bounds.w * 0.12, z: bounds.z + bounds.d * 0.12 };
  // Across the room: the far side of its middle from where the camera stands.
  const across = { x: roomCentre.x + (roomCentre.x - stand.x) * 0.4, z: roomCentre.z + (roomCentre.z - stand.z) * 0.4 };
  return {
    kind: "perspective",
    position: { x: stand.x, y: EYE_HEIGHT_M, z: stand.z },
    target: { x: across.x, y: EYE_HEIGHT_M * 0.72, z: across.z },
    up: { x: 0, y: 1, z: 0 },
    fovDeg: INTERIOR_FOV,
    near: 0.05,
    far: Math.max(width, depth) * 3,
    cutawayM: view.cutawayM,
  };
}

/** What a camera may not stand in: wall and anything standing on the floor. */
const SOLID = new Set(["wall", "wallHead", "wallSill", "railing", "glazing", "frame", "furniture"]);

/**
 * Where to stand in a room to photograph it: a step inside its doorway, or
 * else on its open floor — clear of every wall and piece by 35 cm — the spot
 * farthest from the room's middle, so the view runs across the room. A fixed corner put the
 * camera inside 18's dining chairs and its wall, and the frame came back one
 * flat colour. The first such spot in a fixed scan order, so the same room is
 * always photographed the same way; the old corner where none is clear.
 */
export function interiorStand(scene: FlatScene, room: { rects: Array<{ x: number; z: number; w: number; d: number }>; bounds: { x: number; z: number; w: number; d: number } }): { x: number; z: number } {
  const clear = 0.35;
  const step = 0.2;
  const solids = scene.meshes.filter((m) => SOLID.has(m.kind) && m.centre.y + m.size.y / 2 > 0.25);
  const blocked = (x: number, z: number) =>
    solids.some(
      (m) =>
        Math.abs(x - m.centre.x) < m.size.x / 2 + clear && Math.abs(z - m.centre.z) < m.size.z / 2 + clear,
    );
  const inRoom = (x: number, z: number) =>
    room.rects.some((r) => x >= r.x + clear && x <= r.x + r.w - clear && z >= r.z + clear && z <= r.z + r.d - clear);
  const mid = { x: room.bounds.x + room.bounds.w / 2, z: room.bounds.z + room.bounds.d / 2 };
  // In its doorway first, a step inside: where one is shown a room from, and
  // the one place the whole of it is in front of the camera. Standing in the
  // far corner instead, 18's bedroom came back as its wardrobe's side.
  const doors = scene.openings.filter((o) => o.kind === "door" || o.kind === "opening");
  for (const door of doors) {
    const alongX = door.size.x >= door.size.z;
    for (const sign of [1, -1]) {
      for (const depth of [0.3, 0.6, 0.9]) {
        const x = door.centre.x + (alongX ? 0 : sign * depth);
        const z = door.centre.z + (alongX ? sign * depth : 0);
        if (inRoom(x, z) && !blocked(x, z)) return { x, z };
      }
    }
  }
  let best: { x: number; z: number } | null = null;
  let bestReach = -1;
  for (let x = room.bounds.x; x <= room.bounds.x + room.bounds.w; x += step) {
    for (let z = room.bounds.z; z <= room.bounds.z + room.bounds.d; z += step) {
      if (!inRoom(x, z) || blocked(x, z)) continue;
      const reach = Math.hypot(x - mid.x, z - mid.z);
      if (reach > bestReach + 1e-6) {
        best = { x, z };
        bestReach = reach;
      }
    }
  }
  return best ?? { x: room.bounds.x + room.bounds.w * 0.12, z: room.bounds.z + room.bounds.d * 0.12 };
}
