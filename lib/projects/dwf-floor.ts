import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { levelMarks, roomLabels } from "@/lib/projects/floor-split";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { findRectangles } from "@/lib/projects/floorplan-furniture";
import { labelledKind } from "@/lib/projects/floorplan-segment";

/**
 * A permit set's floor plan, read into walls, rooms and apartments.
 *
 * The sales-sheet reader finds walls as pairs of parallel lines, and on a
 * permit plan that is wrong in the one place it matters: interior dimension
 * chains run through the rooms, two of them read as a wall's faces, and the
 * floor came out criss-crossed with 40 cm "walls". What marks a wall on a
 * permit plan is its hatch — short strokes at 45° packed between its faces —
 * and nothing else is drawn that way at that density. So the walls are
 * rasterised from the hatch alone, at 2 cm a pixel, and everything after is
 * done on that mask: its windows and doorways closed, its rooms flooded, and
 * the rooms named and grouped into apartments by what the sheet writes.
 */
export type DwfFloor = {
  /** Pixel grid: `cols` × `rows`, `cm` centimetres a pixel, origin at the sheet's (0,0). */
  cols: number;
  rows: number;
  cm: number;
  /** Page units per metre on this sheet. */
  unitsPerMetre: number;
  /**
   * The walls as drawn (1), the gaps closed along them — windows and wide
   * openings (2), doorways (4) — and the doors shut along their swing (3).
   */
  wall: Uint8Array;
  /** The room each pixel is in, 0 for wall, `outside` for the world round the building. */
  room: Int32Array;
  outside: number;
  rooms: DwfRoom[];
  apartments: DwfApartment[];
};

export type DwfRoom = {
  id: number;
  areaM2: number;
  kind: FloorplanRoomKind | null;
  /** The names written in it. */
  names: string[];
};

export type DwfApartment = { unit: number; rooms: number[] };

const HATCH_ANGLE_TOLERANCE = 8;

export function readDwfFloor(
  sheet: DwfGeometry,
  options: {
    unitsPerMetre: number;
    cm?: number;
    units?: Array<{ unit: number; x: number; y: number }>;
    sealOpenings?: boolean;
    /** A public building's sheet: its classrooms, offices and halls are named rooms too (publicRoomKind). */
    public?: boolean;
  },
): DwfFloor {
  const upm = options.unitsPerMetre;
  const cm = options.cm ?? 2;
  const pxPerUnit = 100 / upm / cm;
  const cols = Math.ceil(sheet.pageWidth * pxPerUnit) + 1;
  const rows = Math.ceil(sheet.pageHeight * pxPerUnit) + 1;
  const n = cols * rows;

  // 1. The hatch strokes, drawn two pixels wide, and where each one's middle is.
  const ink = new Uint8Array(n);
  const strokes = new Uint16Array(n);
  const rising = new Uint16Array(n);
  const line = (x1: number, y1: number, x2: number, y2: number, into: Uint8Array, value: number, width = 1) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let k = 0; k <= steps; k++) {
      const x = Math.round(x1 + ((x2 - x1) * k) / steps);
      const y = Math.round(y1 + ((y2 - y1) * k) / steps);
      for (let dy = 0; dy < width; dy++) {
        for (let dx = 0; dx < width; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < cols && py < rows && !into[py * cols + px]) into[py * cols + px] = value;
        }
      }
    }
  };
  for (const s of sheet.segments) {
    const lengthM = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm;
    if (lengthM < 0.02 || lengthM > 0.7) continue;
    let angle = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180;
    angle = Math.min(angle, 180 - angle);
    if (Math.abs(angle - 45) > HATCH_ANGLE_TOLERANCE) continue;
    line(s.x1 * pxPerUnit, s.y1 * pxPerUnit, s.x2 * pxPerUnit, s.y2 * pxPerUnit, ink, 1, 2);
    const mx = Math.round(((s.x1 + s.x2) / 2) * pxPerUnit);
    const my = Math.round(((s.y1 + s.y2) / 2) * pxPerUnit);
    if (mx >= 0 && my >= 0 && mx < cols && my < rows) {
      strokes[my * cols + mx]!++;
      if ((s.x2 - s.x1) * (s.y2 - s.y1) < 0) rising[my * cols + mx]!++;
    }
  }

  // 2. Closed into solid bands (dilate, then erode, by 3 px), and scraps under
  //    0.04 m² — a dimension chain's ticks, a stray mark — dropped. So is a
  //    piece whose strokes lie sparse: a hatch packs one every 3 cm of wall,
  //    where a table and chairs set square to the diagonal draw a few long
  //    45° edges round a large area, and read as a ring of wall. And so is a
  //    small piece whose strokes lean both ways: a wall's hatch runs one way,
  //    where the figures of a dimension — "380" set in a bedroom — curve
  //    through both diagonals, and a window's closure stopped at them.
  const solid = erode(dilate(ink, cols, rows, 3), cols, rows, 3);
  const hatched = keepLarge(solid, cols, rows, Math.round(400 / (cm * cm)), {
    strokes,
    rising,
    maxPixelsPerStroke: Math.round(120 / (cm * cm)),
  });
  // A private house's sheet fills its walls solid grey instead of hatching
  // them. White fills are the masks under level marks, and coloured ones are
  // furniture, a lawn or paving: only a dark neutral pen is poché. The same
  // sheet hatches its paving and its floor tiles at 45°, which the hatch
  // reader would take for walls, so a floor that actually fills its walls
  // is read from the fill alone.
  const poche = new Uint8Array(n);
  sheet.fills.forEach((tri, k) => {
    if (pochePen(sheet.fillPens?.[k])) fillTriangle(tri, pxPerUnit, poche, cols, rows);
  });
  let pochePx = 0;
  for (let k = 0; k < n; k++) if (poche[k]) pochePx++;
  const pocheM2 = (pochePx * cm * cm) / 10_000;
  const wall = pocheM2 >= 4 ? erode(dilate(poche, cols, rows, 1), cols, rows, 1) : hatched;
  if (pocheM2 < 4) for (let k = 0; k < n; k++) if (poche[k]) wall[k] = 1;
  // A bar of poché that stops a hand short of the next wall is a figure drawn
  // in the room — the gap closer would seal that hand and cut the room in two.
  if (pocheM2 >= 4) dropStubPartitions(wall, cols, rows, cm);

  // 3. Openings closed along each wall line: windows and doorways are gaps in
  //    the hatch. Between two pieces of the same wall up to 3.2 m (a terrace
  //    slider), between a wall's end and a crossing wall up to 1.5 m (a door
  //    beside a corner).
  const sealOpenings = options.sealOpenings !== false;
  const runX = runLengths(wall, cols, rows, true);
  const runY = runLengths(wall, cols, rows, false);
  const longRun = Math.round(60 / cm);
  const along = new Uint8Array(n);
  const across = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!wall[k]) continue;
    // Longer along the line than across it: a stub off a wall's end makes its
    // last pixels thicker than a wall, and a gap from there was never closed.
    if (runX[k]! >= longRun && runX[k]! > runY[k]! * 1.5) along[k] = 1;
    if (runY[k]! >= longRun && runY[k]! > runX[k]! * 1.5) across[k] = 1;
  }
  // The glazing: straight lines along a wall's line across its openings. A
  // run of windows or a terrace slider is wider than any doorway, and is
  // closed wherever glass is drawn across it. A window is drawn as a frame and
  // its panes — lines a few centimetres apart; a floor's tile grid is single
  // lines 25 cm and more apart, and is no glass.
  const glass = new Uint8Array(n);
  for (const s of glazing(sheet.segments, upm)) line(s.x1 * pxPerUnit, s.y1 * pxPerUnit, s.x2 * pxPerUnit, s.y2 * pxPerUnit, glass, 1);
  const closed = new Uint8Array(wall);
  const gaps = {
    tiny: Math.round(40 / cm),
    sameWall: Math.round(320 / cm),
    toCorner: Math.round(150 / cm),
    glazed: Math.round(800 / cm),
    narrowest: Math.round(55 / cm),
    doorway: Math.round(120 / cm),
    longRun,
    corner: Math.round(12 / cm),
  };
  if (sealOpenings) {
    closeGaps(along, runY, wall, closed, cols, rows, true, gaps, glass);
    closeGaps(across, runX, wall, closed, cols, rows, false, gaps, glass);
  }
  // Every door with a swing drawn is shut along both its leaf positions: the
  // doorway then closes whatever wall it stands in, a 45° one included. A
  // door drawn a few centimetres off its jambs leaves a hole at the corner,
  // so each leaf runs a little past both its ends.
  const past = (8 / 100) * upm;
  for (const arc of sealOpenings ? sheet.arcs : []) {
    const rM = arc.r / upm;
    const sweep = arc.end - arc.start;
    if (rM < 0.45 || rM > 1.4 || sweep < 1.2 || sweep > 1.95) continue;
    for (const t of [arc.start, arc.end]) {
      line(
        (arc.cx - past * Math.cos(t)) * pxPerUnit,
        (arc.cy - past * Math.sin(t)) * pxPerUnit,
        (arc.cx + (arc.r + past) * Math.cos(t)) * pxPerUnit,
        (arc.cy + (arc.r + past) * Math.sin(t)) * pxPerUnit,
        closed,
        3,
        2,
      );
    }
  }

  // A closed opening's line can stop a pixel short of the wall it meets at a
  // corner, and a flat's living room then floods out onto its terrace through
  // the hole. Holes of a few centimetres are sealed.
  const barrier = new Uint8Array(n);
  for (let k = 0; k < n; k++) barrier[k] = closed[k] ? 1 : 0;
  const sealed = erode(dilate(barrier, cols, rows, 2), cols, rows, 2);
  for (let k = 0; k < n; k++) if (sealed[k] && !closed[k]) closed[k] = 1;

  // 4. Rooms: the free space flooded, the component touching the edge is outside.
  const room = new Int32Array(n);
  let next = 0;
  const areas: number[] = [0];
  const stack: number[] = [];
  for (let k = 0; k < n; k++) {
    if (closed[k] || room[k]) continue;
    next++;
    let area = 0;
    room[k] = next;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!;
      area++;
      const x = c % cols;
      const y = (c - x) / cols;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0 || closed[nk] || room[nk]) continue;
        room[nk] = next;
        stack.push(nk);
      }
    }
    areas.push((area * cm * cm) / 10_000);
  }
  const outside = room[0] || room[n - 1] || 1;
  const openLinks: Array<[number, number]> = [];
  if (pocheM2 >= 4) {
    next = trimBulges(room, areas, sheet, pxPerUnit, cols, rows, cm, outside, next);
    adoptStairs(closed, wall, room, areas, cols, rows, cm, outside);
    mergeToPrinted(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside);
    fillToPrinted(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside);
    fillMatchedBox(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside);
    fillBites(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside);
    next = trimBulges(room, areas, sheet, pxPerUnit, cols, rows, cm, outside, next);
    next = shapeToPrinted(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside, next, openLinks);
    const sealedPre = new Set<number>();
    for (let id = 1; id < areas.length; id++) {
      if (id !== outside && (areas[id] ?? 0) >= 0.8 && (areas[id] ?? 0) <= 30) sealedPre.add(id);
    }
    next = splitHeavyPairs(room, areas, closed, wall, sheet, pxPerUnit, upm, cols, rows, cm, outside, next, openLinks, {
      minArea: 30,
      minOverlap: 1.5,
      extendM: 5,
    });
    next = splitHeavyPairs(room, areas, closed, wall, sheet, pxPerUnit, upm, cols, rows, cm, outside, next, openLinks, {
      minArea: 24,
      minOverlap: 0.6,
      maxOverlap: 1.5,
      extendM: 5,
      unmatchedOnly: true,
    });
    next = shapeToPrinted(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside, next, openLinks);
    joinOpenFloor(room, areas, closed, wall, sheet, pxPerUnit, cols, rows, cm, outside, openLinks, sealedPre);
  }

  // 5. Names and apartment numbers, from what the sheet writes.
  const at = (x: number, y: number) => {
    const px = Math.round(x * pxPerUnit);
    const py = Math.round(y * pxPerUnit);
    return px >= 0 && py >= 0 && px < cols && py < rows ? room[py * cols + px]! : 0;
  };
  const labels = roomLabels(sheet.texts, { public: options.public });
  // A region holding both the stair core's name and a flat's rooms is the
  // lobby run on into a flat through a doorway drawn with no swing — דירה 3's
  // entrance hall on the reference floor. It is divided between the names,
  // each pixel to the name nearest it through the room.
  const CORE = /לובי|מבואה|מעלית|מדרגות/;
  const STAIR = /מדרגות/;
  const byRoom = new Map<number, typeof labels>();
  for (const label of labels) {
    const id = at(label.x, label.y);
    if (id && id !== outside) byRoom.set(id, [...(byRoom.get(id) ?? []), label]);
  }
  for (const [id, inRoom] of byRoom) {
    const core = inRoom.filter((l) => CORE.test(l.text));
    const flat = inRoom.filter((l) => !CORE.test(l.text));
    if (core.length === 0 || flat.length === 0) continue;
    next++;
    const coreId = next;
    const owner = new Int32Array(n);
    const queue: number[] = [];
    for (const [group, list] of [[coreId, core], [id, flat]] as const) {
      for (const l of list) {
        const k = Math.round(l.y * pxPerUnit) * cols + Math.round(l.x * pxPerUnit);
        if (room[k] === id && !owner[k]) {
          owner[k] = group;
          queue.push(k);
        }
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]!;
      const x = c % cols;
      const y = (c - x) / cols;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0 || room[nk] !== id || owner[nk]) continue;
        owner[nk] = owner[c]!;
        queue.push(nk);
      }
    }
    let coreArea = 0;
    for (let k = 0; k < n; k++) {
      if (owner[k] === coreId) {
        room[k] = coreId;
        coreArea++;
      }
    }
    areas.push((coreArea * cm * cm) / 10_000);
    areas[id] = areas[id]! - areas[coreId]!;
  }

  // A name set over a fitting — a bath's outline, a shower's screen — can
  // land in a sliver the fitting cuts off, or in a wall's hatch: it names the
  // nearest room of a room's size, within 40 cm.
  const named = (x: number, y: number) => {
    const px = Math.round(x * pxPerUnit);
    const py = Math.round(y * pxPerUnit);
    const big = (id: number) => id > 0 && id !== outside && areas[id]! >= 0.8;
    const here = at(x, y);
    if (big(here) || here === outside) return here;
    const reachPx = Math.round(40 / cm);
    for (let r = 1; r <= reachPx; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const qx = px + dx;
          const qy = py + dy;
          if (qx < 0 || qy < 0 || qx >= cols || qy >= rows) continue;
          const id = room[qy * cols + qx]!;
          if (big(id)) return id;
        }
      }
    }
    return here;
  };
  const names = new Map<number, string[]>();
  const kinds = new Map<number, FloorplanRoomKind[]>();
  for (const label of labels) {
    const id = named(label.x, label.y);
    if (!id || id === outside) continue;
    names.set(id, [...(names.get(id) ?? []), label.text]);
    kinds.set(id, [...(kinds.get(id) ?? []), label.kind]);
  }
  // A bedroom the sheet left unnamed still has its bed drawn: a rectangle
  // two metres long, a single's 90 to a double's 180 wide, with a pillow in
  // it — which a stair's flight, as long and as wide, has not. Only a room of
  // a bedroom's size, with no name, is named by it.
  const bedIn = new Set<number>();
  const rects = findRectangles(sheet.segments, { unitsPerMetre: upm, minSideM: 0.2, maxSideM: 2.3 });
  const cmOf = (v: number) => (v / upm) * 100;
  const pillows = rects.filter((r) => {
    const long = cmOf(Math.max(r.w, r.h));
    const short = cmOf(Math.min(r.w, r.h));
    return short >= 25 && long <= 90;
  });
  for (const r of rects) {
    const long = cmOf(Math.max(r.w, r.h));
    const short = cmOf(Math.min(r.w, r.h));
    if (long < 185 || long > 230 || short < 80 || short > 185) continue;
    const inside = (p: { x: number; y: number; w: number; h: number }) =>
      p.x >= r.x && p.y >= r.y && p.x + p.w <= r.x + r.w && p.y + p.h <= r.y + r.h;
    // A flight is cut across by its treads, string to string, again and
    // again; a bed by its blanket's fold at most.
    const across = r.w < r.h ? (p: { w: number }) => p.w : (p: { h: number }) => p.h;
    const along = r.w < r.h ? (p: { h: number }) => p.h : (p: { w: number }) => p.w;
    const treads = rects.filter(
      (p) => inside(p) && Math.abs(cmOf(across(p)) - short) <= 3 && cmOf(along(p)) <= long * 0.8,
    ).length;
    const pillowed = pillows.some((p) => inside(p) && cmOf(across(p)) <= short - 10);
    if (pillowed && treads < 3) bedIn.add(at(r.x + r.w / 2, r.y + r.h / 2));
  }
  const rooms: DwfRoom[] = [];
  for (let id = 1; id <= next; id++) {
    if (id === outside || areas[id]! < 0.8) continue;
    const kind = labelledKind(kinds.get(id) ?? []) ?? (areas[id]! >= 7 && bedIn.has(id) ? "bedroom" : null);
    rooms.push({ id, areaM2: Math.round(areas[id]! * 100) / 100, kind, names: names.get(id) ?? [] });
  }

  // 6. Apartments. First the rooms joined across a door's swing — certain,
  //    and never through the stair core or another flat's numbered room.
  //    Then each room still left over goes to the flat it touches most across
  //    any closed gap: a shower or a ממ"ד door drawn without a swing still
  //    shares a doorway's width with its flat, where a window onto the next
  //    flat's terrace shares a sill.
  const kept = new Set(rooms.map((r) => r.id));
  const doors = new Map<number, Set<number>>();
  const contact = new Map<string, number>();
  const touching = new Set<string>();
  const weakContact = new Map<string, number>();
  const reach = Math.round(25 / cm);
  for (let k = 0; k < n; k++) {
    if (closed[k]! < 2) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    const seen = new Set<number>();
    // 25 cm out, and on through a sliver too small to be a room — two
    // openings drawn one after the other, a door and then a wardrobe's front —
    // to 75 cm, short of any wall.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let t = reach; t <= reach * 3; t++) {
        const px = x + dx * t;
        const py = y + dy * t;
        if (px < 0 || py < 0 || px >= cols || py >= rows) break;
        const q = py * cols + px;
        if (wall[q]) break;
        const id = room[q]!;
        if (kept.has(id)) {
          seen.add(id);
          break;
        }
      }
    }
    if (seen.size < 2) continue;
    for (const p of seen) {
      for (const q of seen) {
        if (p === q) continue;
        if (closed[k] === 3) doors.set(p, (doors.get(p) ?? new Set()).add(q));
        touching.add(`${p}:${q}`);
        if (closed[k] === 2) continue;
        const key = `${p}:${q}`;
        const into = closed[k] === 5 ? weakContact : contact;
        into.set(key, (into.get(key) ?? 0) + 1);
      }
    }
  }
  for (const [a, b] of openLinks) {
    if (!kept.has(a) || !kept.has(b)) continue;
    doors.set(a, (doors.get(a) ?? new Set()).add(b));
    doors.set(b, (doors.get(b) ?? new Set()).add(a));
  }
  // The lobby and the lifts are the building's; a stair only where it opens
  // onto them. A duplex's own stair, "מדרגות" in its hall on the upper floor,
  // opens onto the flat alone.
  const core = new Set(
    rooms.filter((r) => r.names.some((name) => CORE.test(name) && !STAIR.test(name))).map((r) => r.id),
  );
  const stairs = rooms.filter((r) => r.names.some((name) => STAIR.test(name))).map((r) => r.id);
  for (let grown = true; grown; ) {
    grown = false;
    for (const id of stairs) {
      if (!core.has(id) && [...core].some((c) => touching.has(`${id}:${c}`))) {
        core.add(id);
        grown = true;
      }
    }
  }
  // A private house prints a room's size just outside the room, so a mark that
  // lands in the yard takes the nearest room, within 2.5 m.
  const roomNear = (x: number, y: number) => {
    const here = at(x, y);
    if (kept.has(here)) return here;
    const px = Math.round(x * pxPerUnit);
    const py = Math.round(y * pxPerUnit);
    const reach = Math.round(250 / cm);
    let best = 0;
    let bestD = reach * reach + 1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bestD) continue;
        const qx = px + dx;
        const qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= cols || qy >= rows) continue;
        const id = room[qy * cols + qx]!;
        if (!kept.has(id)) continue;
        best = id;
        bestD = d;
      }
    }
    return best;
  };
  const units = (options.units ?? []).map((u) => ({ unit: u.unit, id: roomNear(u.x, u.y) })).filter((u) => kept.has(u.id));
  const numbered = new Set(units.map((u) => u.id));
  // The lobby's floor is set a step below the flats' — "+ 11.78" to their
  // "+ 11.80" — and a part of it cut off by a closed gap still carries its
  // level. An unnamed room marked at a level no flat is at, beside the stair
  // core, is the core's; and so is the shaft or the meter cupboard that
  // opens only onto it (below, where the core outvotes every flat).
  const levels = levelMarks(sheet.texts);
  const flatLevels = new Set(
    levels.filter((l) => numbered.has(at(l.x, l.y))).map((l) => l.value),
  );
  const unnamed = (id: number) => kept.has(id) && !numbered.has(id) && labelledKind(kinds.get(id) ?? []) == null;
  const stepped = new Set(
    flatLevels.size > 0
      ? levels.filter((l) => !flatLevels.has(l.value)).map((l) => at(l.x, l.y)).filter(unnamed)
      : [],
  );
  // The lobby's floor is drawn tiled: a square grid, its lines as far apart
  // one way as the other. A flat's hall and living room are not tiled, and
  // its wet rooms, which are, are named. A stair is drawn in lines both ways
  // too, but its treads close together and its strings far apart.
  const linesAt = new Map<number, { h: number[]; v: number[] }>();
  for (const s of sheet.segments) {
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 0.3 * upm) continue;
    const horizontal = Math.abs(s.y2 - s.y1) < 0.01 * upm;
    const vertical = Math.abs(s.x2 - s.x1) < 0.01 * upm;
    if (!horizontal && !vertical) continue;
    const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * pxPerUnit);
    const through = new Set<number>();
    for (let t = 0; t <= steps; t++) {
      const id = at(s.x1 + ((s.x2 - s.x1) * t) / steps, s.y1 + ((s.y2 - s.y1) * t) / steps);
      if (unnamed(id)) through.add(id);
    }
    for (const id of through) {
      const entry = linesAt.get(id) ?? { h: [], v: [] };
      if (horizontal) entry.h.push(((s.y1 + s.y2) / 2 / upm) * 100);
      else entry.v.push(((s.x1 + s.x2) / 2 / upm) * 100);
      linesAt.set(id, entry);
    }
  }
  /**
   * The gap between neighbouring lines that recurs most, to 2 cm, or null
   * where none recurs: a tile's module, with a dimension line or a
   * cabinet's edge among the tiles left out of it.
   */
  const spacing = (at: number[]) => {
    const distinct = [...at].sort((p, q) => p - q).filter((v, i, all) => i === 0 || v - all[i - 1]! > 2);
    const counts = new Map<number, number>();
    for (let i = 1; i < distinct.length; i++) {
      const gap = Math.round((distinct[i]! - distinct[i - 1]!) / 2) * 2;
      counts.set(gap, (counts.get(gap) ?? 0) + 1);
    }
    const [gap, count] = [...counts].sort((p, q) => q[1] - p[1] || q[0] - p[0])[0] ?? [0, 0];
    return count >= 2 ? gap : null;
  };
  /** How many of the lines stand on one lattice of this module, at its best phase. */
  const onLattice = (at: number[], module: number) => {
    let best = 0;
    for (const phase of at) {
      let fit = 0;
      for (const v of at) {
        const off = (((v - phase) % module) + module) % module;
        if (Math.min(off, module - off) <= 3) fit++;
      }
      best = Math.max(best, fit);
    }
    return best;
  };
  const tiled = (id: number) => {
    const lines = linesAt.get(id);
    if (!lines) return false;
    const h = [...lines.h].sort((p, q) => p - q).filter((v, i, all) => i === 0 || v - all[i - 1]! > 2);
    const v = [...lines.v].sort((p, q) => p - q).filter((x, i, all) => i === 0 || x - all[i - 1]! > 2);
    return [spacing(lines.h), spacing(lines.v)].some(
      (module) =>
        module != null &&
        module >= 20 &&
        onLattice(h, module) >= Math.max(3, h.length * 0.5) &&
        onLattice(v, module) >= Math.max(3, v.length * 0.5),
    );
  };
  const stairOnly = new Set(stairs);
  for (let grown = true; grown; ) {
    grown = false;
    for (const id of kept) {
      if (core.has(id) || !unnamed(id)) continue;
      const beside = [...core].filter((c) => touching.has(`${id}:${c}`));
      const lobbyLike = stepped.has(id) || (tiled(id) && beside.some((c) => !stairOnly.has(c)));
      if (lobbyLike && beside.length > 0) {
        core.add(id);
        grown = true;
      }
    }
  }
  const owner = new Map<number, number>();
  for (const { unit, id } of units) {
    owner.set(id, unit);
    const queue = [id];
    while (queue.length) {
      const c = queue.pop()!;
      for (const nb of doors.get(c) ?? []) {
        if (owner.has(nb) || core.has(nb) || numbered.has(nb)) continue;
        owner.set(nb, unit);
        queue.push(nb);
      }
    }
  }
  // The stair core votes too, as flat -1: a room that opens mostly onto the
  // lobby is the building's, not a flat's. It is decided only once no flat
  // can take a room any more, so a hall is not given to the lobby for being
  // looked at before the flat round it had been.
  const vote = (id: number, through = contact) => {
    const votes = new Map<number, number>();
    for (const [key, count] of through) {
      const [p, q] = key.split(":").map(Number) as [number, number];
      if (p !== id) continue;
      const who = core.has(q) ? -1 : owner.get(q);
      if (who == null) continue;
      votes.set(who, (votes.get(who) ?? 0) + count);
    }
    return [...votes].sort((x, y) => y[1] - x[1])[0]?.[0];
  };
  const open = () => rooms.filter((r) => !owner.has(r.id) && !core.has(r.id));
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of open()) {
      // Through a glazed door or an open passage only where nothing else
      // joins it: the hall before a ממ"ד, open to its flat's corridor.
      const best = vote(r.id) ?? vote(r.id, weakContact);
      if (best == null || best === -1) continue;
      owner.set(r.id, best);
      changed = true;
    }
    if (changed) continue;
    for (const r of open()) {
      if (vote(r.id) !== -1) continue;
      core.add(r.id);
      changed = true;
    }
  }
  // A room the door graph never reached still belongs to the house whose
  // size mark it sits by, when one house is clearly closer than the other.
  const marks = options.units ?? [];
  if (marks.length >= 2) {
    const acc = new Map<number, { x: number; y: number; n: number }>();
    for (let k = 0; k < n; k++) {
      const id = room[k]!;
      if (!kept.has(id) || owner.has(id) || core.has(id)) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      const a = acc.get(id) ?? { x: 0, y: 0, n: 0 };
      a.x += x;
      a.y += y;
      a.n++;
      acc.set(id, a);
    }
    for (const [id, a] of acc) {
      const x = a.x / a.n / pxPerUnit;
      const y = a.y / a.n / pxPerUnit;
      const ranked = marks
        .map((m) => ({ unit: m.unit, d: Math.hypot(m.x - x, m.y - y) }))
        .sort((p, q) => p.d - q.d);
      const first = ranked[0];
      const second = ranked[1];
      if (!first || first.d > 16 * upm) continue;
      if (second && second.d - first.d < 1.5 * upm) continue;
      owner.set(id, first.unit);
    }
  }
  const apartments: DwfApartment[] = units.map(({ unit }) => ({
    unit,
    rooms: rooms.filter((r) => owner.get(r.id) === unit).map((r) => r.id),
  }));

  const wallOut = new Uint8Array(n);
  for (let k = 0; k < n; k++) wallOut[k] = wall[k] ? 1 : closed[k] === 5 ? 2 : closed[k]!;
  return { cols, rows, cm, unitsPerMetre: upm, wall: wallOut, room, outside, rooms, apartments };
}

/** An RGB pen of equal channels, darker than #c0c0c0 and not black. */
function pochePen(pen: number | undefined): boolean {
  if (pen == null || !(pen & 0x1000000)) return false;
  const r = (pen >> 16) & 0xff;
  const g = (pen >> 8) & 0xff;
  const b = pen & 0xff;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && r < 0xc0 && r > 0x30;
}

function fillTriangle(tri: Array<[number, number]>, pxPerUnit: number, into: Uint8Array, cols: number, rows: number): void {
  const [a, b, c] = tri.map(([x, y]) => [x * pxPerUnit, y * pxPerUnit] as const) as [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(area) < 1e-6) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(cols - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(rows - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  // Signed distance of a pixel's centre inside each edge. Half a pixel of
  // slack: a wall drawn as slivers keeps its edges instead of falling apart.
  const inside = (p: readonly [number, number], q: readonly [number, number], x: number, y: number) =>
    (((q[0] - p[0]) * (y - p[1]) - (x - p[0]) * (q[1] - p[1])) * Math.sign(area)) / Math.hypot(q[0] - p[0], q[1] - p[1]) >= -0.5;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (inside(a, b, px, py) && inside(b, c, px, py) && inside(c, a, px, py)) into[y * cols + x] = 1;
    }
  }
}

/**
 * The straight lines of 30 cm and more that have another beside them, the same
 * way, 1.5 to 10 cm off and alongside for half the shorter's length.
 */
function glazing(segments: DwfGeometry["segments"], upm: number): DwfGeometry["segments"] {
  const out: DwfGeometry["segments"] = [];
  for (const horizontal of [true, false]) {
    const lines = segments
      .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= 0.3 * upm)
      .filter((s) => (horizontal ? Math.abs(s.y2 - s.y1) : Math.abs(s.x2 - s.x1)) < 0.01 * upm)
      .map((s) => {
        const at = horizontal ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
        const a = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
        const b = horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
        return { s, at, a, b };
      })
      .sort((p, q) => p.at - q.at);
    const near = 0.015 * upm;
    const far = 0.1 * upm;
    const paired = new Set<number>();
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i]!;
      for (let j = i + 1; j < lines.length && lines[j]!.at - p.at <= far; j++) {
        const q = lines[j]!;
        if (q.at - p.at < near) continue;
        const overlap = Math.min(p.b, q.b) - Math.max(p.a, q.a);
        if (overlap < 0.5 * Math.min(p.b - p.a, q.b - q.a)) continue;
        paired.add(i).add(j);
      }
    }
    for (const i of paired) out.push(lines[i]!.s);
  }
  return out;
}

function dilate(src: Uint8Array, cols: number, rows: number, r: number): Uint8Array {
  return sweep(sweep(src, cols, rows, r, true, true), cols, rows, r, false, true);
}

function erode(src: Uint8Array, cols: number, rows: number, r: number): Uint8Array {
  return sweep(sweep(src, cols, rows, r, true, false), cols, rows, r, false, false);
}

/** A square structuring element, separably: max (dilate) or min (erode) over ±r along one axis. */
function sweep(src: Uint8Array, cols: number, rows: number, r: number, horizontal: boolean, max: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
  for (let line = 0; line < lines; line++) {
    // Count of set pixels in the window, slid along the line.
    let count = 0;
    for (let i = 0; i < Math.min(len, r + 1); i++) count += src[idx(line, i)]! ? 1 : 0;
    for (let i = 0; i < len; i++) {
      const lo = Math.max(0, i - r);
      const hi = Math.min(len - 1, i + r);
      const width = hi - lo + 1;
      out[idx(line, i)] = max ? (count > 0 ? 1 : 0) : count === width ? 1 : 0;
      if (i - r >= 0) count -= src[idx(line, i - r)]! ? 1 : 0;
      if (i + r + 1 < len) count += src[idx(line, i + r + 1)]! ? 1 : 0;
    }
  }
  return out;
}

function keepLarge(
  src: Uint8Array,
  cols: number,
  rows: number,
  minPixels: number,
  dense?: { strokes: Uint16Array; rising: Uint16Array; maxPixelsPerStroke: number },
): Uint8Array {
  const out = new Uint8Array(src.length);
  const seen = new Uint8Array(src.length);
  const stack: number[] = [];
  const members: number[] = [];
  for (let k = 0; k < src.length; k++) {
    if (!src[k] || seen[k]) continue;
    members.length = 0;
    seen[k] = 1;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!;
      members.push(c);
      const x = c % cols;
      const y = (c - x) / cols;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0 || !src[nk] || seen[nk]) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    let count = 0;
    let up = 0;
    if (dense) {
      for (const m of members) {
        count += dense.strokes[m]!;
        up += dense.rising[m]!;
      }
    }
    const packed = !dense || members.length <= count * dense.maxPixelsPerStroke;
    const figure = dense != null && count < 16 && Math.min(up, count - up) >= count * 0.25;
    if (members.length >= minPixels && packed && !figure) for (const m of members) out[m] = 1;
  }
  return out;
}

function runLengths(src: Uint8Array, cols: number, rows: number, horizontal: boolean): Uint16Array {
  const out = new Uint16Array(src.length);
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
  for (let line = 0; line < lines; line++) {
    let i = 0;
    while (i < len) {
      if (!src[idx(line, i)]) {
        i++;
        continue;
      }
      let j = i;
      while (j < len && src[idx(line, j)]) j++;
      for (let k = i; k < j; k++) out[idx(line, k)] = Math.min(65535, j - i);
      i = j;
    }
  }
  return out;
}

/**
 * A thin poché bar that does not run from one wall to the next. One end a
 * hand from the next wall would be sealed shut and split the room; a bar
 * with a real doorway (wider than half a metre) at its end stays, and so
 * does a pier standing in line between two doorways.
 */
function dropStubPartitions(wall: Uint8Array, cols: number, rows: number, cm: number): void {
  const seen = new Uint8Array(wall.length);
  const stack: number[] = [];
  const comps: number[][] = [];
  for (let start = 0; start < wall.length; start++) {
    if (!wall[start] || seen[start]) continue;
    const comp: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const x = c % cols;
      const y = (c - x) / cols;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0 || !wall[nk] || seen[nk]) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    comps.push(comp);
  }
  const idOf = new Int32Array(wall.length);
  comps.forEach((comp, i) => {
    for (const c of comp) idOf[c] = i + 1;
  });
  const reach = Math.round(50 / cm);
  const touch = Math.round(8 / cm);
  const nearest = (x: number, y: number, dx: number, dy: number, self: number, upTo = reach) => {
    for (let s = 1; s <= upTo; s++) {
      const cx = x + dx * s;
      const cy = y + dy * s;
      for (let p = -2; p <= 2; p++) {
        const xx = cx + dy * p;
        const yy = cy + dx * p;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const id = idOf[yy * cols + xx]!;
        if (id && id !== self) return s;
      }
    }
    return upTo + 1;
  };
  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i]!;
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (const c of comp) {
      const x = c % cols;
      const y = (c - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const wPx = x1 - x0 + 1;
    const hPx = y1 - y0 + 1;
    const thick = Math.min(wPx, hPx) * cm;
    const long = Math.max(wPx, hPx) * cm;
    if (thick > 28 || long < 40 || long > 320) continue;
    const vertical = hPx >= wPx;
    let endLo = comp[0]!;
    let endHi = comp[0]!;
    for (const c of comp) {
      const v = vertical ? (c - (c % cols)) / cols : c % cols;
      const lo = vertical ? (endLo - (endLo % cols)) / cols : endLo % cols;
      const hi = vertical ? (endHi - (endHi % cols)) / cols : endHi % cols;
      if (v < lo) endLo = c;
      if (v > hi) endHi = c;
    }
    const self = i + 1;
    const loX = endLo % cols;
    const loY = (endLo - loX) / cols;
    const hiX = endHi % cols;
    const hiY = (endHi - hiX) / cols;
    const gLo = nearest(loX, loY, vertical ? 0 : -1, vertical ? -1 : 0, self);
    const gHi = nearest(hiX, hiY, vertical ? 0 : 1, vertical ? 1 : 0, self);
    const attached = (gLo <= touch ? 1 : 0) + (gHi <= touch ? 1 : 0);
    const free = Math.max(gLo, gHi);
    const stub = attached === 0 || (attached === 1 && free > touch && free <= reach);
    if (!stub) continue;
    if (attached === 0) {
      const door = Math.round(120 / cm);
      const pierLo = nearest(loX, loY, vertical ? 0 : -1, vertical ? -1 : 0, self, door);
      const pierHi = nearest(hiX, hiY, vertical ? 0 : 1, vertical ? 1 : 0, self, door);
      if (pierLo <= door && pierHi <= door) continue;
    }
    for (const c of comp) wall[c] = 0;
  }
}

/** A stair drawn as its own filled block, surrounded by one room, is that room's floor. */
function adoptStairs(
  closed: Uint8Array,
  wall: Uint8Array,
  room: Int32Array,
  areas: number[],
  cols: number,
  rows: number,
  cm: number,
  outside: number,
): void {
  const seen = new Uint8Array(closed.length);
  const stack: number[] = [];
  for (let start = 0; start < closed.length; start++) {
    if (closed[start] !== 1 || seen[start]) continue;
    const comp: number[] = [];
    seen[start] = 1;
    stack.push(start);
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const x = c % cols;
      const y = (c - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0 || closed[nk] !== 1 || seen[nk]) continue;
        seen[nk] = 1;
        stack.push(nk);
      }
    }
    const w = (x1 - x0 + 1) * cm;
    const h = (y1 - y0 + 1) * cm;
    const areaCm = comp.length * cm * cm;
    if (areaCm < 5000 || areaCm > 14000) continue;
    if (Math.max(w, h) > 220 || Math.max(w, h) / Math.min(w, h) > 1.8) continue;
    // A stair's block is filled whole and stands inside: an L of wall at a
    // corner, between two windows, fills under half its box and meets the
    // outside — read as a stair, Gottlieb A's upper corners stood open (13/10/2026).
    if (areaCm < 0.7 * w * h) continue;
    const neighbors = new Set<number>();
    let outdoors = false;
    for (const c of comp) {
      const x = c % cols;
      const y = (c - x) / cols;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0 || closed[nk]) continue;
        const id = room[nk]!;
        if (id === outside) outdoors = true;
        else if (id) neighbors.add(id);
      }
    }
    if (outdoors || neighbors.size !== 1) continue;
    const id = [...neighbors][0]!;
    for (const c of comp) {
      closed[c] = 0;
      wall[c] = 0;
      room[c] = id;
    }
    areas[id] = (areas[id] ?? 0) + areaCm / 10_000;
  }
}

const PRINTED_ROOM = /^\s*(\d{1,2}\.\d{2})\s*\*\s*(\d{1,2}\.\d{2})\s*$/;

/**
 * Room sizes as printed. A size is sometimes split across text items — "2.83*4."
 * then "8" then "0", "3.00" then "*" then "3.40", or "2." then "83" then
 * "*4.70" — so the pieces on one baseline are read as one label. The point is
 * the label's middle.
 */
export function printedRooms(texts: DwfGeometry["texts"]): Array<{ x: number; y: number; w: number; h: number }> {
  const width = (text: string, height: number) => text.trim().length * height * 0.55;
  const pending = texts.map((t, i) => ({ t, i })).sort((a, b) => a.t.y - b.t.y || a.t.x - b.t.x);
  const used = new Set<number>();
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const { t: start, i } of pending) {
    if (used.has(i)) continue;
    let text = start.text.trim();
    let end = start.x + width(text, start.height);
    used.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (const { t: next, i: j } of pending) {
        if (used.has(j)) continue;
        const bit = next.text.trim();
        if (bit.length === 0 || bit.length > 2) continue;
        if (Math.abs(next.y - start.y) > start.height * 0.35 || Math.abs(next.height - start.height) > 1) continue;
        if (next.x < end - start.height || next.x > end + start.height * 0.5) continue;
        text += bit;
        end = next.x + width(bit, next.height);
        used.add(j);
        grew = true;
      }
    }
    if (/^\d{1,2}\.\d{2}\s*\*?$/.test(text)) {
      const rest = text.endsWith("*") ? /^\d{1,2}\.\d{2}$/ : /^\*\s*\d{1,2}\.\d{2}$/;
      for (const { t: next, i: j } of pending) {
        if (used.has(j)) continue;
        const bit = next.text.trim();
        if (!rest.test(bit)) continue;
        if (Math.abs(next.y - start.y) > start.height * 0.35 || Math.abs(next.height - start.height) > 1) continue;
        if (next.x < end - start.height || next.x > end + start.height * 1.5) continue;
        text += bit;
        end = next.x + width(bit, next.height);
        used.add(j);
        break;
      }
    }
    const m = PRINTED_ROOM.exec(text);
    if (!m) continue;
    out.push({ x: (start.x + end) / 2, y: start.y - start.height / 2, w: Number(m[1]), h: Number(m[2]) });
  }
  return out;
}

/**
 * A room that holds a printed size and is larger than it: the printed
 * rectangle is the run of rows (and columns) of that size, and what sticks
 * out past it — a leak along the facade — is a different space.
 */
/**
 * Pieces cut out of one open floor, none of them a printed room, go back
 * together. A piece that already is a printed rectangle stays put, and so
 * does a floor that still carries a size it is much larger than.
 */
function joinOpenFloor(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
  openLinks: Array<[number, number]>,
  sealedPre: Set<number>,
): void {
  const labels = printedRooms(sheet.texts);
  const boxOf = (id: number) => {
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    let n = 0;
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id) continue;
      n++;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, n };
  };
  const printedBox = (id: number) => {
    const b = boxOf(id);
    if (b.n === 0) return false;
    const bw = ((b.x1 - b.x0 + 1) * cm) / 100;
    const bh = ((b.y1 - b.y0 + 1) * cm) / 100;
    return labels.some(
      (t) =>
        (Math.abs(bw - t.w) <= 0.22 && Math.abs(bh - t.h) <= 0.22) ||
        (Math.abs(bw - t.h) <= 0.22 && Math.abs(bh - t.w) <= 0.22),
    );
  };
  const sides = (id: number) => {
    const b = boxOf(id);
    if (b.n === 0) return null;
    return { w: ((b.x1 - b.x0 + 1) * cm) / 100, h: ((b.y1 - b.y0 + 1) * cm) / 100 };
  };
  const stripOf = (id: number) => {
    const s = sides(id);
    return s != null && Math.min(s.w, s.h) <= 2.7 && Math.max(s.w, s.h) >= 4;
  };
  // The run beside the open floor is the stair. It is not part of the salon.
  const stairStrip = (id: number) => {
    const s = sides(id);
    return s != null && Math.min(s.w, s.h) <= 2.3 && Math.max(s.w, s.h) >= 6;
  };
  const hostsLoose = (id: number) => {
    const area = areas[id] ?? 0;
    if (area < 0.8) return false;
    for (const t of labels) {
      const printed = t.w * t.h;
      if (printed < 2 || Math.abs(area / printed - 1) <= 0.15) continue;
      const px = Math.round(t.x * pxPerUnit);
      const py = Math.round(t.y * pxPerUnit);
      if (px < 0 || py < 0 || px >= cols || py >= rows || room[py * cols + px] !== id) continue;
      const owned = areas.some((there, other) => {
        if (other === id || there < 0.8 || Math.abs(there / printed - 1) > 0.12) return false;
        const b = boxOf(other);
        if (b.n === 0) return false;
        const dx = px < b.x0 ? b.x0 - px : px > b.x1 ? px - b.x1 : 0;
        const dy = py < b.y0 ? b.y0 - py : py > b.y1 ? py - b.y1 : 0;
        return (Math.hypot(dx, dy) * cm) / 100 <= 1;
      });
      if (!owned) return true;
    }
    return false;
  };
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    const p = parent.get(id);
    if (p == null || p === id) {
      parent.set(id, id);
      return id;
    }
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const [a, b] of openLinks) {
    if ((areas[a] ?? 0) < 0.4 && (areas[b] ?? 0) < 0.4) continue;
    unite(a, b);
  }
  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    if ((areas[id] ?? 0) < 0.4) continue;
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  const absorb = (open: number[]) => {
    if (open.length < 2) return;
    const keep = open.slice().sort((a, b) => (areas[b] ?? 0) - (areas[a] ?? 0))[0]!;
    const set = new Set(open);
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (const id of open) {
      const b = boxOf(id);
      if (b.x0 < x0) x0 = b.x0;
      if (b.y0 < y0) y0 = b.y0;
      if (b.x1 > x1) x1 = b.x1;
      if (b.y1 > y1) y1 = b.y1;
    }
    const inset = Math.round(12 / cm);
    for (let y = y0 + inset; y <= y1 - inset; y++) {
      for (let x = x0 + inset; x <= x1 - inset; x++) {
        const k = y * cols + x;
        if (!closed[k] && !wall[k]) continue;
        let own = false;
        let foreign = false;
        for (const nk of [k - 1, k + 1, k - cols, k + cols]) {
          if (nk < 0 || nk >= room.length) continue;
          const rid = room[nk]!;
          if (!rid || rid === outside) {
            if (rid === outside) foreign = true;
            continue;
          }
          if (set.has(rid)) own = true;
          else foreign = true;
        }
        if (!own || foreign) continue;
        closed[k] = 0;
        wall[k] = 0;
        room[k] = keep;
      }
    }
    for (const id of open) {
      if (id === keep) continue;
      for (let k = 0; k < room.length; k++) if (room[k] === id) room[k] = keep;
      areas[id] = 0;
    }
    let n = 0;
    for (let k = 0; k < room.length; k++) if (room[k] === keep) n++;
    areas[keep] = (n * cm * cm) / 10_000;
    for (const id of open) {
      if (id === keep || (areas[id] ?? 0) < 0.4) continue;
      openLinks.push([keep, id]);
    }
  };
  for (const members of groups.values()) {
    const stairIds = new Set(members.filter((id) => id !== outside && stairStrip(id) && (areas[id] ?? 0) >= 0.4));
    absorb([...stairIds]);
    const open = members.filter(
      (id) => id !== outside && !sealedPre.has(id) && !printedBox(id) && !stairIds.has(id) && (areas[id] ?? 0) >= 0.4,
    );
    if (open.length < 2 || open.some((id) => hostsLoose(id)) || !open.some(stripOf)) continue;
    absorb(open);
    const keep = open.find((id) => (areas[id] ?? 0) >= 0.4);
    if (keep == null) continue;
    for (const id of members) {
      if (id !== keep && (areas[id] ?? 0) >= 0.4) openLinks.push([keep, id]);
    }
  }
}

/**
 * A room wider than any one printed room, with a pair of heavy black lines
 * running through it: those lines are a wall the poché fill did not close.
 * The strip between the pair, extended through that room only, becomes a wall.
 */
function splitHeavyPairs(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  upm: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
  next: number,
  openLinks: Array<[number, number]>,
  gate: { minArea: number; minOverlap: number; maxOverlap?: number; extendM?: number; unmatchedOnly?: boolean },
): number {
  const labels = gate.unmatchedOnly ? printedRooms(sheet.texts) : [];
  const ids: number[] = [];
  for (let id = 1; id < areas.length; id++) {
    if (id === outside || (areas[id] ?? 0) <= gate.minArea) continue;
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const long = (Math.max(x1 - x0, y1 - y0) * cm) / 100;
    if (long <= 6) continue;
    if (gate.unmatchedOnly) {
      const area = areas[id] ?? 0;
      const near = labels.some((t) => {
        const printed = t.w * t.h;
        if (printed < 2 || Math.abs(area / printed - 1) > 0.3) return false;
        const px = Math.round(t.x * pxPerUnit);
        const py = Math.round(t.y * pxPerUnit);
        return px >= x0 - Math.round(250 / cm) && px <= x1 + Math.round(250 / cm) && py >= y0 - Math.round(250 / cm) && py <= y1 + Math.round(250 / cm);
      });
      if (near) continue;
    }
    ids.push(id);
  }
  type Line = { a0: number; a1: number; p: number; horizontal: boolean };
  for (const id of ids) {
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const lines: Line[] = [];
    for (const s of sheet.segments) {
      if ((s.stroke ?? -1) !== 0 || s.lineWidth < 1) continue;
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm < 0.2) continue;
      const horizontal = Math.abs(s.y2 - s.y1) < 0.02 * upm;
      const vertical = Math.abs(s.x2 - s.x1) < 0.02 * upm;
      if (!horizontal && !vertical) continue;
      const mx = Math.round(((s.x1 + s.x2) / 2) * pxPerUnit);
      const my = Math.round(((s.y1 + s.y2) / 2) * pxPerUnit);
      if (mx < x0 - 5 || mx > x1 + 5 || my < y0 - 5 || my > y1 + 5) continue;
      const a0 = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const a1 = horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      const p = horizontal ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
      const hit = lines.find(
        (l) => l.horizontal === horizontal && Math.abs(l.p - p) < 0.02 * upm && a0 <= l.a1 + 0.15 * upm && a1 >= l.a0 - 0.15 * upm,
      );
      if (hit) {
        hit.a0 = Math.min(hit.a0, a0);
        hit.a1 = Math.max(hit.a1, a1);
      } else lines.push({ a0, a1, p, horizontal });
    }
    const painted: number[] = [];
    const paint = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      const k = y * cols + x;
      if (room[k] !== id) return false;
      room[k] = 0;
      wall[k] = 1;
      closed[k] = 1;
      painted.push(k);
      return true;
    };
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const p = lines[i]!;
        const q = lines[j]!;
        if (p.horizontal !== q.horizontal) continue;
        const gap = Math.abs(p.p - q.p) / upm;
        if (gap < 0.08 || gap > 0.22) continue;
        const a0 = Math.max(p.a0, q.a0);
        const a1 = Math.min(p.a1, q.a1);
        if ((a1 - a0) / upm < gate.minOverlap || (a1 - a0) / upm >= (gate.maxOverlap ?? Infinity)) continue;
        const along0 = Math.round(a0 * pxPerUnit);
        const along1 = Math.round(a1 * pxPerUnit);
        const across0 = Math.round(Math.min(p.p, q.p) * pxPerUnit);
        const across1 = Math.round(Math.max(p.p, q.p) * pxPerUnit);
        for (let a = along0; a <= along1; a++) {
          for (let b = across0; b <= across1; b++) paint(p.horizontal ? a : b, p.horizontal ? b : a);
        }
        for (const dir of [-1, 1]) {
          const start = dir < 0 ? along0 : along1;
          for (let t = 1; t <= Math.round(((gate.extendM ?? 5) * 100) / cm); t++) {
            let hit = false;
            for (let b = across0; b <= across1; b++) {
              const x = p.horizontal ? start + dir * t : b;
              const y = p.horizontal ? b : start + dir * t;
              if (paint(x, y)) hit = true;
            }
            if (!hit) break;
          }
        }
      }
    }
    const sliver = (comp: number[]) => {
      let x0s = cols;
      let y0s = rows;
      let x1s = 0;
      let y1s = 0;
      for (const k of comp) {
        const x = k % cols;
        const y = (k - x) / cols;
        if (x < x0s) x0s = x;
        if (y < y0s) y0s = y;
        if (x > x1s) x1s = x;
        if (y > y1s) y1s = y;
      }
      const w = ((x1s - x0s + 1) * cm) / 100;
      const h = ((y1s - y0s + 1) * cm) / 100;
      return Math.min(w, h) < 1.15 && Math.max(w, h) > 4;
    };
    const components = () => {
      const seen0 = new Uint8Array(room.length);
      const stack0: number[] = [];
      const found: number[][] = [];
      for (let k = 0; k < room.length; k++) {
        if (room[k] !== id || seen0[k]) continue;
        const comp: number[] = [];
        seen0[k] = 1;
        stack0.push(k);
        while (stack0.length) {
          const c = stack0.pop()!;
          comp.push(c);
          const x = c % cols;
          const y = (c - x) / cols;
          for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
            if (nk < 0 || seen0[nk] || room[nk] !== id) continue;
            seen0[nk] = 1;
            stack0.push(nk);
          }
        }
        found.push(comp);
      }
      return found;
    };
    for (let pass = 0; pass < 4; pass++) {
      const parts0 = components();
      const thin = parts0.filter(sliver);
      if (thin.length === 0) break;
      const thinPx = new Uint8Array(room.length);
      for (const comp of thin) for (const k of comp) thinPx[k] = 1;
      let opened = false;
      for (const k of painted) {
        if (room[k] !== 0) continue;
        const x = k % cols;
        const y = (k - x) / cols;
        let touchThin = false;
        let touchOut = false;
        for (const nk of [x > 0 ? k - 1 : -1, x < cols - 1 ? k + 1 : -1, y > 0 ? k - cols : -1, y < rows - 1 ? k + cols : -1]) {
          if (nk < 0) continue;
          if (thinPx[nk]) touchThin = true;
          if (room[nk] === outside) touchOut = true;
        }
        if (!touchThin || touchOut) continue;
        room[k] = id;
        wall[k] = 0;
        closed[k] = 0;
        opened = true;
      }
      if (!opened) break;
    }
    const seen = new Uint8Array(room.length);
    const stack: number[] = [];
    const parts: number[][] = [];
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id || seen[k]) continue;
      const comp: number[] = [];
      seen[k] = 1;
      stack.push(k);
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        const x = c % cols;
        const y = (c - x) / cols;
        for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
          if (nk < 0 || seen[nk] || room[nk] !== id) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      parts.push(comp);
    }
    if (parts.length < 2) continue;
    parts.sort((a, b) => b.length - a.length);
    areas[id] = (parts[0]!.length * cm * cm) / 10_000;
    for (const comp of parts.slice(1)) {
      const m2 = (comp.length * cm * cm) / 10_000;
      if (m2 < 0.4) {
        for (const k of comp) room[k] = id;
        areas[id] = (areas[id] ?? 0) + m2;
        continue;
      }
      next++;
      for (const k of comp) room[k] = next;
      areas[next] = m2;
      openLinks.push([id, next]);
    }
  }
  return next;
}

function trimBulges(
  room: Int32Array,
  areas: number[],
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
  next: number,
): number {
  const labels = printedRooms(sheet.texts);
  const reach = Math.round(150 / cm);
  const roomAt = (px: number, py: number) => {
    const here = px >= 0 && py >= 0 && px < cols && py < rows ? room[py * cols + px]! : 0;
    if (here && here !== outside && areas[here]! >= 0.8) return here;
    let best = 0;
    let bestD = reach * reach + 1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bestD) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const id = room[y * cols + x]!;
        if (!id || id === outside || areas[id]! < 0.8) continue;
        best = id;
        bestD = d;
      }
    }
    return best;
  };
  const target = new Map<number, number>();
  for (const t of labels) {
    const printed = t.w * t.h;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    const id = roomAt(px, py);
    if (!id) continue;
    target.set(id, Math.max(target.get(id) ?? 0, printed));
  }
  for (const [id, printed] of target) {
    if (areas[id]! < printed * 1.04 || areas[id]! > printed * 1.4) continue;
    const anchor = labels
      .map((t) => {
        if (Math.abs(t.w * t.h - printed) > 0.01) return null;
        const px = Math.round(t.x * pxPerUnit);
        const py = Math.round(t.y * pxPerUnit);
        return roomAt(px, py) === id ? { px, py, w: t.w, h: t.h } : null;
      })
      .find((p) => p != null);
    if (!anchor) continue;
    const px = anchor.px;
    const py = anchor.py;
    const cut = (horizontal: boolean) => {
      if (areas[id]! < printed * 1.04) return;
      const spans: Array<{ a0: number; a1: number; w: number }> = [];
      const outer = horizontal ? rows : cols;
      const inner = horizontal ? cols : rows;
      for (let o = 0; o < outer; o++) {
        let a0 = inner;
        let a1 = -1;
        let n = 0;
        for (let i = 0; i < inner; i++) {
          const k = horizontal ? o * cols + i : i * cols + o;
          if (room[k] !== id) continue;
          n++;
          if (i < a0) a0 = i;
          if (i > a1) a1 = i;
        }
        if (n > 5) spans.push({ a0, a1, w: (n * cm) / 100 });
      }
      if (spans.length < 4) return;
      const rounded = spans.map((s) => Math.round(s.w * 10) / 10);
      const counts = new Map<number, number>();
      for (const w of rounded) counts.set(w, (counts.get(w) ?? 0) + 1);
      const sides = [anchor.w, anchor.h];
      const prefer = [...counts]
        .filter(([w, n]) => n >= spans.length * 0.3 && sides.some((s) => Math.abs(w - s) <= 0.15))
        .sort((a, b) => {
          const da = Math.min(...sides.map((s) => Math.abs(a[0] - s)));
          const db = Math.min(...sides.map((s) => Math.abs(b[0] - s)));
          return da - db || b[1] - a[1];
        })[0];
      const modal = prefer ? prefer[0] : [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      const body = spans.filter((s) => Math.abs(s.w - modal) < 0.25);
      if (body.length < spans.length * 0.4) return;
      const mid = (vals: number[]) => [...vals].sort((a, b) => a - b)[vals.length >> 1]!;
      const a0 = mid(body.map((s) => s.a0));
      const a1 = mid(body.map((s) => s.a1));
      const anchorOn = horizontal ? px : py;
      const slop = Math.round(20 / cm);
      const onRoom = px >= 0 && py >= 0 && px < cols && py < rows && room[py * cols + px] === id;
      if (onRoom && (anchorOn < a0 - slop || anchorOn > a1 + slop)) return;
      const bulge: number[] = [];
      for (let o = 0; o < outer; o++) {
        for (let i = 0; i < inner; i++) {
          const k = horizontal ? o * cols + i : i * cols + o;
          if (room[k] !== id) continue;
          if (i < a0 - 1 || i > a1 + 1) bulge.push(k);
        }
      }
      const bulgeM2 = (bulge.length * cm * cm) / 10_000;
      const after = areas[id]! - bulgeM2;
      if (bulgeM2 < 0.3 || Math.abs(after - printed) >= Math.abs(areas[id]! - printed)) return;
      next++;
      for (const k of bulge) room[k] = next;
      areas[id] = after;
      areas[next] = bulgeM2;
    };
    cut(true);
    cut(false);
  }
  return next;
}

/**
 * Rooms a printed size was cut through: their combined outline is that
 * size, so the poché between them is a figure, not a wall.
 */
function mergeToPrinted(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
): void {
  const boxOf = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  for (let k = 0; k < room.length; k++) {
    const id = room[k]!;
    if (!id || id === outside || areas[id]! < 0.8) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    const b = boxOf.get(id) ?? { x0: x, y0: y, x1: x, y1: y };
    if (x < b.x0) b.x0 = x;
    if (y < b.y0) b.y0 = y;
    if (x > b.x1) b.x1 = x;
    if (y > b.y1) b.y1 = y;
    boxOf.set(id, b);
  }
  const nearM = Math.round(200 / cm);
  const tol = Math.round(12 / cm);
  const ids = [...boxOf.keys()];
  for (const t of printedRooms(sheet.texts)) {
    const wM = t.w;
    const hM = t.h;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    const near = ids.filter((id) => {
      const b = boxOf.get(id)!;
      const dx = px < b.x0 ? b.x0 - px : px > b.x1 ? px - b.x1 : 0;
      const dy = py < b.y0 ? b.y0 - py : py > b.y1 ? py - b.y1 : 0;
      return dx * dx + dy * dy <= nearM * nearM;
    });
    let best: number[] | null = null;
    let bestErr = Infinity;
    const consider = (set: number[]) => {
      let x0 = cols;
      let y0 = rows;
      let x1 = 0;
      let y1 = 0;
      let area = 0;
      for (const id of set) {
        const b = boxOf.get(id)!;
        area += areas[id]!;
        if (b.x0 < x0) x0 = b.x0;
        if (b.y0 < y0) y0 = b.y0;
        if (b.x1 > x1) x1 = b.x1;
        if (b.y1 > y1) y1 = b.y1;
      }
      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const fit =
        (Math.abs(bw - Math.round((wM * 100) / cm)) <= tol && Math.abs(bh - Math.round((hM * 100) / cm)) <= tol) ||
        (Math.abs(bw - Math.round((hM * 100) / cm)) <= tol && Math.abs(bh - Math.round((wM * 100) / cm)) <= tol);
      if (!fit || area < ((bw * bh * cm * cm) / 10_000) * 0.7) return;
      const err = Math.abs(area - wM * hM);
      if (err < bestErr) {
        bestErr = err;
        best = set;
      }
    };
    const walk = (start: number, acc: number[]) => {
      consider(acc);
      if (acc.length === 4) return;
      for (let i = start; i < near.length; i++) walk(i + 1, [...acc, near[i]!]);
    };
    walk(0, []);
    const found = best as number[] | null;
    if (!found || found.length < 2) continue;
    const seed = boxOf.get(found[0]!)!;
    let ux0 = seed.x0;
    let uy0 = seed.y0;
    let ux1 = seed.x1;
    let uy1 = seed.y1;
    for (const id of found) {
      const b = boxOf.get(id)!;
      if (b.x0 < ux0) ux0 = b.x0;
      if (b.y0 < uy0) uy0 = b.y0;
      if (b.x1 > ux1) ux1 = b.x1;
      if (b.y1 > uy1) uy1 = b.y1;
    }
    for (const id of ids) {
      if (found.includes(id)) continue;
      const b = boxOf.get(id)!;
      if (b.x0 >= ux0 - tol && b.x1 <= ux1 + tol && b.y0 >= uy0 - tol && b.y1 <= uy1 + tol) found.push(id);
    }
    const keep = found.slice().sort((a, b) => areas[b]! - areas[a]!)[0]!;
    const set = new Set(found);
    const b0 = boxOf.get(found[0]!)!;
    let x0 = b0.x0;
    let y0 = b0.y0;
    let x1 = b0.x1;
    let y1 = b0.y1;
    for (const id of found) {
      const b = boxOf.get(id)!;
      if (b.x0 < x0) x0 = b.x0;
      if (b.y0 < y0) y0 = b.y0;
      if (b.x1 > x1) x1 = b.x1;
      if (b.y1 > y1) y1 = b.y1;
    }
    const inset = Math.round(12 / cm);
    let added = 0;
    for (let y = y0 + inset; y <= y1 - inset; y++) {
      for (let x = x0 + inset; x <= x1 - inset; x++) {
        const k = y * cols + x;
        if (!closed[k]) continue;
        let foreign = false;
        let own = false;
        for (const nk of [k - 1, k + 1, k - cols, k + cols]) {
          if (nk < 0 || nk >= room.length) continue;
          const id = room[nk]!;
          if (!id || id === outside) continue;
          if (set.has(id)) own = true;
          else foreign = true;
        }
        if (!own || foreign) continue;
        closed[k] = 0;
        wall[k] = 0;
        room[k] = keep;
        added++;
      }
    }
    for (const id of found) {
      if (id === keep) continue;
      for (let k = 0; k < room.length; k++) if (room[k] === id) room[k] = keep;
      areas[keep] = (areas[keep] ?? 0) + (areas[id] ?? 0);
      areas[id] = 0;
    }
    areas[keep] = (areas[keep] ?? 0) + (added * cm * cm) / 10_000;
  }
}

/**
 * A filled block shut inside a room, small enough to be a figure, comes back
 * into the floor when that brings the room onto its printed size.
 */
/** A room whose outline is the printed rectangle keeps the enclosed specks inside it. */
function fillMatchedBox(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
): void {
  const reach = Math.round(200 / cm);
  const tol = Math.round(12 / cm);
  const nearest = (px: number, py: number) => {
    let id = 0;
    let best = reach * reach + 1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= best) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const here = room[y * cols + x]!;
        if (!here || here === outside || areas[here]! < 0.8) continue;
        id = here;
        best = d;
      }
    }
    return id;
  };
  const boxOf = (id: number) => {
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  };
  for (const t of printedRooms(sheet.texts)) {
    const wM = t.w;
    const hM = t.h;
    const printed = wM * hM;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    const id = nearest(px, py);
    const area = areas[id] ?? 0;
    if (!area || area >= printed) continue;
    const b = boxOf(id);
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const fit =
      (Math.abs(bw - Math.round((wM * 100) / cm)) <= tol && Math.abs(bh - Math.round((hM * 100) / cm)) <= tol) ||
      (Math.abs(bw - Math.round((hM * 100) / cm)) <= tol && Math.abs(bh - Math.round((wM * 100) / cm)) <= tol);
    if (!fit) continue;
    const w = bw;
    const h = bh;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      const i = (y - b.y0) * w + (x - b.x0);
      if (seen[i] || room[y * cols + x] === id) return;
      seen[i] = 1;
      stack.push(i);
    };
    for (let x = b.x0; x <= b.x1; x++) {
      push(x, b.y0);
      push(x, b.y1);
    }
    for (let y = b.y0; y <= b.y1; y++) {
      push(b.x0, y);
      push(b.x1, y);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = b.x0 + (i % w);
      const y = b.y0 + ((i - (i % w)) / w);
      if (x > b.x0) push(x - 1, y);
      if (x < b.x1) push(x + 1, y);
      if (y > b.y0) push(x, y - 1);
      if (y < b.y1) push(x, y + 1);
    }
    const hole: number[] = [];
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const k = y * cols + x;
        if (room[k] || seen[(y - b.y0) * w + (x - b.x0)]) continue;
        hole.push(k);
      }
    }
    const m2 = (hole.length * cm * cm) / 10_000;
    if (m2 < 0.02 || Math.abs(area + m2 - printed) >= Math.abs(area - printed)) continue;
    for (const k of hole) {
      wall[k] = 0;
      closed[k] = 0;
      room[k] = id;
    }
    areas[id] = area + m2;
  }
}

/** A matched rectangle keeps the notches cut into its edge. */
function fillBites(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
): void {
  const reach = Math.round(200 / cm);
  const tol = Math.round(12 / cm);
  const nearest = (px: number, py: number) => {
    let id = 0;
    let best = reach * reach + 1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= best) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const here = room[y * cols + x]!;
        if (!here || here === outside || areas[here]! < 0.8) continue;
        id = here;
        best = d;
      }
    }
    return id;
  };
  for (const t of printedRooms(sheet.texts)) {
    const printed = t.w * t.h;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    const id = nearest(px, py);
    const area = areas[id] ?? 0;
    if (!area || area >= printed || area < printed * 0.9) continue;
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const fit =
      (Math.abs(bw - Math.round((t.w * 100) / cm)) <= tol && Math.abs(bh - Math.round((t.h * 100) / cm)) <= tol) ||
      (Math.abs(bw - Math.round((t.h * 100) / cm)) <= tol && Math.abs(bh - Math.round((t.w * 100) / cm)) <= tol);
    if (!fit) continue;
    const w = bw;
    const h = bh;
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    const bites: number[][] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y - y0) * w + (x - x0);
        if (seen[i] || room[y * cols + x] === id) continue;
        const comp: number[] = [];
        let ax0 = x;
        let ay0 = y;
        let ax1 = x;
        let ay1 = y;
        seen[i] = 1;
        stack.push(i);
        while (stack.length) {
          const c = stack.pop()!;
          const cx = x0 + (c % w);
          const cy = y0 + ((c - (c % w)) / w);
          comp.push(cy * cols + cx);
          if (cx < ax0) ax0 = cx;
          if (cy < ay0) ay0 = cy;
          if (cx > ax1) ax1 = cx;
          if (cy > ay1) ay1 = cy;
          for (const [nx, ny] of [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ] as const) {
            if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
            const ni = (ny - y0) * w + (nx - x0);
            if (seen[ni] || room[ny * cols + nx] === id) continue;
            seen[ni] = 1;
            stack.push(ni);
          }
        }
        const side = Math.max(ax1 - ax0 + 1, ay1 - ay0 + 1);
        if (side > Math.max(bw, bh) * 0.75) continue;
        bites.push(comp);
      }
    }
    bites.sort((a, b) => a.length - b.length);
    for (const comp of bites) {
      const m2 = (comp.length * cm * cm) / 10_000;
      if (m2 < 0.05 || Math.abs(areas[id]! + m2 - printed) >= Math.abs(areas[id]! - printed)) continue;
      let other = false;
      for (const k of comp) {
        const rid = room[k]!;
        if (rid && rid !== outside && rid !== id) other = true;
      }
      if (other) continue;
      for (const k of comp) {
        wall[k] = 0;
        closed[k] = 0;
        room[k] = id;
      }
      areas[id] = (areas[id] ?? 0) + m2;
    }
  }
}


/**
 * The printed size is a rectangle the room either contains or almost is.
 * A room more than 5% over that size, and not already a fit for another
 * size, loses the floor outside the fullest such rectangle. A room more
 * than 5% under, whose box is already that rectangle, takes the wall
 * notches inside it. A size names the room it is printed in; only when
 * that room is far off does it go to a neighbour that has no size of its own.
 */
function shapeToPrinted(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
  next: number,
  openLinks: Array<[number, number]>,
): number {
  const labels = printedRooms(sheet.texts);
  const reach = Math.round(250 / cm);
  const nearRooms = (px: number, py: number) => {
    const found = new Map<number, number>();
    for (let dy = -reach; dy <= reach; dy += 3) {
      for (let dx = -reach; dx <= reach; dx += 3) {
        if (dx * dx + dy * dy > reach * reach) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const id = room[y * cols + x]!;
        if (!id || id === outside || (areas[id] ?? 0) < 0.8) continue;
        const d = dx * dx + dy * dy;
        const prev = found.get(id);
        if (prev == null || d < prev) found.set(id, d);
      }
    }
    return found;
  };
  const boxOf = (id: number) => {
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < room.length; k++) {
      if (room[k] !== id) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  };
  const touchesOther = (x: number, y: number, id: number) => {
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const rid = room[ny * cols + nx]!;
      if (rid && rid !== outside && rid !== id) return true;
    }
    return false;
  };
  const shaped = new Set<number>();
  const jobs: Array<{ id: number; w: number; h: number; err: number }> = [];
  const roomAt = (t: { x: number; y: number }) => {
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    return px >= 0 && py >= 0 && px < cols && py < rows ? room[py * cols + px]! : 0;
  };
  for (const t of labels) {
    const printed = t.w * t.h;
    if (printed < 2) continue;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    const on = roomAt(t);
    if (on && on !== outside) {
      const here = areas[on] ?? 0;
      const hereErr = here > 0 ? Math.abs(here / printed - 1) : Infinity;
      if (hereErr < 0.3) {
        if (hereErr > 0.02) jobs.push({ id: on, w: t.w, h: t.h, err: hereErr });
        continue;
      }
      if (hereErr <= 0.6) {
        const box = boxOf(on);
        const bw = ((box.x1 - box.x0 + 1) * cm) / 100;
        const bh = ((box.y1 - box.y0 + 1) * cm) / 100;
        const fits = (span: number) => Math.abs(span - t.w) <= 0.15 || Math.abs(span - t.h) <= 0.15;
        const excess = (span: number) => Math.min(span - t.w, span - t.h);
        const oneSide = (fits(bw) && !fits(bh) && excess(bh) >= 1.2) || (fits(bh) && !fits(bw) && excess(bw) >= 1.2);
        if (oneSide) {
          jobs.push({ id: on, w: t.w, h: t.h, err: hereErr });
          continue;
        }
      }
    }
    let best = 0;
    let bestErr = 0.3;
    for (const [id] of nearRooms(px, py)) {
      if (labels.some((o) => o !== t && o.w * o.h >= 2 && roomAt(o) === id)) continue;
      const err = Math.abs(areas[id]! / printed - 1);
      if (err < bestErr) {
        best = id;
        bestErr = err;
      }
    }
    if (!best || bestErr <= 0.02) continue;
    jobs.push({ id: best, w: t.w, h: t.h, err: bestErr });
  }
  jobs.sort((a, b) => a.err - b.err);
  for (const job of jobs) {
    if (shaped.has(job.id)) continue;
    const area = areas[job.id] ?? 0;
    const printed = job.w * job.h;
    const err = area > 0 ? Math.abs(area / printed - 1) : Infinity;
    if (area < 0.8 || err <= 0.02) continue;
    if (err > 0.3) {
      const box = boxOf(job.id);
      const bw = ((box.x1 - box.x0 + 1) * cm) / 100;
      const bh = ((box.y1 - box.y0 + 1) * cm) / 100;
      const fits = (span: number) => Math.abs(span - job.w) <= 0.15 || Math.abs(span - job.h) <= 0.15;
      const excess = (span: number) => Math.min(span - job.w, span - job.h);
      const oneSide = (fits(bw) && !fits(bh) && excess(bh) >= 1.2) || (fits(bh) && !fits(bw) && excess(bw) >= 1.2);
      if (!oneSide || err > 0.6) continue;
    }
    if (labels.some((t) => Math.abs(area / (t.w * t.h) - 1) <= 0.02)) continue;
    const b = boxOf(job.id);
    const bw = ((b.x1 - b.x0 + 1) * cm) / 100;
    const bh = ((b.y1 - b.y0 + 1) * cm) / 100;
    const boxFits =
      (Math.abs(bw - job.w) <= 0.55 && Math.abs(bh - job.h) <= 0.55) ||
      (Math.abs(bw - job.h) <= 0.55 && Math.abs(bh - job.w) <= 0.55);
    const orientations: Array<[number, number]> =
      job.w === job.h
        ? [[job.w, job.h]]
        : [
            [job.w, job.h],
            [job.h, job.w],
          ];
    const pad = Math.round(20 / cm);
    const x0s = Math.max(0, b.x0 - pad);
    const y0s = Math.max(0, b.y0 - pad);
    const x1s = Math.min(cols - 1, b.x1 + pad);
    const y1s = Math.min(rows - 1, b.y1 + pad);
    const pw = x1s - x0s + 2;
    const ph = y1s - y0s + 2;
    const sum = new Int32Array(pw * ph);
    for (let y = y0s; y <= y1s; y++) {
      let row = 0;
      for (let x = x0s; x <= x1s; x++) {
        if (room[y * cols + x] === job.id) row++;
        const i = (y - y0s + 1) * pw + (x - x0s + 1);
        sum[i] = sum[i - pw]! + row;
      }
    }
    const rectSum = (x: number, y: number, rw: number, rh: number) => {
      const ax = x - x0s;
      const ay = y - y0s;
      const i1 = ay * pw + ax;
      const i2 = ay * pw + ax + rw;
      const i3 = (ay + rh) * pw + ax;
      const i4 = (ay + rh) * pw + ax + rw;
      return sum[i4]! - sum[i2]! - sum[i3]! + sum[i1]!;
    };
    let best: { x: number; y: number; rw: number; rh: number; overlap: number; claim: number } | null = null;
    for (const [rwM, rhM] of orientations) {
      const rw = Math.round((rwM * 100) / cm);
      const rh = Math.round((rhM * 100) / cm);
      if (rw < 4 || rh < 4) continue;
      for (let y = b.y0 - pad; y <= b.y1 + pad - rh; y += 2) {
        for (let x = b.x0 - pad; x <= b.x1 + pad - rw; x += 2) {
          if (x < x0s || y < y0s || x + rw > x1s + 1 || y + rh > y1s + 1) continue;
          const overlap = rectSum(x, y, rw, rh);
          let claim = 0;
          if (area < printed && boxFits) {
            for (let py = y; py < y + rh; py++) {
              for (let px = x; px < x + rw; px++) {
                if (!room[py * cols + px] && !touchesOther(px, py, job.id)) claim++;
              }
            }
          }
          const score =
            area > printed
              ? Math.abs((overlap * cm * cm) / 10_000 - printed)
              : Math.abs(area + (claim * cm * cm) / 10_000 - printed);
          const prev = best
            ? area > printed
              ? Math.abs((best.overlap * cm * cm) / 10_000 - printed)
              : Math.abs(area + (best.claim * cm * cm) / 10_000 - printed)
            : Infinity;
          if (score < prev) best = { x, y, rw, rh, overlap, claim };
        }
      }
    }
    if (!best) continue;
    shaped.add(job.id);
    if (area > printed) {
      const overlapM = (best.overlap * cm * cm) / 10_000;
      // The printed size is the room's outer rectangle: where a neighbour or
      // a shaft cuts into it the room is less, and what lies outside it is
      // another room all the same — a passage the reader ran in.
      let held = 0;
      for (let py = best.y; py < best.y + best.rh; py++) {
        for (let px = best.x; px < best.x + best.rw; px++) {
          const r = room[py * cols + px]!;
          if (r !== job.id && (wall[py * cols + px] === 1 || (r && r !== outside))) held++;
        }
      }
      const rectPx = best.rw * best.rh;
      const outsideM = area - overlapM;
      const whole = best.overlap + held >= rectPx * 0.95 && best.overlap >= rectPx * 0.6 && outsideM >= 2;
      if (!whole && best.overlap < ((printed * 10_000) / (cm * cm)) * 0.88) continue;
      if (!whole && Math.abs(overlapM - printed) >= Math.abs(area - printed)) continue;
      const cut: number[] = [];
      for (let k = 0; k < room.length; k++) {
        if (room[k] !== job.id) continue;
        const x = k % cols;
        const y = (k - x) / cols;
        if (x < best.x || y < best.y || x >= best.x + best.rw || y >= best.y + best.rh) cut.push(k);
      }
      if ((cut.length * cm * cm) / 10_000 < 0.2) continue;
      next++;
      for (const k of cut) room[k] = next;
      areas[job.id] = overlapM;
      areas[next] = (cut.length * cm * cm) / 10_000;
      openLinks.push([job.id, next]);
    } else if (!boxFits) continue;
    const claimPx: number[] = [];
    for (let py = best.y; py < best.y + best.rh; py++) {
      for (let px = best.x; px < best.x + best.rw; px++) {
        if (room[py * cols + px] || touchesOther(px, py, job.id)) continue;
        claimPx.push(py * cols + px);
      }
    }
    if ((claimPx.length * cm * cm) / 10_000 < 0.05) continue;
    const seen = new Uint8Array(room.length);
    const stack: number[] = [];
    const comps: number[][] = [];
    for (const k of claimPx) {
      if (seen[k]) continue;
      const comp: number[] = [];
      seen[k] = 1;
      stack.push(k);
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        const x = c % cols;
        const y = (c - x) / cols;
        for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
          if (nk < 0 || seen[nk] || room[nk] || touchesOther(nk % cols, (nk - (nk % cols)) / cols, job.id)) continue;
          if (claimPx.length > 0 && (nk % cols < best.x || nk % cols >= best.x + best.rw || (nk - (nk % cols)) / cols < best.y || (nk - (nk % cols)) / cols >= best.y + best.rh)) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      comps.push(comp);
    }
    comps.sort((a, c) => a.length - c.length);
    for (const comp of comps) {
      const m2 = (comp.length * cm * cm) / 10_000;
      if (m2 < 0.04 || Math.abs(areas[job.id]! + m2 - printed) >= Math.abs(areas[job.id]! - printed)) continue;
      // A notch stands into the room; a band of wall the rectangle's whole
      // side long is the room's wall — Gottlieb A's ממ"ד took its own, and
      // stood open to the bathroom's hall (13/10/2026).
      let [cx0, cy0, cx1, cy1] = [cols, rows, 0, 0];
      for (const k of comp) {
        const x = k % cols;
        const y = (k - x) / cols;
        [cx0, cy0, cx1, cy1] = [Math.min(cx0, x), Math.min(cy0, y), Math.max(cx1, x), Math.max(cy1, y)];
      }
      // So is a frame of them round a room printed at its gross size: its
      // bathrooms' 3.10*2.10 reached over their walls and took them all.
      const [bw, bh] = [cx1 - cx0 + 1, cy1 - cy0 + 1];
      const spans = bw >= 0.8 * best.rw || bh >= 0.8 * best.rh;
      if (spans && (Math.min(bw, bh) * cm <= 35 || comp.length < 0.5 * bw * bh)) continue;
      for (const k of comp) {
        wall[k] = 0;
        closed[k] = 0;
        room[k] = job.id;
      }
      areas[job.id] = (areas[job.id] ?? 0) + m2;
    }
  }
  return next;
}

function fillToPrinted(
  room: Int32Array,
  areas: number[],
  closed: Uint8Array,
  wall: Uint8Array,
  sheet: DwfGeometry,
  pxPerUnit: number,
  cols: number,
  rows: number,
  cm: number,
  outside: number,
): void {
  const reach = Math.round(200 / cm);
  const target = new Map<number, number>();
  const nearest = (px: number, py: number) => {
    let id = 0;
    let best = reach * reach + 1;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= best) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const here = room[y * cols + x]!;
        if (!here || here === outside || areas[here]! < 0.8) continue;
        id = here;
        best = d;
      }
    }
    return id;
  };
  for (const t of printedRooms(sheet.texts)) {
    const printed = t.w * t.h;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    const id = nearest(px, py);
    const area = areas[id] ?? 0;
    if (!area || Math.abs(area / printed - 1) > 0.15) continue;
    const prev = target.get(id);
    if (prev == null || Math.abs(area - printed) < Math.abs(area - prev)) target.set(id, printed);
  }
  if (target.size === 0) return;
  const seen = new Uint8Array(wall.length);
  const stack: number[] = [];
  const holes = new Map<number, number[][]>();
  for (let start = 0; start < wall.length; start++) {
    if (wall[start] !== 1 || seen[start]) continue;
    const comp: number[] = [];
    seen[start] = 1;
    stack.push(start);
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    const touch = new Set<number>();
    let out = false;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const x = c % cols;
      const y = (c - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (const nk of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (nk < 0) continue;
        if (wall[nk] === 1 && !seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        } else if (!wall[nk]) {
          const id = room[nk]!;
          if (id === outside) out = true;
          else if (id) touch.add(id);
        }
      }
    }
    const m2 = (comp.length * cm * cm) / 10_000;
    const side = Math.max(x1 - x0 + 1, y1 - y0 + 1) * cm;
    if (out || touch.size !== 1 || m2 < 0.15 || m2 > 0.55 || side > 80) continue;
    const id = [...touch][0]!;
    if (!target.has(id)) continue;
    holes.set(id, [...(holes.get(id) ?? []), comp]);
  }
  for (const [id, comps] of holes) {
    const printed = target.get(id)!;
    comps.sort((a, b) => a.length - b.length);
    for (const comp of comps) {
      const m2 = (comp.length * cm * cm) / 10_000;
      if (Math.abs(areas[id]! + m2 - printed) >= Math.abs(areas[id]! - printed)) continue;
      for (const c of comp) {
        wall[c] = 0;
        closed[c] = 0;
        room[c] = id;
      }
      areas[id] = (areas[id] ?? 0) + m2;
    }
  }
}

/** Gaps along a wall line closed in `into`; see step 3 of readDwfFloor. */
function closeGaps(
  own: Uint8Array,
  crossRun: Uint16Array,
  wall: Uint8Array,
  into: Uint8Array,
  cols: number,
  rows: number,
  horizontal: boolean,
  limits: {
    tiny: number;
    sameWall: number;
    toCorner: number;
    glazed: number;
    narrowest: number;
    doorway: number;
    longRun: number;
    corner: number;
  },
  glass: Uint8Array,
): void {
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
  for (let line = 0; line < lines; line++) {
    let last = -1;
    for (let i = 0; i < len; i++) {
      if (!wall[idx(line, i)]) continue;
      if (last >= 0 && i - last > 1) {
        const a = own[idx(line, last)]!;
        const b = own[idx(line, i)]!;
        const gap = i - last;
        // A gap no door could pass is closed whatever stands either side: a
        // figure's strokes in a window's reveal read as hatch, and the
        // window's closure stopped at them a hand short of the corner.
        // A door beside a corner opens from a wall's end. A wall that turns a
        // corner there runs on as the other wall, and the floor past the
        // corner is one room with the floor beside it.
        const turns = (k: number) => {
          const x = k % cols;
          const y = (k - x) / cols;
          for (let dy = -limits.corner; dy <= limits.corner; dy++) {
            for (let dx = -limits.corner; dx <= limits.corner; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
              if (wall[yy * cols + xx] && crossRun[yy * cols + xx]! >= limits.longRun) return true;
            }
          }
          return false;
        };
        const fromEnd = () => (a && !turns(idx(line, last))) || (b && !turns(idx(line, i)));
        let shut =
          gap <= limits.tiny || (a && b && gap <= limits.sameWall) || ((a || b) && gap <= limits.toCorner && fromEnd());
        // Glass drawn along most of the gap, on this line.
        let glazed = 0;
        for (let k = last + 1; k < i; k++) if (glass[idx(line, k)]) glazed++;
        const window = glazed >= 0.7 * (gap - 1);
        // From a wall's end to a stub the frame is the evidence: a window's
        // sill, frame and panes run the gap's length on three lines and more
        // of the band, where a tile grid runs it on one.
        if (!shut && a && b && gap <= limits.glazed) shut = window;
        if (!shut && (a || b) && gap <= limits.glazed && window) {
          let panes = 0;
          for (let d = -8; d <= 8; d++) {
            const o = line + d;
            if (o < 0 || o >= lines) continue;
            let run = 0;
            for (let k = last + 1; k < i; k++) if (glass[idx(o, k)]) run++;
            if (run >= 0.7 * (gap - 1)) panes++;
          }
          shut = panes >= 3;
        }
        // A doorway's width marked apart from a window's: only a doorway joins
        // two rooms into one flat. One narrower than a door is a shaft or a
        // pipe let into the wall, and one glazed is a window, however narrow.
        // A door's width with glass or a threshold drawn across it, and an
        // opening wider than a door with no glass, are kept apart (5): a
        // window to the street, or a glazed door or an open passage within a
        // flat.
        const doorWide = gap >= limits.narrowest && gap <= limits.doorway;
        const mark = doorWide ? (window ? 5 : 4) : gap > limits.doorway && !window ? 5 : 2;
        if (shut) for (let k = last + 1; k < i; k++) into[idx(line, k)] = mark;
      }
      last = i;
    }
  }
}
