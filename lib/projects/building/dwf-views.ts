import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { facadeTitle, PLAN_NORTH, pointOf, type North } from "@/lib/projects/building/compass";
import { buildingCentre, type BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import { housePlanPadMetres } from "@/lib/projects/building/plan-geometry-gate";
import type { ElevationFrame } from "@/lib/projects/building/elevation-frame";
import type { BuildingRenderPayload } from "@/lib/projects/building/render-page";
import { houseKnob } from "@/lib/projects/building/house-knobs";

/** A view of the building: what the booklet calls it, and the frame to draw. */
/** The views from above: how far out (spans), how high (spans) and the lens — AERIAL_VIEW="far,up,fov" tries another while choosing one. */
const AERIAL = (() => {
  const [far, up, fov] = (houseKnob("AERIAL_VIEW") ?? "2.5,1.6,18").split(",").map(Number);
  return { far: far ?? 2.5, up: up ?? 1.6, fov: fov ?? 18 };
})();

export type BuildingView = { id: string; title: string; payload: Omit<BuildingRenderPayload, "model"> };

/**
 * The views a building booklet shows, solved from the building's own size.
 *
 * מרכז פסג"ה's cameras were placed by hand; these are placed by the model:
 * two aerials from opposite corners, the four elevations drawn in parallel
 * projection square to their faces, and each storey from above with the
 * floors over it cut away. A view's id is the plan's side or corner it looks
 * from (compass.ts: "south" the plan's bottom, -z its top), its title the
 * compass's, turned by `north`. The sun's azimuth is the renderer's, from
 * the model's -z; where north is not up the plan these still light the
 * faces the camera sees, and come from the compass's south half.
 */
export function dwfBuildingViews(
  building: { floors: BuildingFloorMeta[]; model: { extent: BuildingModel["extent"]; primitives?: BuildingModel["primitives"] } },
  frame = { width: 2400, height: 1500 },
  /** Each elevation's frame as its sheet draws it, by view id: the render is drawn in the same one. */
  elevationFrames: Record<string, Pick<ElevationFrame, "widthM" | "bottomM" | "topM">> = {},
  /** A house is wider than it is tall: the cover stands back to take it all in, and its yard. */
  options: { house?: boolean; north?: North; street?: "north" | "south" | "east" | "west"; plot?: { x0: number; z0: number; x1: number; z1: number } } = {},
): BuildingView[] {
  const north = options.north ?? PLAN_NORTH;
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
        // From far off with a long lens, as a drone photographs a house: from
        // 1.25 spans with a 34° lens the walls leaned out at their tops and the
        // back of the house stood raised, out of proportion (12/10/2026).
        // Twice as far with half the lens keeps the house's size in the frame;
        // lower, 18° down, not 30°: from higher the land round the plot fell away
        // in the painting and the house stood raised on a mound (12/10/2026).
        camera: {
          position: { x: cx + sx * span * AERIAL.far, y: ground + span * AERIAL.up, z: cz + sz * span * AERIAL.far },
          target: { x: cx, y: ground + height * 0.42, z: cz },
          fovDeg: AERIAL.fov,
        },
        sun: { azimuthDeg, elevationDeg: 40 },
      },
    });
  // A house is seen as a person standing across its street sees it, not from
  // a drone: from above, every height tried read as the house raised out of
  // proportion (12/10/2026: "better a picture as if a person stands and
  // photographs"). Two corners of the street, eye height on the far sidewalk.
  if (options.house) {
    const s = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } }[options.street ?? "south"];
    const across = { x: -s.z, z: s.x };
    const front = s.x !== 0 ? width : depth;
    const wide = s.x !== 0 ? depth : width;
    const out = front / 2 + Math.max(28, wide * 1.2);
    // Each corner shows the front and that side: the camera out past the
    // house's side, high enough to see over the garden walls (12/10/2026:
    // "right side and front, left side and front, and the full front — higher").
    const shots: Array<{ id: string; title: string; side: number }> = [
      { id: "corner-a", title: "מבט מהרחוב — חזית וצד", side: 1 },
      { id: "corner-b", title: "מבט מהרחוב — חזית והצד השני", side: -1 },
      { id: "corner-front", title: "מבט מהרחוב — החזית המלאה", side: 0 },
    ];
    for (const { id, title, side } of shots) {
      const lateral = side * wide * 0.85;
      views.push({
        id,
        title,
        payload: {
          ...base,
          camera: {
            position: { x: cx + s.x * out + across.x * lateral, y: ground + 7.5, z: cz + s.z * out + across.z * lateral },
            target: { x: cx + s.x * front * 0.1 - across.x * side * wide * 0.05, y: ground + height * 0.3, z: cz + s.z * front * 0.1 - across.z * side * wide * 0.05 },
            fovDeg: side === 0 ? 42 : 40,
          },
          // The golden hour, low over the street's south-west shoulder.
          sun: { azimuthDeg: 242, elevationDeg: 13 },
        },
      });
    }
  } else aerial("aerial-se", aerialTitle(1, 1, north), 1, 1, 225);
  /**
   * A pair of semi-detached houses' cover: from across their street, a little
   * to one side and above, so both houses, both entrances and every parking
   * bay are in it — the old corner view from close by showed one house and
   * its two bays, and read as a single home.
   */
  function heroOfHouse() {
    const s = { north: { x: 0, z: -1 }, south: { x: 0, z: 1 }, east: { x: 1, z: 0 }, west: { x: -1, z: 0 } }[options.street ?? "south"];
    // A quarter-turn of the street's direction: across the front.
    const across = { x: -s.z, z: s.x };
    const front = s.x !== 0 ? width : depth;
    const wide = s.x !== 0 ? depth : width;
    // Farther back, less lateral — outer parking cars were cropped (16/10/2026).
    const back = Math.max(wide, height * 1.6) * 2.15;
    const at = { x: cx + s.x * (front / 2), z: cz + s.z * (front / 2) };
    return {
      position: { x: at.x + s.x * back + across.x * wide * 0.08, y: ground + back * 0.38, z: at.z + s.z * back + across.z * wide * 0.08 },
      target: { x: cx + s.x * front * 0.08, y: ground + height * 0.28, z: cz + s.z * front * 0.08 },
      fovDeg: 42,
    };
  }
  // The cover's picture: upright, as the cover frames it, from lower down.
  views.push({
    id: "hero",
    title: "שער",
    payload: {
      ...base,
      width: options.house ? 1800 : 1600,
      height: options.house ? 1800 : 2000,
      camera: options.house
        ? heroOfHouse()
        : {
            position: { x: cx + span * 0.95, y: ground + span * 0.55, z: cz + span * 1.25 },
            target: { x: cx, y: ground + height * 0.48, z: cz },
            fovDeg: 40,
          },
      sun: { azimuthDeg: 225, elevationDeg: 38 },
    },
  });
  if (!options.house) aerial("aerial-nw", aerialTitle(-1, -1, north), -1, -1, 250);
  // A house's plot from straight above, roofs on, framed on its ground-floor
  // sheet: the yard the sheet draws, as a drone sees it.
  const groundFloor = building.floors[0];
  if (options.house && groundFloor) {
    const plan = planPayload(groundFloor, frame.width);
    views.push({
      id: "aerial-top",
      title: "המגרש — מבט מלמעלה",
      payload: {
        ...plan,
        camera: { ...plan.camera, position: { ...plan.camera.position, y: top + 80 }, target: { ...plan.camera.target, y: ground }, cutAboveM: undefined, hideTags: [] },
        sun: { azimuthDeg: 210, elevationDeg: 58 },
      },
    });
  }

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
    // The bearing the face looks to, in the renderer's frame: -z is 0, +x 90.
    const faceAzimuth = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
    views.push({
      id,
      title,
      payload: {
        ...base,
        // A flat parallel view has no corners to shade: the occlusion pass drew a pale blurred band down the north face where
        // the two wings step back (17/10/2026).
        ao: false,
        height: heightPx,
        camera: {
          position: { x: cx + dir.x * far, y: midY, z: cz + dir.z * far },
          target: { x: cx, y: midY, z: cz },
          fovDeg: 30,
          orthoHalfWidth: half,
          groundBand: 0,
          // A house's elevation is a section, as the architect draws it: cut just
          // inside its plot's boundary, the ground — its paving, its sunk bays, its
          // terraces — cut in earth along it, and nothing past it, the street seen
          // edge on as a flat grey band no longer.
          ...(options.house && options.plot
            ? {
                section: {
                  axis: dir.x !== 0 ? ("x" as const) : ("z" as const),
                  at: dir.x > 0 ? options.plot.x1 - 0.35 : dir.x < 0 ? options.plot.x0 + 0.35 : dir.z > 0 ? options.plot.z1 - 0.35 : options.plot.z0 + 0.35,
                  keep: (dir.x + dir.z > 0 ? -1 : 1) as 1 | -1,
                },
              }
            : {}),
          // A house's boundary wall in front of the face hides its ground floor:
          // the drawing cuts it away, so does the render — and the bins'
          // enclosure and the utility pillar standing in that wall's line, cut
          // through by the section, stood as brown blocks across the ground
          // floor that every painting of the street front remade its own way.
          ...(options.house
            ? {
                hideBefore: {
                  axis: dir.x !== 0 ? ("x" as const) : ("z" as const),
                  at: dir.x > 0 ? x1 + 0.6 : dir.x < 0 ? x0 - 0.6 : dir.z > 0 ? z1 + 0.6 : z0 - 0.6,
                  toward: (dir.x + dir.z > 0 ? 1 : -1) as 1 | -1,
                  tags: ["yard:fence", "yard:railing", "yard:gate", "yard:bins", "yard:pillar"],
                },
              }
            : {}),
        },
        // Raking, 45° across the face, so terraces and reveals cast their shadows.
        // A house's projections are deep: raked, their shadows crossed its
        // plaster in diagonal bands no painting of it kept. Higher and nearer
        // square on, each falls just under what casts it.
        // A house's face is lit from in front and high, 62°: from 44° and a little to one side, the plot's walls and the notch where its two wings step back
        // cast a pale blurred band down the north face (17/10/2026); from in front and high, each shadow falls under what casts it.
        sun: options.house ? { azimuthDeg: faceAzimuth, elevationDeg: 62 } : { azimuthDeg, elevationDeg: 32 },
        // Square on, pale stone takes more light than the plates' exposure allows.
        exposure: 0.5,
      },
    });
  };
  elevation("elev-south", facadeTitle("south", north), { x: 0, z: 1 }, width, 225);
  elevation("elev-east", facadeTitle("east", north), { x: 1, z: 0 }, depth, 135);
  elevation("elev-north", facadeTitle("north", north), { x: 0, z: -1 }, width, 315);
  elevation("elev-west", facadeTitle("west", north), { x: -1, z: 0 }, depth, 225);

  // Each storey from above, the building over it cut away — framed on its
  // own sheet, so the render and the drawing are the same picture.
  for (const f of building.floors) {
    if (f.roof) continue;
    const name = f.units.length ? `קומה ${levelText(f.level)} — דירות ${f.units.join(", ")}` : `קומה ${levelText(f.level)}`;
    views.push({
      id: `plan-${f.id}`,
      title: name,
      payload: planPayload(f, frame.width, options.house, options.house ? building.model.primitives : undefined),
    });
  }
  if (options.house) views.push(...houseRoomViews(building.floors, { x: cx, z: cz }, tallPieces(building.model.primitives ?? []), blocksOf(building.model.primitives ?? [])));
  return views;
}

/** A house's rooms seen inside, the kinds the booklet shows, each by its storey: the main rooms of a home. */
const ROOM_VIEWS: Array<{ kind: string; storey: number; title: string }> = [
  { kind: "living", storey: 0, title: "הסלון ופינת האוכל" },
  { kind: "kitchen", storey: 0, title: "המטבח" },
  { kind: "bedroom", storey: 1, title: "חדר השינה" },
  // No bathroom: 1.5 by 2.1 m, a camera inside it saw its door leaf and a corner.
];

/**
 * A house's main rooms from eye height, as a buyer standing in them sees
 * them: in the first house of the pair (the other is its mirror), the
 * largest room of each kind on its storey, from its corner nearest the
 * house's middle — looking out across the room toward its windows — in the
 * golden hour's light through them. The rooms are those the storey was
 * furnished in from its sheet, so every piece stands where the sheet draws it.
 */
/** Furniture that stands taller than the eye's line of sight across a room: a wardrobe, a fridge. In plan, with the height it stands from. */
export type TallPiece = { x0: number; x1: number; z0: number; z1: number; y0: number; worktop?: boolean };
function tallPieces(prims: BuildingModel["primitives"]): TallPiece[] {
  return prims.flatMap((p) =>
    p.type === "box" && (p.tag ?? "").endsWith(":inside:furniture") && (p.size.y >= 1.2 || p.material === "quartz")
      ? [{ x0: p.centre.x - p.size.x / 2, x1: p.centre.x + p.size.x / 2, z0: p.centre.z - p.size.z / 2, z1: p.centre.z + p.size.z / 2, y0: p.centre.y - p.size.y / 2, ...(p.size.y < 1.2 ? { worktop: true } : {}) }]
      : [],
  );
}

/** A solid thing on a storey, in plan, with the heights it stands between: a wall, a wardrobe, a bed, a worktop. */
export type Block = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; wall?: boolean };

/** What stands in a house's rooms and can be walked into or looked past: every box of a storey that is a wall or a piece of furniture. */
export function blocksOf(prims: BuildingModel["primitives"]): Block[] {
  return prims.flatMap((p) => {
    if (p.type !== "box") return [];
    const tag = p.tag ?? "";
    const wall = /^floor-\d+$/.test(tag) && p.size.y > 1;
    const furniture = tag.endsWith(":inside:furniture") && p.size.y >= 0.25 && Math.min(p.size.x, p.size.z) >= 0.12;
    if (!wall && !furniture) return [];
    return [{ x0: p.centre.x - p.size.x / 2, x1: p.centre.x + p.size.x / 2, z0: p.centre.z - p.size.z / 2, z1: p.centre.z + p.size.z / 2, y0: p.centre.y - p.size.y / 2, y1: p.centre.y + p.size.y / 2, ...(wall ? { wall: true } : {}) }];
  });
}

const inBlock = (b: Block, x: number, z: number, m = 0) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;

/**
 * Where a buyer would stand in a room, and where he would look: the place and
 * the direction from which the most of the room's floor is seen, with clear
 * space ahead. The corner nearest the house's middle, looking across, put a
 * partition's whole face in front of Gottlieb A's bedroom and a worktop under
 * its kitchen's eye (17/10/2026): the room is searched, a place at a time, on
 * the storey's own walls and furniture.
 */
export function chooseRoomCamera(input: {
  room: { x: number; z: number; w: number; d: number };
  level: number;
  blocks: Block[];
  /** Vertical field of view and the frame's width over its height. */
  fovDeg: number;
  aspect: number;
  /** A point to keep in view (the kitchen's worktop), counted three times. */
  keep?: { x: number; z: number } | null;
}): { eye: { x: number; z: number }; at: { x: number; z: number }; seen: number; ahead: number } | null {
  const { room, level, blocks } = input;
  const eyeY = level + 1.5;
  // The things the eye's line passes through, and the things a person's body stands against.
  const sight = blocks.filter((b) => b.y0 < eyeY + 0.2 && b.y1 > eyeY - 0.5);
  const body = blocks.filter((b) => b.y0 < level + 1.2 && b.y1 > level + 0.05);
  const near = (b: Block) => b.x1 > room.x - 0.5 && b.x0 < room.x + room.w + 0.5 && b.z1 > room.z - 0.5 && b.z0 < room.z + room.d + 0.5;
  const walls = sight.filter(near);
  const stands = body.filter(near);
  const free = (x: number, z: number) => !stands.some((b) => inBlock(b, x, z, 0.4));
  const open = (x: number, z: number) => !walls.some((b) => inBlock(b, x, z));
  const floor: Array<{ x: number; z: number; w: number }> = [];
  for (let x = room.x + 0.25; x < room.x + room.w; x += 0.5) for (let z = room.z + 0.25; z < room.z + room.d; z += 0.5) if (!stands.some((b) => inBlock(b, x, z))) floor.push({ x, z, w: 1 });
  // The pieces the room is for — a bed, a sofa, a table — are what a view is of: each counts four floor cells.
  for (const b of blocks) {
    if (b.wall || b.y1 - b.y0 < 0.2 || b.y1 > level + 1.6 || b.x1 < room.x || b.x0 > room.x + room.w || b.z1 < room.z || b.z0 > room.z + room.d) continue;
    floor.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, w: 4 });
  }
  if (input.keep) floor.push({ ...input.keep, w: 3 });
  const clearRay = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1));
    for (let k = 1; k < n; k++) if (!open(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n)) return false;
    return true;
  };
  const half = Math.atan(Math.tan((input.fovDeg * Math.PI) / 360) * input.aspect);
  let best: { eye: { x: number; z: number }; at: { x: number; z: number }; seen: number; ahead: number; score: number } | null = null;
  for (let x = room.x + 0.5; x <= room.x + room.w - 0.5 + 1e-9; x += 0.25) {
    for (let z = room.z + 0.5; z <= room.z + room.d - 0.5 + 1e-9; z += 0.25) {
      if (!free(x, z) || !open(x, z)) continue;
      for (let k = 0; k < 16; k++) {
        const yaw = (k * Math.PI) / 8;
        const [dx, dz] = [Math.cos(yaw), Math.sin(yaw)];
        // Free space ahead along the line of sight, up to 6 m.
        let ahead = 0;
        while (ahead < 6 && open(x + dx * (ahead + 0.1), z + dz * (ahead + 0.1))) ahead += 0.1;
        if (ahead < Math.min(2.4, 0.55 * Math.hypot(room.w, room.d))) continue;
        let seen = 0;
        for (const f of floor) {
          const [vx, vz] = [f.x - x, f.z - z];
          const dist = Math.hypot(vx, vz);
          if (dist < 0.6) continue;
          if (Math.abs(Math.atan2(vx * dz - vz * dx, vx * dx + vz * dz)) > half * 0.92) continue;
          if (clearRay(x, z, f.x, f.z)) seen += f.w;
        }
        // A tall piece filling the frame's edge from close by (a wardrobe at the lens) is a view of its door.
        let crowd = 0;
        for (const b of sight) {
          if (b.y1 - b.y0 < 1.2 || !near(b)) continue;
          const [cx, cz] = [(b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z];
          const gap = Math.hypot(Math.max(b.x0 - x, x - b.x1, 0), Math.max(b.z0 - z, z - b.z1, 0));
          if (gap < (b.wall ? 2.2 : 1.3) && Math.abs(Math.atan2(cx * dz - cz * dx, cx * dx + cz * dz)) < half * 1.1) crowd += b.wall ? 14 : 8;
        }
        const score = seen + Math.min(ahead, 5) * 0.4 - crowd;
        if (!best || score > best.score) best = { eye: { x, z }, at: { x: x + dx * Math.max(2, ahead * 0.6), z: z + dz * Math.max(2, ahead * 0.6) }, seen, ahead, score };
      }
    }
  }
  return best ? { eye: best.eye, at: best.at, seen: best.seen, ahead: best.ahead } : null;
}

export function houseRoomViews(floors: BuildingFloorMeta[], centre: { x: number; z: number }, tall: TallPiece[] = [], blocks: Block[] = []): BuildingView[] {
  const storeys = floors.filter((f) => !f.roof);
  const out: BuildingView[] = [];
  for (const want of ROOM_VIEWS) {
    const f = storeys[want.storey];
    const rooms = (f?.rooms ?? []).filter((r) => r.kind === want.kind && r.x + r.w / 2 < centre.x && Math.min(r.w, r.d) >= 1.4);
    // The largest of its kind — but a bathroom the smallest full one: the
    // largest, split by its WC's partitions, showed walls and a passage.
    const room = want.kind === "bathroom" ? rooms.filter((r) => r.areaM2 >= 2.5).sort((a, b) => a.areaM2 - b.areaM2)[0] : rooms.sort((a, b) => b.areaM2 - a.areaM2)[0];
    if (!f || !room) continue;
    const inset = 0.4;
    const corners = [
      { x: room.x + inset, z: room.z + inset },
      { x: room.x + room.w - inset, z: room.z + inset },
      { x: room.x + inset, z: room.z + room.d - inset },
      { x: room.x + room.w - inset, z: room.z + room.d - inset },
    ];
    const small = room.w * room.d < 9 || Math.min(room.w, room.d) < 2.2;
    const mid = { x: room.x + room.w / 2, z: room.z + room.d / 2 };
    // A small or narrow room from the middle of its side nearest the house's
    // middle — its doorway's side — looking straight across: from a corner a
    // bathroom showed its walls and its door, the bath half out of the frame.
    const sides = [
      { x: room.x + inset, z: mid.z },
      { x: room.x + room.w - inset, z: mid.z },
      { x: mid.x, z: room.z + inset },
      { x: mid.x, z: room.z + room.d - inset },
    ];
    const nearest = (pts: Array<{ x: number; z: number }>) => pts.sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z))[0]!;
    // Not against a tall piece: from beside the fridge, Gottlieb A's kitchen
    // was half the fridge's side (13/10/2026). The nearest clear place, a
    // corner first in a room large enough for one.
    const here = tall.filter((t) => !t.worktop && t.y0 - f.level > -0.5 && t.y0 - f.level < 0.5);
    const clear = (q: { x: number; z: number }) => here.every((t) => Math.hypot(Math.max(t.x0 - q.x, q.x - t.x1, 0), Math.max(t.z0 - q.z, q.z - t.z1, 0)) >= 0.8);
    const [first, then] = small ? [sides, corners] : [corners, sides];
    const open = first.filter(clear).length ? first.filter(clear) : then.filter(clear).length ? then.filter(clear) : first;
    // A kitchen is its worktop: stood across the room from it, looking at it —
    // from the nearest corner Gottlieb A's showed its table and the living room.
    const tops = tall.filter((t) => t.worktop && t.y0 - f.level > 0 && t.y0 - f.level < 1.2 && (t.x0 + t.x1) / 2 >= room.x && (t.x0 + t.x1) / 2 <= room.x + room.w && (t.z0 + t.z1) / 2 >= room.z && (t.z0 + t.z1) / 2 <= room.z + room.d);
    const top = tops.length ? { x: tops.reduce((a, t) => a + (t.x0 + t.x1) / 2, 0) / tops.length, z: tops.reduce((a, t) => a + (t.z0 + t.z1) / 2, 0) / tops.length } : null;
    const stand = want.kind === "kitchen" && top ? [...open, ...(open === first ? then.filter(clear) : [])].sort((a, b) => Math.hypot(b.x - top.x, b.z - top.z) - Math.hypot(a.x - top.x, a.z - top.z))[0]! : nearest(open);
    // Across the room to its far side, a little below the eye.
    const far = want.kind === "kitchen" && top ? top : { x: mid.x + (mid.x - stand.x) * 0.6, z: mid.z + (mid.z - stand.z) * 0.6 };
    // Searched on the storey's own walls and furniture, where the model is known; the corner above where it is not.
    const fov = small || want.kind === "kitchen" ? 78 : 62;
    const storeyBlocks = blocks.filter((q) => q.y1 > f.level - 0.2 && q.y0 < f.level + f.height);
    // A kitchen from the corner whose diagonal across the room shows the most of its pieces: the search's eye
    // stood under a downlight's edge, in a dark half of the room, looking at a worktop a metre away.
    const pieces = storeyBlocks.filter((q) => !q.wall && q.y1 - q.y0 >= 0.2 && q.y1 < f.level + 2.3 && q.x1 > room.x && q.x0 < room.x + room.w && q.z1 > room.z && q.z0 < room.z + room.d);
    const kitchenDiagonal = () => {
      const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (2000 / 1334));
      let best: { eye: { x: number; z: number }; at: { x: number; z: number }; score: number } | null = null;
      for (const eye of open) {
        const at = corners.reduce((a, c) => (Math.hypot(c.x - eye.x, c.z - eye.z) > Math.hypot(a.x - eye.x, a.z - eye.z) ? c : a), corners[0]!);
        const [dx, dz] = [at.x - eye.x, at.z - eye.z];
        const seen = pieces.filter((q) => {
          const [vx, vz] = [(q.x0 + q.x1) / 2 - eye.x, (q.z0 + q.z1) / 2 - eye.z];
          return Math.hypot(vx, vz) > 0.6 && Math.abs(Math.atan2(vx * dz - vz * dx, vx * dx + vz * dz)) < half * 0.9;
        }).length;
        const score = seen + Math.hypot(dx, dz);
        if (!best || score > best.score) best = { eye, at, score };
      }
      return best;
    };
    const diag = want.kind === "kitchen" && top ? kitchenDiagonal() : null;
    const chosen = !diag && storeyBlocks.length ? chooseRoomCamera({ room, level: f.level, blocks: storeyBlocks, fovDeg: fov, aspect: 2000 / 1334, keep: want.kind === "kitchen" ? top : null }) : null;
    const [eyeAt, lookAt] = diag ? [diag.eye, diag.at] : chosen ? [chosen.eye, chosen.at] : [stand, far];
    out.push({
      id: `room-${want.kind}`,
      title: want.title,
      payload: {
        width: 2000,
        height: 1334,
        exposure: 0.6,
        ao: true,
        camera: { position: { x: eyeAt.x, y: f.level + 1.5, z: eyeAt.z }, target: { x: lookAt.x, y: f.level + (want.kind === "kitchen" && top ? 0.95 : 1.1), z: lookAt.z }, fovDeg: fov, interior: true, room: { x0: room.x, x1: room.x + room.w, z0: room.z, z1: room.z + room.d, floorY: f.level, ceilingY: f.level + 2.6 } },
        sun: { azimuthDeg: 250, elevationDeg: 22 },
      },
    });
  }
  return out;
}

/** An aerial's title: the compass point it looks from, for a camera at the plan's (sx, sz) corner. */
export function aerialTitle(sx: number, sz: number, north: North = PLAN_NORTH): string {
  return `מבט על — ${pointOf({ x: sx, z: sz }, north).replace("־", " ")}`;
}

export function levelText(level: number): string {
  return `${level >= 0 ? "+" : "−"}${Math.abs(level).toFixed(2)}`;
}

/**
 * A storey from straight above, framed on its sheet: the frame's middle is the
 * sheet's middle moved into the building's frame, its half width the sheet's,
 * and its height the sheet's proportion of the width.
 */
export function planPayload(
  f: BuildingFloorMeta,
  widthPx: number,
  house = false,
  /** Yard cars etc. — when given, pad the ortho so saloons sit whole in frame. */
  primitives?: readonly Primitive[],
): Omit<BuildingRenderPayload, "model"> {
  const w0 = f.sheetWidth / DWF_FLOOR_UNITS_PER_METRE;
  const h0 = f.sheetHeight / DWF_FLOOR_UNITS_PER_METRE;
  // Pad from car extents (plan-geometry-gate), not a blind fixed pad — sheet centre stays.
  const padM =
    house && primitives?.length
      ? housePlanPadMetres({ id: f.id, sheetWidth: f.sheetWidth, sheetHeight: f.sheetHeight, shift: f.shift }, primitives)
      : 0;
  const w = w0 + 2 * padM;
  const h = h0 + 2 * padM;
  const cx = w0 / 2 + f.shift.x;
  const cz = h0 / 2 + f.shift.y;
  // A house's plan drawn at twice the page and shrunk: drawn at 2,400 and
  // shrunk to 2,000 it read soft (13/10/2026).
  const px = house ? Math.max(widthPx, 4000) : widthPx;
  return {
    width: px,
    height: Math.round((px * h) / w),
    exposure: 0.62,
    // House plans: light AO + soft high-sun shadows (photoreal measured, 16/10/2026).
    // Non-house keeps AO on; house used to disable AO to avoid grey wall smudges.
    ao: true,
    camera: {
      position: { x: cx, y: f.level + 80, z: cz + 0.001 },
      target: { x: cx, y: f.level, z: cz },
      fovDeg: 30,
      orthoHalfWidth: w / 2,
      up: { x: 0, y: 0, z: -1 },
      cutAboveM: f.level + 1.3,
      // The sheet draws the floor alone: no ground round it, no roof over it.
      // A house's plan keeps site:sidewalk + site:road so parked cars are not
      // cut against white (hide "site" alone wiped the street — 16/10/2026).
      // Upper non-house storeys hide the yard; house storeys keep it.
      hideTags: house ? ["roof", "site:ground"] : f.id === "floor-0" ? ["roof", "site"] : ["roof", "site", "yard"],
    },
    // House plan: warm high sun without cast-shadow bands (AO only — cast
    // shadows washed walls grey). Non-house: high even sun.
    sun: house ? { azimuthDeg: 180, elevationDeg: 68 } : { azimuthDeg: 200, elevationDeg: 76 },
    ...(house ? { exposure: 0.78 } : {}),
  };
}
