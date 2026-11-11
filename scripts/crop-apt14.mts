import { readFileSync } from "node:fs";

import { sealDxfWallsForFlood } from "@/lib/projects/dxf-seal-openings";
import { cropGeometryToUnit } from "@/lib/projects/dxf-unit-crop";
import { geometryFromDxf } from "@/lib/projects/floorplan-dxf";

const file = "מערכת הדמיות/ויינברג/קבצים/מכר סופי 29.10.26.dxf";
const geometry = await geometryFromDxf(readFileSync(file));
if (!geometry) {
  console.log(JSON.stringify({ ok: false, reason: "no geometry" }));
  process.exit(1);
}
const mark = geometry.unitMarks?.find((item) => item.number === 14);
const units = geometry.unitsPerMetre ?? 1;
const seal = sealDxfWallsForFlood(geometry.walls, [], geometry.openingMarks ?? [], units);
const nearDoor = seal.bridges
  .filter((bridge) => bridge.reason !== "draft")
  .map((bridge) => {
    const x = bridge.orientation === "h" ? (bridge.from + bridge.to) / 2 : bridge.centre;
    const y = bridge.orientation === "h" ? bridge.centre : (bridge.from + bridge.to) / 2;
    return {
      reason: bridge.reason,
      spanM: Math.round(((bridge.to - bridge.from) / units) * 100) / 100,
      dM: mark ? Math.round((Math.hypot(x - mark.x, y - mark.y) / units) * 100) / 100 : null,
    };
  })
  .sort((a, b) => (a.dM ?? 99) - (b.dM ?? 99))
  .slice(0, 6);
const markFit = (geometry.openingMarks ?? [])
  .map((opening) => {
    let best = Infinity;
    for (const body of seal.walls) {
      const along = body.orientation === "h" ? opening.x : opening.y;
      const across = body.orientation === "h" ? Math.abs(opening.y - body.centre) : Math.abs(opening.x - body.centre);
      if (along < body.from - units || along > body.to + units) continue;
      best = Math.min(best, across);
    }
    return {
      dM: mark ? Math.round((Math.hypot(opening.x - mark.x, opening.y - mark.y) / units) * 100) / 100 : null,
      acrossM: best === Infinity ? null : Math.round((best / units) * 100) / 100,
      wM: opening.width ? Math.round((opening.width / units) * 100) / 100 : null,
    };
  })
  .filter((opening) => (opening.dM ?? 99) < 3)
  .sort((a, b) => (a.dM ?? 99) - (b.dM ?? 99));
const nearMarks = (geometry.openingMarks ?? [])
  .map((opening) => ({
    dM: mark ? Math.round((Math.hypot(opening.x - mark.x, opening.y - mark.y) / units) * 100) / 100 : null,
    wM: opening.width ? Math.round((opening.width / units) * 100) / 100 : null,
  }))
  .filter((opening) => (opening.dM ?? 99) < 3)
  .sort((a, b) => (a.dM ?? 99) - (b.dM ?? 99));
const cropped = cropGeometryToUnit(geometry, 14);
const span = (segments: Array<{ x1: number; x2: number; y1: number; y2: number }>) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of segments) {
    x0 = Math.min(x0, s.x1, s.x2);
    y0 = Math.min(y0, s.y1, s.y2);
    x1 = Math.max(x1, s.x1, s.x2);
    y1 = Math.max(y1, s.y1, s.y2);
  }
  return { x0, y0, x1, y1 };
};
const whole = span(geometry.segments);
const part = cropped ? span(cropped.segments) : null;
console.log(JSON.stringify({
  unitsM: geometry.cad?.unitsM,
  unitsFrom: geometry.cad?.unitsFrom,
  unitsPerMetre: geometry.unitsPerMetre,
  marks: geometry.unitMarks?.map((m) => m.number).sort((a, b) => a - b),
  polygons: geometry.unitPolygons?.map((p) => p.number),
  nearMarks,
  markFit,
  nearDoor,
  wholeM: { w: (whole.x1 - whole.x0) / units, d: (whole.y1 - whole.y0) / units },
  cropped: cropped
    ? {
        segments: cropped.segments.length,
        walls: cropped.walls.length,
        has14: cropped.unitMarks?.some((m) => m.number === 14) ?? false,
        marks: cropped.unitMarks?.map((m) => m.number),
        sizeM: { w: (part!.x1 - part!.x0) / units, d: (part!.y1 - part!.y0) / units },
      }
    : null,
}));
