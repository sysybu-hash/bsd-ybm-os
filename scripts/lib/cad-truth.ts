/**
 * What the Pisga code consumes by layer name — the ground truth the layer-mapping prototype is scored against.
 * Where a kind is "wall", either wall-ext or wall-int is right. Only for the Pisga drawings.
 */
export type Truth = { kind: string; why: string };
export const PISGA_TRUTH: Array<[RegExp, Truth]> = [
  [/^קיר (בטון|בלוק)/, { kind: "wall", why: "pisga-dxf.ts WALL: the walls' bands" }],
  [/^אדום/, { kind: "wall", why: "booklet-pisga-dxf.ts draws it as a wall (red pen)" }],
  [/^(רהיטים|furniture)/, { kind: "furniture", why: "pisga-dxf.ts: FINE pen + isFurn" }],
  [/^כלים סניטריים/, { kind: "sanitary", why: "pisga-dxf.ts: fixtures" }],
  [/TRESPA/i, { kind: "wall-int", why: "pisga-dxf.ts: the WC stalls' partitions (an xref layer)" }],
  [/^TNUA$/, { kind: "parking", why: "pisga-dxf.ts: the car-park bays' lines" }],
  [/^מבט דק/, { kind: "stairs", why: "pisga-dxf.ts: the emergency stair's 1.2 m treads" }],
  [/^מדרגוט/, { kind: "stairs", why: "pisga-stairs.ts: stair runs by layer" }],
  [/^חלון/, { kind: "window", why: "booklet-pisga-dxf.ts: drawn as windows" }],
  [/^(דלטוט|A-DOR)/, { kind: "door", why: "booklet-pisga-dxf.ts: drawn as doors" }],
  [/^מילוי/, { kind: "paving", why: "pisga-dxf.ts / pisga-surfaces.ts: the ground fill (the car park's asphalt)" }],
  [/^טקסט/, { kind: "text", why: "booklet-pisga-dxf.ts skips it as text" }],
  [/^מידה/, { kind: "dimension", why: "booklet-pisga-dxf.ts skips it as dimensions" }],
];
/**
 * Wolf seminar, the five plan files (tochnit *.dxf) only — the elevation file (chazitot) uses WALL/mb for other things and has no truth here.
 * What wolf-model.mts reads by layer name: WALL (the walls), WIN (the glazing lines), 00-madregot (the stairs' treads); the slab edge on
 * "mabat"/"strip" was read off these DXFs and the architect's elevation (it is the projecting edge, not a wall); RIHUT holds the furniture
 * blocks (CHAIR3, CISE-BAR, couches, table). Nothing ambiguous is listed: HID (door leaves among hidden lines), SIN, D/D1 are left out.
 */
export const WOLF_TRUTH: Array<[RegExp, Truth]> = [
  [/^WALL$/, { kind: "wall", why: "wolf-model.mts: the wall bands" }],
  [/^WIN$/, { kind: "window", why: "wolf-model.mts: the glazing lines (WIN)" }],
  [/^00-madregot$/, { kind: "stairs", why: "wolf-model.mts: stairLines" }],
  [/^mabat$|^strip$/, { kind: "overhead", why: "read off the plan and elevation: the projecting slab edge (r 19.2); 00-mabat is left out, it also holds accessibility marks" }],
  [/^RIHUT$/, { kind: "furniture", why: "blocks CHAIR3 / CISE-BAR / couches / table" }],
];
/**
 * The Gottlieb house drawings: GOTTLIEB_ARCHITECT_PROFILE in cad-layers.ts, written from scripts/_dwg-truth against the sheets
 * (the gate's name rule uses the GENERIC profile only, never this one).
 */
export const GOTTLIEB_TRUTH: Array<[RegExp, Truth]> = [
  [/^00-WL$/, { kind: "wall-ext", why: "GOTTLIEB profile: outer walls" }],
  [/^00-WL pnimi$/, { kind: "wall-int", why: "GOTTLIEB profile: inner walls" }],
  [/^00-dor$/, { kind: "door", why: "GOTTLIEB profile: doors" }],
  [/^00-win$/, { kind: "window", why: "GOTTLIEB profile: windows" }],
  [/^00-m-yarok$/, { kind: "lawn", why: "GOTTLIEB profile: lawn" }],
  [/^צ.?$/, { kind: "fence", why: "GOTTLIEB profile: fences" }],
  [/^00-madregot$/, { kind: "stairs", why: "GOTTLIEB profile: stairs" }],
  [/^00-mabat$/, { kind: "overhead", why: "GOTTLIEB profile: the upper floor's outline over the ground floor" }],
  [/^00-SAN$/, { kind: "sanitary", why: "GOTTLIEB profile: sanitary" }],
  [/^(fair|קו מגרש)$/, { kind: "plot", why: "GOTTLIEB profile: the plot line" }],
  [/^00-text$/, { kind: "text", why: "GOTTLIEB profile: text" }],
];
/** The truth for a mapper out dir, by its name prefix: pisga*, wolf-tochnit*, gottlieb*. Others (the elevation file) have none. */
export const truthFor = (dir: string, name: string): Truth | null => {
  const table = /^pisga/.test(dir) ? PISGA_TRUTH : /^wolf-tochnit/.test(dir) ? WOLF_TRUTH : /^gottlieb/.test(dir) ? GOTTLIEB_TRUTH : [];
  return table.find(([re]) => re.test(name))?.[1] ?? null;
};
export const truthOf = (name: string): Truth | null => PISGA_TRUTH.find(([re]) => re.test(name))?.[1] ?? null;
export const sameKind = (got: string | null | undefined, truth: string) => (truth === "wall" ? got === "wall-ext" || got === "wall-int" : got === truth);
