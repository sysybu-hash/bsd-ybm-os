import type { Outline } from "@/lib/projects/building/assemble";
import { FACADE_TITLES } from "@/lib/projects/building/compass";
import type { ElevationFrame } from "@/lib/projects/building/elevation-frame";
import { askDrawing } from "@/lib/projects/building/house-ai";
import { pageRight, type ElevationLevels, type Side } from "@/lib/projects/building/house-levels";
import type { Primitive } from "@/lib/projects/building/model";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

/**
 * Which face each elevation draws, proposed by the vision model and held to
 * what the sheets themselves say.
 *
 * A facade sheet may title none of its drawings. The model looks at them and
 * at the ground floor plan and names each one's face; the names stand only
 * if the drawings agree: a front or back elevation is as wide as the plan
 * runs east to west, a side one as deep as it runs north to south; a side
 * elevation has the parking the plan puts on the street at the end its face
 * puts the street; and the land falls the same way on every elevation once
 * each is turned to its face.
 *
 * Faces here are the plan's sides (compass.ts): "south" the plan's bottom,
 * whatever its compass point. Their titles are the compass's.
 */
export const FACE_TITLES: Record<Side, string> = FACADE_TITLES;

export type FaceFacts = {
  /** The building's width on the drawing, metres, from its outline. */
  widthM: number | null;
  /** Where the drawing writes "חניה", either side of the building's middle. */
  parkingSide: "left" | "right" | null;
  /** The lowest verified mark off each end of the building: the land there. */
  landLeft: number | null;
  landRight: number | null;
  /** The verified marks under ±0.00 anywhere on the drawing: a side face's land. */
  landAll: number | null;
};

export type PlanFacts = { widthX: number; depthZ: number; front: Side | null };

export type FaceProposal = { face: Side; lowEnd?: "left" | "right" | "level" };

export type FaceVerdict = { ok: boolean; checks: string[]; failures: string[] };

const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };
const alongX = (f: Side) => f === "south" || f === "north";
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : null;
};

/** What a drawing itself says about where it stands: its width, its parking, its land at either end. */
export function faceFacts(g: DwfGeometry, frame: Pick<ElevationFrame, "left" | "right" | "centreX"> | null, levels: ElevationLevels | null, upm = DWF_FLOOR_UNITS_PER_METRE): FaceFacts {
  const parking = frame ? g.texts.filter((t) => /חניה/.test(t.text)).map((t) => t.x) : [];
  const px = median(parking);
  const marks = levels?.ok ? levels.marks : [];
  const low = (ms: typeof marks) => (ms.length ? Math.min(...ms.map((m) => m.rel)) : null);
  const land = marks.filter((m) => m.rel < 0.5);
  return {
    widthM: frame ? (frame.right - frame.left) / upm : null,
    parkingSide: px == null || !frame ? null : px < frame.left ? "left" : px > frame.right ? "right" : null,
    landLeft: frame ? low(land.filter((m) => m.x < frame.left - 0.3 * upm)) : null,
    landRight: frame ? low(land.filter((m) => m.x > frame.right + 0.3 * upm)) : null,
    landAll: median(marks.filter((m) => m.rel < 0).map((m) => m.rel)),
  };
}

/** The plan's width east to west, its depth north to south, and the side its parked cars face. */
export function planFacts(outlines: Outline[], primitives: Primitive[]): PlanFacts {
  const xs = outlines.flatMap((o) => o.map(([x]) => x));
  const zs = outlines.flatMap((o) => o.map(([, z]) => z));
  const [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const cars = primitives.flatMap((p) => (p.type === "car" ? [p.at] : []));
  let front: Side | null = null;
  if (cars.length) {
    const dx = cars.reduce((s, c) => s + c.x, 0) / cars.length - cx;
    const dz = cars.reduce((s, c) => s + c.z, 0) / cars.length - cz;
    front = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? "south" : "north") : dx > 0 ? "east" : "west";
  }
  return { widthX: Math.max(...xs) - Math.min(...xs), depthZ: Math.max(...zs) - Math.min(...zs), front };
}

/** The proposed faces, checked against the drawings and the plan. */
export function verifyFaces(proposal: Array<FaceProposal | null>, facts: FaceFacts[], plan: PlanFacts): FaceVerdict {
  const checks: string[] = [];
  const failures: string[] = [];
  const faces = proposal.map((p) => p?.face ?? null);
  faces.forEach((f, i) => {
    if (!f) failures.push(`drawing ${i + 1}: no face proposed`);
    else if (faces.indexOf(f) !== i) failures.push(`drawing ${i + 1}: ${f} proposed twice`);
  });
  if (failures.length) return { ok: false, checks, failures };

  // Width: a front or back is the plan's east–west, a side its north–south.
  if (Math.abs(plan.widthX - plan.depthZ) >= 1) {
    facts.forEach((f, i) => {
      if (f.widthM == null) return;
      const ex = Math.abs(f.widthM - plan.widthX) / plan.widthX;
      const ez = Math.abs(f.widthM - plan.depthZ) / plan.depthZ;
      const x = ex < ez;
      const tag = `drawing ${i + 1} (${faces[i]}): ${f.widthM.toFixed(1)} m wide, the plan ${plan.widthX.toFixed(1)} × ${plan.depthZ.toFixed(1)}`;
      if (x === alongX(faces[i]!) && Math.min(ex, ez) < 0.12) checks.push(tag);
      else failures.push(tag);
    });
  }

  // Parking: a side face has the plan's street at the end the face puts it.
  if (plan.front) {
    facts.forEach((f, i) => {
      const face = faces[i]!;
      if (f.parkingSide == null || alongX(face) === alongX(plan.front!)) return;
      const right = pageRight(face);
      const expected = plan.front === right ? "right" : plan.front === OPPOSITE[right] ? "left" : null;
      const tag = `drawing ${i + 1} (${face}): parking drawn on its ${f.parkingSide}, the plan's street (${plan.front}) on its ${expected}`;
      if (expected === f.parkingSide) checks.push(tag);
      else failures.push(tag);
    });
  }

  // Land: each end of a front or back is a side of the plot; every one must fall the same way.
  const estimates: Record<Side, Array<{ i: number; v: number }>> = { north: [], south: [], east: [], west: [] };
  facts.forEach((f, i) => {
    const face = faces[i]!;
    if (!alongX(face)) return;
    const right = pageRight(face);
    if (f.landLeft != null) estimates[OPPOSITE[right]].push({ i, v: f.landLeft });
    if (f.landRight != null) estimates[right].push({ i, v: f.landRight });
  });
  const fall = facts.map((f, i) => {
    if (!alongX(faces[i]!) || f.landLeft == null || f.landRight == null || Math.abs(f.landRight - f.landLeft) < 0.3) return 0;
    const eastHigher = (pageRight(faces[i]!) === "east") === f.landRight > f.landLeft;
    return eastHigher ? 1 : -1;
  });
  const ways = new Set(fall.filter((v) => v !== 0));
  if (ways.size > 1) failures.push(`the land falls east on one front elevation and west on another`);
  else if (fall.filter((v) => v !== 0).length >= 2) checks.push(`the land falls the same way on ${fall.filter((v) => v !== 0).length} elevations`);
  facts.forEach((f, i) => {
    const face = faces[i]!;
    if (alongX(face) || f.landAll == null) return;
    const own = median(estimates[face].filter((e) => e.i !== i).map((e) => e.v));
    const other = median(estimates[OPPOSITE[face]].filter((e) => e.i !== i).map((e) => e.v));
    if (own == null || other == null || Math.abs(own - other) < 0.5) return;
    const tag = `drawing ${i + 1} (${face}): its land at ${f.landAll.toFixed(2)}, the ${face} ends of the others at ${own.toFixed(2)}, the ${OPPOSITE[face]} at ${other.toFixed(2)}`;
    if (Math.abs(f.landAll - own) < Math.abs(f.landAll - other)) checks.push(tag);
    else failures.push(tag);
  });

  // The model's own reading of the slope, against the marks.
  proposal.forEach((p, i) => {
    const f = facts[i]!;
    if (!p?.lowEnd || p.lowEnd === "level" || f.landLeft == null || f.landRight == null || Math.abs(f.landRight - f.landLeft) < 0.3) return;
    const low = f.landLeft < f.landRight ? "left" : "right";
    if (p.lowEnd !== low) failures.push(`drawing ${i + 1}: the model reads the land low on the ${p.lowEnd}, the marks on the ${low}`);
  });

  return { ok: failures.length === 0 && checks.length >= 3, checks, failures };
}

/*
 * The model is asked for the plan's sides — its bottom, left, top, right —
 * not for compass points: the plan's north arrow is the project's, and a
 * model told "north is up" names the faces in the sheet's frame and calls
 * that the compass. The sides are this file's frame (compass.ts): the
 * bottom is "south".
 */
const PLAN_SIDE: Record<string, Side> = { bottom: "south", left: "west", top: "north", right: "east" };

const FACES_PROMPT = (n: number) => `The first ${n} pictures are the elevations of one private house (a semi-detached pair) in Israel, drawn on one sheet top to bottom, in that order. The last picture is the same house's ground floor plan with its whole plot.
For each elevation decide which side of the PLAN PICTURE it is seen from: "bottom", "left", "top" or "right" — the side of the plan picture you would stand beyond, looking at the house. Answer by the picture's own sides, not by any compass or north arrow. Use the plan (where the street, the parking bays, the entrance gate and the garden are) and the elevations (parked cars, the street, the entrance and its stairs, how the land slopes, which end is higher).
Also give for each elevation "low_end": the end where the ground is lower — "left", "right" or "level".
Answer JSON only: {"elevations":[{"index":1,"side":"bottom","low_end":"left","why":"short reason"}],"missing":["sides of the plan no elevation is seen from"]}`;

/** The model's proposal for each elevation's face (the plan's side, compass.ts); null when no model answered. */
export async function proposeFaces(elevations: Buffer[], groundPlan: Buffer): Promise<{ proposal: Array<FaceProposal | null>; missing: Side[]; why: string[] } | null> {
  const answer = await askDrawing(FACES_PROMPT(elevations.length), [...elevations, groundPlan]);
  if (!answer || !Array.isArray(answer.elevations)) return null;
  const proposal: Array<FaceProposal | null> = elevations.map(() => null);
  const why: string[] = elevations.map(() => "");
  for (const raw of answer.elevations as Array<Record<string, unknown>>) {
    const i = Number(raw?.index) - 1;
    const face = PLAN_SIDE[String(raw?.side)];
    if (!Number.isInteger(i) || i < 0 || i >= elevations.length || !face) continue;
    const lowEnd = ["left", "right", "level"].includes(raw.low_end as string) ? (raw.low_end as FaceProposal["lowEnd"]) : undefined;
    proposal[i] = { face, lowEnd };
    why[i] = typeof raw.why === "string" ? raw.why : "";
  }
  const missing = Array.isArray(answer.missing) ? (answer.missing as unknown[]).flatMap((s) => (PLAN_SIDE[String(s)] ? [PLAN_SIDE[String(s)]!] : [])) : [];
  return { proposal, missing, why };
}
