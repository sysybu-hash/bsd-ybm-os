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
  options: { unitsPerMetre: number; cm?: number; units?: Array<{ unit: number; x: number; y: number }> },
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
  const wall = keepLarge(solid, cols, rows, Math.round(400 / (cm * cm)), {
    strokes,
    rising,
    maxPixelsPerStroke: Math.round(120 / (cm * cm)),
  });

  // 3. Openings closed along each wall line: windows and doorways are gaps in
  //    the hatch. Between two pieces of the same wall up to 3.2 m (a terrace
  //    slider), between a wall's end and a crossing wall up to 1.5 m (a door
  //    beside a corner).
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
  };
  closeGaps(along, wall, closed, cols, rows, true, gaps, glass);
  closeGaps(across, wall, closed, cols, rows, false, gaps, glass);
  // Every door with a swing drawn is shut along both its leaf positions: the
  // doorway then closes whatever wall it stands in, a 45° one included.
  for (const arc of sheet.arcs) {
    const rM = arc.r / upm;
    const sweep = arc.end - arc.start;
    if (rM < 0.45 || rM > 1.4 || sweep < 1.2 || sweep > 1.95) continue;
    for (const t of [arc.start, arc.end]) {
      line(
        arc.cx * pxPerUnit,
        arc.cy * pxPerUnit,
        (arc.cx + arc.r * Math.cos(t)) * pxPerUnit,
        (arc.cy + arc.r * Math.sin(t)) * pxPerUnit,
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

  // 5. Names and apartment numbers, from what the sheet writes.
  const at = (x: number, y: number) => {
    const px = Math.round(x * pxPerUnit);
    const py = Math.round(y * pxPerUnit);
    return px >= 0 && py >= 0 && px < cols && py < rows ? room[py * cols + px]! : 0;
  };
  const labels = roomLabels(sheet.texts);
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
  const units = (options.units ?? []).map((u) => ({ unit: u.unit, id: at(u.x, u.y) })).filter((u) => kept.has(u.id));
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
  const apartments: DwfApartment[] = units.map(({ unit }) => ({
    unit,
    rooms: rooms.filter((r) => owner.get(r.id) === unit).map((r) => r.id),
  }));

  const wallOut = new Uint8Array(n);
  for (let k = 0; k < n; k++) wallOut[k] = wall[k] ? 1 : closed[k] === 5 ? 2 : closed[k]!;
  return { cols, rows, cm, unitsPerMetre: upm, wall: wallOut, room, outside, rooms, apartments };
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

/** Gaps along a wall line closed in `into`; see step 3 of readDwfFloor. */
function closeGaps(
  own: Uint8Array,
  wall: Uint8Array,
  into: Uint8Array,
  cols: number,
  rows: number,
  horizontal: boolean,
  limits: { tiny: number; sameWall: number; toCorner: number; glazed: number; narrowest: number; doorway: number },
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
        let shut = gap <= limits.tiny || (a && b && gap <= limits.sameWall) || ((a || b) && gap <= limits.toCorner);
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
