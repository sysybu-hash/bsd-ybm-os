/**
 * The compass a building's plans are drawn to.
 *
 * The model's frame is the plan's: x to the sheet's right, z down it. A
 * plan's side is named here as if north were up the sheet — "south" its
 * bottom, "east" its right — and those names key the geometry: which face an
 * opening is on, which way a camera looks. Where true north points on the
 * sheet is the project's own: `north` is that direction in the model's frame.
 * Every name a reader sees is turned by it; the geometry never is.
 */
export type Side = "north" | "south" | "east" | "west";

export type North = { x: number; z: number };

/** North up the sheet: a plan's side is its compass side. */
export const PLAN_NORTH: North = { x: 0, z: -1 };

export const SIDE_VECTOR: Record<Side, { x: number; z: number }> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

const SIDES: Side[] = ["north", "east", "south", "west"];

/** The compass bearing of a direction in the model's frame: degrees clockwise from true north. */
export function bearingOf(dir: { x: number; z: number }, north: North = PLAN_NORTH): number {
  const n = Math.hypot(north.x, north.z) || 1;
  const [nx, nz] = [north.x / n, north.z / n];
  // A quarter turn clockwise from north, as the sheet is seen from above (z down): east.
  const [ex, ez] = [-nz, nx];
  const deg = (Math.atan2(dir.x * ex + dir.z * ez, dir.x * nx + dir.z * nz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The direction in the model's frame a compass bearing points. */
export function directionOf(bearingDeg: number, north: North = PLAN_NORTH): { x: number; z: number } {
  const n = Math.hypot(north.x, north.z) || 1;
  const [nx, nz] = [north.x / n, north.z / n];
  const [ex, ez] = [-nz, nx];
  const a = (bearingDeg * Math.PI) / 180;
  return { x: nx * Math.cos(a) + ex * Math.sin(a), z: nz * Math.cos(a) + ez * Math.sin(a) };
}

/** The compass side a plan's side looks to. */
export function trueSide(planSide: Side, north: North = PLAN_NORTH): Side {
  return SIDES[Math.round(bearingOf(SIDE_VECTOR[planSide], north) / 90) % 4]!;
}

/** The plan's side that looks to a compass side. */
export function planSide(compassSide: Side, north: North = PLAN_NORTH): Side {
  return (Object.keys(SIDE_VECTOR) as Side[]).find((s) => trueSide(s, north) === compassSide)!;
}

export const FACADE_TITLES: Record<Side, string> = { south: "חזית דרומית", west: "חזית מערבית", north: "חזית צפונית", east: "חזית מזרחית" };

/** The title of the elevation of a plan's side, as the architect names it. */
export function facadeTitle(side: Side, north: North = PLAN_NORTH): string {
  return FACADE_TITLES[trueSide(side, north)];
}

/** The plan's side an elevation's title names, or null where it names none. */
export function sideOfTitle(title: string, north: North = PLAN_NORTH): Side | null {
  const named = (Object.keys(FACADE_TITLES) as Side[]).find((s) => title.includes(FACADE_TITLES[s].replace("חזית ", "")));
  return named ? planSide(named, north) : null;
}

const POINTS = ["צפון", "צפון־מזרח", "מזרח", "דרום־מזרח", "דרום", "דרום־מערב", "מערב", "צפון־מערב"];

/** The compass point (of eight) a direction in the model's frame points to: "דרום־מזרח". */
export function pointOf(dir: { x: number; z: number }, north: North = PLAN_NORTH): string {
  return POINTS[Math.round(bearingOf(dir, north) / 45) % 8]!;
}

/** "מדרום־מזרח": seen from that point. */
export function fromPoint(dir: { x: number; z: number }, north: North = PLAN_NORTH): string {
  return `מ${pointOf(dir, north)}`;
}

/** "דרום": a compass side in words; "בדרום", "הדרומית" as the sentence needs. */
export const SIDE_WORDS: Record<Side, { name: string; in: string; from: string; adj: string }> = {
  north: { name: "צפון", in: "בצפון", from: "מצפון", adj: "הצפונית" },
  south: { name: "דרום", in: "בדרום", from: "מדרום", adj: "הדרומית" },
  east: { name: "מזרח", in: "במזרח", from: "ממזרח", adj: "המזרחית" },
  west: { name: "מערב", in: "במערב", from: "ממערב", adj: "המערבית" },
};

/**
 * How a reader is told the sides. By the compass where true north is known —
 * the project's own or the plan's arrow. Where it is not, a guess of north
 * named the same front "south" in one booklet and "east" in the next; so the
 * sides are named from the street instead, which the plot itself shows: the
 * street front, the back, and the sides on the right and left of one who
 * stands in the street facing the house.
 */
export type Naming = { by: "compass"; north: North } | { by: "street"; street: Side };

type Relative = "front" | "back" | "right" | "left";

/** Where a plan's side is, seen from the street facing the house. */
function relativeSide(side: Side, street: Side): Relative {
  const s = SIDE_VECTOR[street];
  const v = SIDE_VECTOR[side];
  if (v.x === s.x && v.z === s.z) return "front";
  if (v.x === -s.x && v.z === -s.z) return "back";
  // Facing the house is facing -s; on the sheet (z down) the right hand of a direction d is (-d.z, d.x).
  const right = { x: s.z, z: -s.x };
  return v.x === right.x && v.z === right.z ? "right" : "left";
}

const RELATIVE_TITLES: Record<Relative, string> = { front: "חזית רחוב", back: "חזית אחורית", right: "חזית צד ימין", left: "חזית צד שמאל" };
const RELATIVE_WORDS: Record<Relative, { name: string; in: string; from: string; adj: string }> = {
  front: { name: "הרחוב", in: "בצד הרחוב", from: "מצד הרחוב", adj: "שבצד הרחוב" },
  back: { name: "האחור", in: "מאחור", from: "מאחור", adj: "האחורית" },
  right: { name: "צד ימין", in: "בצד ימין", from: "מצד ימין", adj: "הימנית" },
  left: { name: "צד שמאל", in: "בצד שמאל", from: "מצד שמאל", adj: "השמאלית" },
};

/** The title of a plan's side's elevation, as the reader is told the sides. */
export function sideTitle(side: Side, naming: Naming): string {
  return naming.by === "compass" ? facadeTitle(side, naming.north) : RELATIVE_TITLES[relativeSide(side, naming.street)];
}

/** A plan's side in words, as the reader is told the sides: "בדרום" or "בצד הרחוב". */
export function sideWords(side: Side, naming: Naming): { name: string; in: string; from: string; adj: string } {
  return naming.by === "compass" ? SIDE_WORDS[trueSide(side, naming.north)] : RELATIVE_WORDS[relativeSide(side, naming.street)];
}

/** Where a view is taken from, a direction in the model's frame: "מדרום־מזרח", or "מצד הרחוב, מימין". */
export function viewFrom(dir: { x: number; z: number }, naming: Naming): string {
  if (naming.by === "compass") return fromPoint(dir, naming.north);
  const s = SIDE_VECTOR[naming.street];
  const right = { x: s.z, z: -s.x };
  const front = dir.x * s.x + dir.z * s.z;
  const across = dir.x * right.x + dir.z * right.z;
  const along = front > 0.01 ? "מצד הרחוב" : front < -0.01 ? "מאחור" : "";
  const aside = across > 0.01 ? "מימין" : across < -0.01 ? "משמאל" : "";
  return [along, aside].filter(Boolean).join(", ") || "מלמעלה";
}
