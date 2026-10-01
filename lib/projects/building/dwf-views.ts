import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import type { BuildingModel } from "@/lib/projects/building/model";
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
): BuildingView[] {
  const pts = building.floors.flatMap((f) => f.outline);
  const xs = pts.map(([x]) => x);
  const zs = pts.map(([, z]) => z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
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

  // Elevations: square to the face, parallel, the whole height and width in frame.
  const elevation = (id: string, title: string, dir: { x: number; z: number }, faceWidth: number, azimuthDeg: number) => {
    const half = Math.max((faceWidth / 2) * 1.12, ((height / 2) * 1.12) * aspect);
    const far = span * 4;
    views.push({
      id,
      title,
      payload: {
        ...base,
        camera: {
          position: { x: cx + dir.x * far, y: ground + height / 2, z: cz + dir.z * far },
          target: { x: cx, y: ground + height / 2, z: cz },
          fovDeg: 30,
          orthoHalfWidth: half,
          groundBand: 0,
        },
        sun: { azimuthDeg, elevationDeg: 38 },
        // Square to the sun's face, pale stone washes out at the plates' exposure.
        exposure: 0.5,
      },
    });
  };
  elevation("elev-south", "חזית דרומית", { x: 0, z: 1 }, width, 180);
  elevation("elev-east", "חזית מזרחית", { x: 1, z: 0 }, depth, 110);
  elevation("elev-north", "חזית צפונית", { x: 0, z: -1 }, width, 300);
  elevation("elev-west", "חזית מערבית", { x: -1, z: 0 }, depth, 250);

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
    sun: { azimuthDeg: 200, elevationDeg: 60 },
  };
}
