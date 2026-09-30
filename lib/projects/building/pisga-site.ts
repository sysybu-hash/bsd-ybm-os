import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";

/**
 * מרכז פסג"ה — the stairs and the street, as the sheets draw them.
 *
 * Every figure here is read off a sheet, in the floor −1 sheet's metres:
 * the flights from their treads (findFlights on sheets 5 and 6, their
 * direction from which flight floor −2's cut shows), the street from the
 * plot's south line on the site plan and the bay lines drawn along it.
 */
type Levels = { floorMinus2: number; floorMinus1: number; roof: number; street: number };

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: BuildingMaterial, tag: string): Primitive => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  size: { x: Math.abs(x1 - x0), y: Math.abs(y1 - y0), z: Math.abs(z1 - z0) },
  material,
  tag,
});

/**
 * A straight flight as solid steps: `n` treads from `from` to `to` along one
 * axis, rising from `bottom` by `rise` each, each step a block down to `base`.
 */
function flight(opts: {
  along: "x" | "z";
  from: number;
  to: number;
  across: [number, number];
  n: number;
  bottom: number;
  rise: number;
  base: number;
  material: BuildingMaterial;
  tag: string;
}): Primitive[] {
  const out: Primitive[] = [];
  const run = (opts.to - opts.from) / opts.n;
  for (let k = 0; k < opts.n; k++) {
    const a = opts.from + k * run;
    const b = a + run;
    const top = opts.bottom + (k + 1) * opts.rise;
    out.push(
      opts.along === "x"
        ? box(a, b, opts.base, top, opts.across[0], opts.across[1], opts.material, opts.tag)
        : box(opts.across[0], opts.across[1], opts.base, top, a, b, opts.material, opts.tag),
    );
  }
  return out;
}

export function pisgaStairs(L: Levels): Primitive[] {
  const out: Primitive[] = [];

  // The lobby's open stair (sheets 5, 6): two flights of 13 treads, 30 cm,
  // between x 22.18 and 26.09. Floor −2's cut shows the north flight, so it
  // is the lower: it climbs west from the lobby to a landing, and the south
  // flight climbs back east onto floor −1.
  const lobbyRise = (L.floorMinus1 - L.floorMinus2) / 28;
  out.push(
    ...flight({ along: "x", from: 26.09, to: 22.18, across: [4.65, 6.05], n: 13, bottom: L.floorMinus2, rise: lobbyRise, base: L.floorMinus2, material: "stone", tag: "floor-2:inside:stair" }),
  );
  out.push(box(20.55, 22.18, L.floorMinus2 + 14 * lobbyRise - 0.3, L.floorMinus2 + 14 * lobbyRise, 4.65, 7.65, "stone", "floor-2:inside:stair"));
  // The upper flight on a folded plate, open beneath.
  for (let k = 0; k < 13; k++) {
    const a = 22.18 + (k * (26.09 - 22.18)) / 13;
    const top = L.floorMinus2 + (15 + k) * lobbyRise;
    out.push(box(a, a + (26.09 - 22.18) / 13, top - 0.28, top, 6.25, 7.65, "stone", "floor-2:inside:stair"));
  }
  // Glass balustrades: along the void's edge and between the flights.
  for (const z of [4.6, 6.15, 7.7]) out.push(box(22.18, 26.09, L.floorMinus2 + 1, L.floorMinus1 + 1.05, z - 0.01, z + 0.01, "glass", "floor-2:inside:stair"));

  // The stair core (sheet 5): one flight six metres wide, 14 treads of 31 cm,
  // from floor −1 at +12.77 up south to the entrance landing at +15.01.
  const coreRise = (15.01 - L.floorMinus1) / 14;
  out.push(...flight({ along: "z", from: 11.77, to: 16.12, across: [24.42, 30.43], n: 14, bottom: L.floorMinus1, rise: coreRise, base: L.floorMinus1, material: "stone", tag: "floor-1:inside:stair" }));
  out.push(box(24.42, 30.43, 14.7, 15.01, 16.12, 16.74, "stone", "floor-1:inside:stair"));

  // The main entrance from the street (sheets 3, 5): 14 treads of 31 cm the
  // same six metres wide, from the landing at +15.01 up to the street.
  const entryRise = (L.street + 0.05 - 15.01) / 14;
  out.push(...flight({ along: "z", from: 16.74, to: 21.1, across: [24.42, 30.43], n: 14, bottom: 15.01, rise: entryRise, base: 14.6, material: "stone", tag: "site:entry-stair" }));
  // Its side walls, stone, and the slab it stands on over the courtyard.
  for (const x of [24.22, 30.43]) out.push(box(x, x + 0.2, 8.2, L.street + 1.0, 16.58, 21.1, "stone", "site:entry-stair"));
  out.push(box(24.42, 30.43, 8.2, 14.6, 16.58, 21.1, "concrete", "site:entry-stair"));

  // The existing emergency stair on the west (sheet 5, "מדרגות חרום קיימות"):
  // 11 treads climbing south, a landing, 13 climbing north to floor −1's exit.
  const westBottom = L.floorMinus1 - 24 * 0.18;
  out.push(...flight({ along: "z", from: 12.18, to: 15.05, across: [-1.57, -0.36], n: 11, bottom: westBottom, rise: 0.18, base: westBottom - 0.4, material: "concrete", tag: "site:west-stair" }));
  out.push(box(-1.57, 0.93, westBottom - 0.4, westBottom + 12 * 0.18, 15.05, 16.6, "concrete", "site:west-stair"));
  out.push(...flight({ along: "z", from: 15.31, to: 11.92, across: [-0.37, 0.93], n: 13, bottom: westBottom + 11 * 0.18, rise: 0.18, base: westBottom - 0.4, material: "concrete", tag: "site:west-stair" }));
  out.push(box(-1.57, 0.93, westBottom - 0.4, L.floorMinus1, 10.4, 11.92, "concrete", "site:west-stair"));
  for (const x of [-1.62, 0.93]) out.push(box(x, x + 0.05, westBottom, L.floorMinus1 + 1.05, 10.4, 16.6, "metal", "site:west-stair"));
  return out;
}

/** The plot's south line on the site plan, west to east: the street runs along it. */
const PLOT_SOUTH: Array<[number, number]> = [
  [-16, 21.4],
  [-10.99, 21.27],
  [4.44, 20.92],
  [20.78, 21.77],
  [38.18, 24.0],
  [61.32, 29.41],
  [75, 32.6],
];

/** A band beside a polyline: between offsets a and b (metres, positive to the south), over x in [x0, x1]. */
function band(line: Array<[number, number]>, a: number, b: number, x0: number, x1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const at = (x: number): [number, number, number, number] => {
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!;
      const [bx, bz] = line[i]!;
      if (x >= ax && x <= bx) {
        const t = (x - ax) / (bx - ax);
        const len = Math.hypot(bx - ax, bz - az);
        // South normal of the segment.
        return [x, az + t * (bz - az), -(bz - az) / len, (bx - ax) / len];
      }
    }
    const [, lz] = line[line.length - 1]!;
    return [x, lz, 0, 1];
  };
  const xs = [x0, ...line.map(([x]) => x).filter((x) => x > x0 && x < x1), x1];
  const top = xs.map((x) => {
    const [px, pz, nx, nz] = at(x);
    return [px + nx * a, pz + nz * a] as [number, number];
  });
  const bottom = xs.map((x) => {
    const [px, pz, nx, nz] = at(x);
    return [px + nx * b, pz + nz * b] as [number, number];
  });
  pts.push(...top, ...bottom.reverse());
  return pts;
}

export function pisgaStreet(L: Levels): Primitive[] {
  const out: Primitive[] = [];
  const s = L.street;
  const DRIVE: [number, number] = [33.5, 39.3];
  const prism = (ring: Array<[number, number]>, y0: number, y1: number, material: BuildingMaterial, tag: string): Primitive => ({ type: "prism", ring, y0, y1, material, tag });
  // The sidewalk, two metres from the plot line to the kerb, stopped at the drive.
  out.push(prism(band(PLOT_SOUTH, 0, 2.0, -16, DRIVE[0]), s - 1, s + 0.15, "paving", "site:sidewalk"));
  out.push(prism(band(PLOT_SOUTH, 0, 2.0, DRIVE[1], 75), s - 1, s + 0.15, "paving", "site:sidewalk"));
  // The kerb.
  out.push(prism(band(PLOT_SOUTH, 1.85, 2.0, -16, DRIVE[0] - 1.5), s - 1, s + 0.16, "stone", "site:kerb"));
  out.push(prism(band(PLOT_SOUTH, 1.85, 2.0, DRIVE[1] + 1.5, 75), s - 1, s + 0.16, "stone", "site:kerb"));
  // The road: parking bays along the kerb, two lanes, the far pavement.
  out.push(prism(band(PLOT_SOUTH, 2.0, 11.0, -16, 75), s - 1, s, "asphalt", "site:street"));
  out.push(prism(band(PLOT_SOUTH, 11.0, 13.5, -16, 75), s - 1, s + 0.15, "paving", "site:sidewalk-far"));
  // The drive in, flush with the road.
  out.push(prism(band(PLOT_SOUTH, -3.2, 2.0, DRIVE[0], DRIVE[1]), s - 1, s, "asphalt", "site:entrance"));
  // Lines: the bays' outer edge and separators (13–16, the accessible bay, 17–18),
  // the centre line, the crossing at the drive.
  const mark = (ring: Array<[number, number]>) => out.push(prism(ring, s, s + 0.012, "parkingLine", "site:lines"));
  mark(band(PLOT_SOUTH, 4.35, 4.47, -12, 24.3));
  mark(band(PLOT_SOUTH, 4.35, 4.47, 45.9, 56.3));
  for (const x of [-5.3, 0.5, 6.1, 11.5, 17.0, 19.9, 21.3, 24.1, 45.9, 51.3, 56.2]) mark(band(PLOT_SOUTH, 2.0, 4.4, x - 0.06, x + 0.06));
  for (let x = -15; x < 74; x += 6) mark(band(PLOT_SOUTH, 7.64, 7.76, x, x + 3));
  for (let x = DRIVE[0] + 0.3; x < DRIVE[1] - 0.3; x += 0.9) mark(band(PLOT_SOUTH, 2.3, 6.3, x, x + 0.5));
  // The barrier at the car park's gate, and its arm.
  out.push(box(33.2, 33.5, s, s + 1.1, 19.2, 19.5, "frame", "site:gate"));
  out.push(box(33.5, 39.3, s + 0.95, s + 1.0, 19.3, 19.36, "parkingLine", "site:gate"));
  return out;
}

/** Where the street's cars park: bay centres along the kerb, and their heading. */
export function pisgaStreetBays(): Array<{ x: number; z: number; rotY: number }> {
  const centreAt = (x: number) => {
    for (let i = 1; i < PLOT_SOUTH.length; i++) {
      const [ax, az] = PLOT_SOUTH[i - 1]!;
      const [bx, bz] = PLOT_SOUTH[i]!;
      if (x >= ax && x <= bx) {
        const len = Math.hypot(bx - ax, bz - az);
        const z = az + ((x - ax) / (bx - ax)) * (bz - az);
        return { x: x - ((bz - az) / len) * 3.2, z: z + ((bx - ax) / len) * 3.2, rotY: Math.PI / 2 - Math.atan2(bz - az, bx - ax) };
      }
    }
    return { x, z: 25, rotY: Math.PI / 2 };
  };
  return [-2.4, 3.3, 8.8, 14.2, 48.6, 53.7].map(centreAt);
}
