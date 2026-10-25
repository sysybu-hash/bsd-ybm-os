import { insidePolygon, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";

/**
 * A private house, as this booklet builds it.
 *
 * The walls are coloured plaster in one warm grey-brown (greige), tone on
 * tone by volume: the side wings deep, the middle volume between them light,
 * as the facade sheet parts them ("טיח אפור" on the wings, "טיח לבן" in the
 * middle). A window wears a Jerusalem-stone frame. The plot is this house's
 * own ground: a gentle fall, grass, and trees, flattened only under the
 * building so it sits level.
 */
/** The side wings' plaster: deep greige. */
export const HOUSE_PLASTER_WING: BuildingMaterial = "renderBrown";
/** The house's body, the middle volume: light greige. */
export const HOUSE_PLASTER_BODY: BuildingMaterial = "renderGray";
export const HOUSE_WINDOW_FRAME: BuildingMaterial = "jerusalemStone";

/**
 * The house's outside in one place — what the render is built in, what the
 * painting is asked for and what the booklet says of it — so a booklet's
 * pages, its paintings and its words cannot part. The user's choice for the
 * Gottlieb booklet (10/10/2026): grey and brown plaster, though the facade
 * sheet writes grey and white. Not brown below and grey above (11/10/2026:
 * "I meant grey-brown, not two colours"): one greige, tone on tone by volume,
 * and a hidden warm LED line under the roof's coping.
 */
export const HOUSE_EXTERIOR = {
  wing: HOUSE_PLASTER_WING,
  body: HOUSE_PLASTER_BODY,
  frame: HOUSE_WINDOW_FRAME,
  /** The cover's subtitle after the style's name. */
  summaryHe: "טיח אפור־חום טון על טון · מסגרות אבן ירושלמית · פס לד נסתר בקופינג",
  /** How the booklet says it. */
  plasterHe: "גוון אפור־חום אחד, טון על טון: אגפי הצד כהים והנפח המרכזי בהיר מאותה משפחה",
  frameHe: "אבן ירושלמית",
  /** How the painting is asked for it. */
  plasterEn: { wing: "deep warm greige (a grey-brown taupe)", body: "light warm greige of the same family" },
} as const;
/** The stone frame's width, metres, standing proud of the plaster. */
export const HOUSE_FRAME_M = 0.16;

// Far enough that its edge is out of every frame: at 18 m, and at 45 m from the lower aerial cameras, the land's edge stood against the sky as a hill behind the house (12/10/2026).
const PAD_M = 120;
const STEP_M = 1.25;
const APRON_M = 3.2;

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function distToSeg(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

/** Metres from the nearest outline. Zero on and inside it. */
function clearance(outlines: Outline[], x: number, z: number): number {
  let best = Infinity;
  for (const ring of outlines) {
    if (ring.length < 3) continue;
    if (insidePolygon(ring, x, z)) return 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!;
      const [bx, bz] = ring[(i + 1) % ring.length]!;
      best = Math.min(best, distToSeg(x, z, ax, az, bx, bz));
    }
  }
  return best;
}

/**
 * The plot around these outlines, at `ground` under the house.
 *
 * The shape is fixed by the footprint, so the same house always stands on
 * the same land, and two houses with different footprints do not share it.
 */
export function houseSite(
  outlines: Outline[],
  ground: number,
  /**
   * The plot as its sheet draws it: the land's height round it, and where no
   * tree may stand. Its plan draws no tree: within it none is planted, and
   * beyond it only a few, well clear of its boundary and off the house's
   * corners, so none stands before a facade — the neighbours' garden.
   */
  yard?: { heightAt: (x: number, z: number) => number; built: (x: number, z: number) => boolean; plot?: { x0: number; z0: number; x1: number; z1: number } },
): {
  primitives: Primitive[];
  bounds: { x0: number; z0: number; x1: number; z1: number; yMin: number };
} {
  const pts = outlines.flat();
  const xs = pts.map(([x]) => x);
  const zs = pts.map(([, z]) => z);
  const x0b = Math.min(...xs);
  const x1b = Math.max(...xs);
  const z0b = Math.min(...zs);
  const z1b = Math.max(...zs);
  const x0 = x0b - PAD_M;
  const z0 = z0b - PAD_M;
  const nx = Math.max(2, Math.ceil((x1b - x0b + 2 * PAD_M) / STEP_M) + 1);
  const nz = Math.max(2, Math.ceil((z1b - z0b + 2 * PAD_M) / STEP_M) + 1);
  const seed = x0b * 0.17 + z0b * 0.31 + (x1b - x0b) * 0.07;
  const heights: number[] = [];
  let yMin = ground;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * STEP_M;
      const z = z0 + j * STEP_M;
      let h: number;
      if (yard) {
        h = yard.heightAt(x, z) + 0.12 * Math.sin(x * 0.21 + z * 0.13 + seed);
      } else {
        const land =
          ground +
          0.7 * Math.sin((x + seed) * 0.09) * Math.cos((z - seed) * 0.07) +
          0.35 * Math.sin(x * 0.21 + z * 0.13 + seed);
        const d = clearance(outlines, x, z);
        const t = d <= 0.6 ? 0 : d >= APRON_M ? 1 : (d - 0.6) / (APRON_M - 0.6);
        h = ground - 0.04 + (land - (ground - 0.04)) * t * t;
      }
      heights.push(h);
      yMin = Math.min(yMin, h);
    }
  }
  const primitives: Primitive[] = [
    { type: "terrain", x0, z0, dx: STEP_M, nx, nz, heights, material: "grass", tag: "site:ground" },
  ];
  const cx = (x0b + x1b) / 2;
  const cz = (z0b + z1b) / 2;
  const reach = Math.hypot(x1b - x0b, z1b - z0b) / 2 + 7;
  const plot = yard?.plot;
  /** How far a point stands outside the plot: 0 within it. */
  const beyondPlot = (x: number, z: number) => (plot ? Math.hypot(Math.max(plot.x0 - x, 0, x - plot.x1), Math.max(plot.z0 - z, 0, z - plot.z1)) : Infinity);
  let planted = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + seed;
    const x = cx + Math.cos(a) * reach;
    const z = cz + Math.sin(a) * reach;
    if (clearance(outlines, x, z) < 5 || yard?.built(x, z)) continue;
    if (plot && (beyondPlot(x, z) < 3 || planted >= 3)) continue;
    // Nor on a diagonal the views from above look along (dwf-views aerial):
    // the north-west view's tree stood before the house's corner (12/10/2026).
    const bearing = Math.atan2(z - cz, x - cx);
    if ([Math.PI / 4, (-3 * Math.PI) / 4].some((d) => Math.abs(Math.atan2(Math.sin(bearing - d), Math.cos(bearing - d))) < 0.45)) continue;
    // Each facade is drawn square on: a tree within the house's span on either axis stands before one of them.
    if (plot && ((x > x0b - 2.5 && x < x1b + 2.5) || (z > z0b - 2.5 && z < z1b + 2.5))) continue;
    if (x < x0 || z < z0 || x > x0 + (nx - 1) * STEP_M || z > z0 + (nz - 1) * STEP_M) continue;
    const i = Math.round((x - x0) / STEP_M);
    const j = Math.round((z - z0) / STEP_M);
    const y = heights[j * nx + i] ?? ground;
    planted++;
    primitives.push({
      type: "tree",
      at: { x, y, z },
      height: 4.2 + hash(seed + k) * 2.2,
      crown: 1.5 + hash(seed + k + 3) * 0.8,
      tag: "tree",
    });
  }
  return {
    primitives,
    bounds: { x0, z0, x1: x0 + (nx - 1) * STEP_M, z1: z0 + (nz - 1) * STEP_M, yMin },
  };
}

/**
 * A private house's hard edges softened, as built: a rounded Jerusalem-stone
 * coping on every garden wall, retaining wall, bin enclosure and roof
 * parapet, and the lawns' corners drawn round. Boxes alone read as a model
 * of cubes (the user, 11/10/2026: "very cubic; it should be softer and
 * rounder"); the walls keep their drawn place and height, only their tops
 * and the lawns' corners change.
 */
/**
 * The house's plaster tone on tone by volume: every facade piece whose middle
 * lies outside the middle volume `span` (along `axis`) is a side wing's deep
 * greige, the rest the body's light. A piece across a boundary is cut there.
 * Without a span (no balcony to mark the middle) the house is all body.
 */
export function paintByVolume(prims: Primitive[], span: { axis: "x" | "z"; lo: number; hi: number } | null): Primitive[] {
  const plaster = new Set<BuildingMaterial>([HOUSE_PLASTER_WING, HOUSE_PLASTER_BODY]);
  const out: Primitive[] = [];
  for (const p of prims) {
    // The balcony's party wall keeps the wings' deep tone wherever it stands.
    if (p.type !== "box" || !plaster.has(p.material) || (p.tag ?? "").startsWith("yard:") || (p.tag ?? "").endsWith("balcony:divider")) {
      out.push(p);
      continue;
    }
    if (!span || p.rotY) {
      out.push({ ...p, material: HOUSE_PLASTER_BODY });
      continue;
    }
    const k = span.axis;
    const [a, b] = [p.centre[k] - p.size[k] / 2, p.centre[k] + p.size[k] / 2];
    const cuts = [a, ...[span.lo, span.hi].filter((c) => c > a + 0.01 && c < b - 0.01), b];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [u0, u1] = [cuts[i]!, cuts[i + 1]!];
      const mid = (u0 + u1) / 2;
      out.push({
        ...p,
        centre: { ...p.centre, [k]: mid },
        size: { ...p.size, [k]: u1 - u0 },
        material: mid < span.lo || mid > span.hi ? HOUSE_PLASTER_WING : HOUSE_PLASTER_BODY,
      });
    }
  }
  return out;
}

/**
 * An outer wall is one box, painted the facade's render through: inside, a
 * bedroom's wall stood grey-brown beside its white ones (13/10/2026). Each
 * face of a rendered wall that looks into a room is lined with the rooms'
 * plaster, a few millimetres proud of it.
 */
export function plasterInside(prims: Primitive[], floors: Array<{ level: number; height: number; rooms: Array<{ x: number; z: number; w: number; d: number }> }>): Primitive[] {
  const render = new Set<BuildingMaterial>([HOUSE_PLASTER_WING, HOUSE_PLASTER_BODY]);
  const out: Primitive[] = [];
  for (const p of prims) {
    if (p.type !== "box" || p.rotY || !render.has(p.material) || !(p.tag ?? "").startsWith("floor-")) continue;
    const across = p.size.x <= p.size.z ? "x" : "z";
    const t = p.size[across];
    if (t > 0.6) continue;
    const y = p.centre.y;
    const floor = floors.find((f) => y >= f.level && y <= f.level + f.height);
    if (!floor) continue;
    for (const side of [-1, 1]) {
      const probe = { x: p.centre.x, z: p.centre.z, [across]: p.centre[across] + side * (t / 2 + 0.2) } as { x: number; z: number };
      if (!floor.rooms.some((r) => probe.x >= r.x && probe.x <= r.x + r.w && probe.z >= r.z && probe.z <= r.z + r.d)) continue;
      const face = p.centre[across] + side * (t / 2 + 0.003);
      out.push({ ...p, centre: { ...p.centre, [across]: face }, size: { ...p.size, [across]: 0.004 }, material: "plaster", tag: `${p.tag}:lining` });
    }
  }
  return out;
}

/**
 * The house lit for the golden hour (11/10/2026: "outdoor lighting too, we
 * chose the golden hour"): an up-and-down wall light beside every entrance
 * door — a timber leaf on the outline of the storey it opens from — and
 * small lights set low in the stone garden walls, on both faces, every
 * 2.5 m. The glow is the render's emissive panel; the fittings are dark metal.
 */
export function outdoorLights(prims: Primitive[], ground: Outline): Primitive[] {
  const out: Primitive[] = [];
  for (const p of prims) {
    if (p.type !== "box" || p.rotY) continue;
    const tag = p.tag ?? "";
    // An entrance's timber leaf, or a glazed door out onto a balcony: each has its wall light.
    const glazedDoor = p.material === "glass" && tag.endsWith(":door") && p.centre.y > 2;
    if ((p.material === "timber" || glazedDoor) && tag.endsWith(":door")) {
      const alongX = p.size.x >= p.size.z;
      const n = alongX ? [0, 1] : [1, 0];
      const outward = [0.5, -0.5].find((d) => !insidePolygon(ground, p.centre.x + n[0]! * d, p.centre.z + n[1]! * d)) ?? null;
      const inside = [0.5, -0.5].some((d) => insidePolygon(ground, p.centre.x + n[0]! * d, p.centre.z + n[1]! * d));
      if (outward == null || !inside) continue;
      const sign = Math.sign(outward);
      // The leaf stands 12 cm in from the wall's outer face; the light sits on that face, beside the frame.
      const face = (alongX ? p.centre.z : p.centre.x) + sign * 0.14;
      const half = (alongX ? p.size.x : p.size.z) / 2 + 0.35;
      const at = alongX ? { x: p.centre.x + half, z: face } : { x: face, z: p.centre.z + half };
      const y = p.centre.y - p.size.y / 2 + 2.05;
      const off = (d: number) => (alongX ? { x: at.x, z: at.z + sign * d } : { x: at.x + sign * d, z: at.z });
      const body = off(0.05);
      out.push({ type: "box", centre: { x: body.x, y, z: body.z }, size: { x: 0.09, y: 0.26, z: 0.09 }, material: "metal", tag: "light:wall" });
      for (const dy of [0.14, -0.14]) out.push({ type: "box", centre: { x: body.x, y: y + dy, z: body.z }, size: { x: 0.07, y: 0.02, z: 0.07 }, material: "lightPanel", tag: "light:wall:glow" });
      continue;
    }
    if (tag !== "yard:fence") continue;
    const alongX = p.size.x >= p.size.z;
    const len = alongX ? p.size.x : p.size.z;
    const thick = alongX ? p.size.z : p.size.x;
    const top = p.centre.y + p.size.y / 2;
    for (let u = -len / 2 + 1.25; u <= len / 2 - 0.4; u += 2.5) {
      for (const side of [1, -1]) {
        const d = side * (thick / 2 + 0.005);
        const c = alongX ? { x: p.centre.x + u, z: p.centre.z + d } : { x: p.centre.x + d, z: p.centre.z + u };
        out.push({ type: "box", centre: { x: c.x, y: top - 0.32, z: c.z }, size: alongX ? { x: 0.22, y: 0.05, z: 0.01 } : { x: 0.01, y: 0.05, z: 0.22 }, material: "lightPanel", tag: "light:wall:step" });
      }
    }
  }
  return out;
}

/** The hidden LED line under a roof parapet's coping: a warm glow, its fitting unseen. */
const LED_M = 0.03;

export function softenHouse(prims: Primitive[]): Primitive[] {
  const out: Primitive[] = [];
  for (const p of prims) {
    // A lawn keeps the outline the sheet draws: its corners rounded at 70 cm,
    // it stood off the fence and the house where the sheet runs it to them
    // (Gottlieb A, 13/10/2026).
    out.push(p);
    if (p.type !== "box" || p.rotY || p.material === "metal") continue;
    const tag = p.tag ?? "";
    if (!/^(yard:(fence|bins|retaining|plinth)|roof:parapet)/.test(tag)) continue;
    const top = p.centre.y + p.size.y / 2;
    const alongX = p.size.x >= p.size.z;
    const thick = (alongX ? p.size.z : p.size.x) + 0.06;
    const len = (alongX ? p.size.x : p.size.z) + 0.02;
    out.push({
      type: "box",
      centre: { x: p.centre.x, y: top + 0.03, z: p.centre.z },
      size: alongX ? { x: len, y: 0.06, z: thick } : { x: thick, y: 0.06, z: len },
      material: HOUSE_WINDOW_FRAME,
      tag: `${tag}:coping`,
      round: 0.025,
    });
    if (tag === "roof:parapet") {
      out.push({
        type: "box",
        centre: { x: p.centre.x, y: top - LED_M / 2, z: p.centre.z },
        size: alongX ? { x: len, y: LED_M, z: thick - 0.02 } : { x: thick - 0.02, y: LED_M, z: len },
        material: "lightPanel",
        tag: "roof:parapet:led",
      });
    }
  }
  return out;
}

