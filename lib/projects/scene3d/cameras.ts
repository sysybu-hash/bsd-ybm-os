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
const INTERIOR_FOV = 60;
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
 * Solved rather than guessed: the footprint is tilted by the camera's pitch,
 * so its apparent height is depth·sin(pitch) plus what the walls add, and the
 * distance is whichever of width and height needs more room.
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
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * Math.max(aspect, 0.2));
  const apparentHeight = depthM * Math.sin(pitch) + WALL_HEIGHT_M * Math.cos(pitch);
  const forHeight = apparentHeight / 2 / Math.tan(fovY / 2);
  const forWidth = widthM / 2 / Math.tan(fovX / 2);
  return Math.max(forHeight, forWidth) * MARGIN;
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

  // Interior: stand in the room's own corner, at eye height, looking across it.
  const room = scene.rooms.find((r) => r.id === view.roomId) ?? scene.rooms[0];
  const bounds = room?.bounds ?? { x: centre.x - 2, z: centre.z - 2, w: 4, d: 4 };
  const roomCentre = { x: bounds.x + bounds.w / 2, z: bounds.z + bounds.d / 2 };
  // A fixed corner order, so the same room is always photographed the same way.
  const corner = { x: bounds.x + bounds.w * 0.12, z: bounds.z + bounds.d * 0.12 };
  return {
    kind: "perspective",
    position: { x: corner.x, y: EYE_HEIGHT_M, z: corner.z },
    target: { x: roomCentre.x, y: EYE_HEIGHT_M * 0.72, z: roomCentre.z },
    up: { x: 0, y: 1, z: 0 },
    fovDeg: INTERIOR_FOV,
    near: 0.05,
    far: Math.max(width, depth) * 3,
    cutawayM: view.cutawayM,
  };
}
