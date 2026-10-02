import type { BuildingMaterial, BuildingModel, Primitive } from "@/lib/projects/building/model";
import type { BuildingRenderPayload } from "@/lib/projects/building/render-page";

/**
 * A plan's cut, made in the geometry rather than by a clipping plane.
 *
 * The rasteriser cuts a floor with a plane; the path tracer clips nothing, so
 * a traced plan needs the model itself cut: every volume stopped at the
 * height, everything wholly above it gone. A wall the cut passes through
 * shows its section solid, as a plan draws a wall — the poche the reader
 * reads the rooms by.
 */
const WALLS = new Set<BuildingMaterial>(["plaster", "stone", "stoneDeep", "render", "concrete", "stoneDark"]);

export function cutModel(model: BuildingModel, cutM: number): BuildingModel {
  const out: Primitive[] = [];
  for (const p of model.primitives) {
    if (p.type === "box") {
      const bottom = p.centre.y - p.size.y / 2;
      const top = p.centre.y + p.size.y / 2;
      if (bottom >= cutM) continue;
      if (top <= cutM) {
        out.push(p);
        continue;
      }
      const h = cutM - bottom;
      out.push({ ...p, centre: { ...p.centre, y: bottom + h / 2 }, size: { ...p.size, y: h } });
      const wall = WALLS.has(p.material) && !(p.tag ?? "").includes(":inside:") && Math.min(p.size.x, p.size.z) < 0.6 && p.size.y > 1;
      if (wall) out.push({ type: "box", centre: { ...p.centre, y: cutM + 0.004 }, size: { x: p.size.x + 0.002, y: 0.008, z: p.size.z + 0.002 }, material: "poche", tag: `${p.tag ?? ""}:poche`, ...(p.rotY ? { rotY: p.rotY } : {}) });
    } else if (p.type === "prism") {
      if (p.y0 >= cutM) continue;
      out.push(p.y1 <= cutM ? p : { ...p, y1: cutM });
    } else if (p.type === "cylinder") {
      const bottom = p.centre.y - p.height / 2;
      if (bottom >= cutM) continue;
      const top = Math.min(cutM, p.centre.y + p.height / 2);
      out.push({ ...p, centre: { ...p.centre, y: (bottom + top) / 2 }, height: top - bottom });
    } else if (p.type === "terrain") {
      out.push(p);
    } else if (p.type === "tree" || p.type === "car" || p.type === "person" || p.type === "plant") {
      if (p.at.y < cutM) out.push(p);
    } else if (p.type === "text") {
      if (p.at.y < cutM) out.push(p);
    }
  }
  return { ...model, primitives: out };
}

/** Where a plan's cut stands above its floor (planPayload). */
const PLAN_CUT_M = 1.3;

function topOf(p: Primitive): number {
  switch (p.type) {
    case "box":
      return p.centre.y + p.size.y / 2;
    case "prism":
      return p.y1;
    case "cylinder":
      return p.centre.y + p.height / 2;
    case "terrain":
      return Math.max(...p.heights);
    case "tree":
    case "plant":
    case "car":
    case "person":
    case "text":
      return p.at.y + 1;
  }
}

/** A traced frame of a cut plan: the cut moved into the geometry. */
export function forTracing(payload: BuildingRenderPayload): BuildingRenderPayload {
  if (!payload.pathTrace) return payload;
  if (payload.camera.cutAboveM != null) return asCutPlan(payload);
  // From outside, the apartments' furnishings are a glimpse through dark
  // glass, and with them in the scene the tracer lost its sky — every
  // elevation came back on black. They are left out of an outside view.
  return { ...payload, model: { ...payload.model, primitives: payload.model.primitives.filter((p) => !(p.tag ?? "").includes(":inside:")) } };
}

/** A plan with its cut in the geometry, the storey alone on a white sheet — traced or not. */
export function asCutPlan(payload: BuildingRenderPayload): BuildingRenderPayload {
  const cut = payload.camera.cutAboveM;
  if (cut == null) return payload;
  const { cutAboveM: _cut, ...camera } = payload.camera;
  // The storey alone, on a white sheet: the floors below are not the plan,
  // and the tower's shadow over the ground below was the darkest thing on it.
  const level = cut - PLAN_CUT_M;
  const cutAway = cutModel(payload.model, cut);
  const storey = cutAway.primitives.filter((p) => topOf(p) > level - 0.45);
  const { x, z, width, depth } = payload.model.extent;
  const span = Math.max(width, depth) * 4;
  storey.push({ type: "box", centre: { x: x + width / 2, y: level - 0.6, z: z + depth / 2 }, size: { x: span, y: 0.02, z: span }, material: "ceiling", tag: "sheet" });
  return { ...payload, model: { ...cutAway, primitives: storey }, camera: { ...camera, studio: true } };
}
