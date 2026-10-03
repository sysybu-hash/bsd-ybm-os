import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { buildingCentre, type BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import type { BuildingModel } from "@/lib/projects/building/model";
import type { ElevationFrame } from "@/lib/projects/building/elevation-frame";
import type { BuildingRenderPayload } from "@/lib/projects/building/render-page";

/** A view of the building: what the booklet calls it, and the frame to draw. */
export type BuildingView = { id: string; title: string; payload: Omit<BuildingRenderPayload, "model"> };

/**
 * The views a building booklet shows, solved from the building's own size.
 *
 * מרכז פסג"ה's cameras were placed by hand; these are placed by the model:
 * two aerials from opposite corners, the four elevations drawn in parallel
 * projection square to their faces, and each storey from above with the
 * floors over it cut away. North is -z, so the south elevation looks north.
 */
export function dwfBuildingViews(
  building: { floors: BuildingFloorMeta[]; model: { extent: BuildingModel["extent"] } },
  frame = { width: 2400, height: 1500 },
  /** Each elevation's frame as its sheet draws it, by view id: the render is drawn in the same one. */
  elevationFrames: Record<string, Pick<ElevationFrame, "widthM" | "bottomM" | "topM">> = {},
): BuildingView[] {
  const pts = building.floors.flatMap((f) => f.outline);
  const xs = pts.map(([x]) => x);
  const zs = pts.map(([, z]) => z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  // The middle the elevations are laid from: the storeys above the ground.
  const { x: cx, z: cz } = buildingCentre(building.floors);
  const width = x1 - x0;
  const depth = z1 - z0;
  const ground = building.floors[0]?.level ?? 0;
  const top = building.model.extent.yMax;
  const height = top - ground;
  const aspect = frame.width / frame.height;
  const span = Math.max(width, depth, height);
  const base = { width: frame.width, height: frame.height, exposure: 0.62, ao: true };
  const views: BuildingView[] = [];

  const aerial = (id: string, title: string, sx: number, sz: number, azimuthDeg: number) =>
    views.push({
      id,
      title,
      payload: {
        ...base,
        camera: {
          position: { x: cx + sx * span * 1.25, y: ground + span * 1.05, z: cz + sz * span * 1.25 },
          target: { x: cx, y: ground + height * 0.42, z: cz },
          fovDeg: 34,
        },
        sun: { azimuthDeg, elevationDeg: 40 },
      },
    });
  aerial("aerial-se", "מבט על — דרום מזרח", 1, 1, 225);
  // The cover's picture: upright, as the cover frames it, from lower down.
  views.push({
    id: "hero",
    title: "שער",
    payload: {
      ...base,
      width: 1600,
      height: 2000,
      camera: {
        position: { x: cx + span * 0.95, y: ground + span * 0.55, z: cz + span * 1.25 },
        target: { x: cx, y: ground + height * 0.48, z: cz },
        fovDeg: 40,
      },
      sun: { azimuthDeg: 225, elevationDeg: 38 },
    },
  });
  aerial("aerial-nw", "מבט על — צפון מערב", -1, -1, 250);

  // Elevations: square to the face, parallel. Where the sheet's frame is
  // known the render is drawn in it — the same metres across and the same
  // levels top and bottom — so the two are the same picture; otherwise the
  // whole building is framed. The camera stands a building and a half off:
  // a parallel view looks the same from any distance, and four spans out
  // stood it in the sky's haze, which greyed the whole face.
  const elevation = (id: string, title: string, dir: { x: number; z: number }, faceWidth: number, azimuthDeg: number) => {
    const sheet = elevationFrames[id];
    const half = sheet ? sheet.widthM / 2 : Math.max((faceWidth / 2) * 1.12, ((height / 2) * 1.12) * aspect);
    const midY = sheet ? (sheet.bottomM + sheet.topM) / 2 : ground + height / 2;
    const heightPx = sheet ? Math.round((frame.width * (sheet.topM - sheet.bottomM)) / sheet.widthM) : frame.height;
    const far = span * 1.6;
    views.push({
      id,
      title,
      payload: {
        ...base,
        height: heightPx,
        camera: {
          position: { x: cx + dir.x * far, y: midY, z: cz + dir.z * far },
          target: { x: cx, y: midY, z: cz },
          fovDeg: 30,
          orthoHalfWidth: half,
          groundBand: 0,
        },
        // Raking, 45° across the face, so terraces and reveals cast their shadows.
        sun: { azimuthDeg, elevationDeg: 32 },
        // Square on, pale stone takes more light than the plates' exposure allows.
        exposure: 0.5,
      },
    });
  };
  elevation("elev-south", "חזית דרומית", { x: 0, z: 1 }, width, 225);
  elevation("elev-east", "חזית מזרחית", { x: 1, z: 0 }, depth, 135);
  elevation("elev-north", "חזית צפונית", { x: 0, z: -1 }, width, 315);
  elevation("elev-west", "חזית מערבית", { x: -1, z: 0 }, depth, 225);

  // Each storey from above, the building over it cut away — framed on its
  // own sheet, so the render and the drawing are the same picture.
  for (const f of building.floors) {
    if (f.roof) continue;
    const name = f.units.length ? `קומה ${levelText(f.level)} — דירות ${f.units.join(", ")}` : `קומה ${levelText(f.level)}`;
    views.push({ id: `plan-${f.id}`, title: name, payload: planPayload(f, frame.width) });
  }
  return views;
}

export function levelText(level: number): string {
  return `${level >= 0 ? "+" : "−"}${Math.abs(level).toFixed(2)}`;
}

/**
 * A storey from straight above, framed on its sheet: the frame's middle is the
 * sheet's middle moved into the building's frame, its half width the sheet's,
 * and its height the sheet's proportion of the width.
 */
export function planPayload(f: BuildingFloorMeta, widthPx: number): Omit<BuildingRenderPayload, "model"> {
  const w = f.sheetWidth / DWF_FLOOR_UNITS_PER_METRE;
  const h = f.sheetHeight / DWF_FLOOR_UNITS_PER_METRE;
  const cx = w / 2 + f.shift.x;
  const cz = h / 2 + f.shift.y;
  return {
    width: widthPx,
    height: Math.round((widthPx * h) / w),
    exposure: 0.62,
    ao: true,
    camera: {
      position: { x: cx, y: f.level + 80, z: cz + 0.001 },
      target: { x: cx, y: f.level, z: cz },
      fovDeg: 30,
      orthoHalfWidth: w / 2,
      up: { x: 0, y: 0, z: -1 },
      cutAboveM: f.level + 1.3,
      // The sheet draws the floor alone: no ground round it, no roof over it.
      hideTags: ["roof", "site"],
    },
    // High, so a wall's shadow is a soft edge along it rather than half the room.
    sun: { azimuthDeg: 200, elevationDeg: 76 },
  };
}
