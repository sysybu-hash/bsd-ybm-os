import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { levelMarks, roomLabels } from "@/lib/projects/floor-split";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
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

  // 1. The hatch strokes, drawn two pixels wide.
  const ink = new Uint8Array(n);
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
  }

  // 2. Closed into solid bands (dilate, then erode, by 3 px), and scraps under
  //    0.04 m² — a dimension chain's ticks, a stray mark — dropped.
  const solid = erode(dilate(ink, cols, rows, 3), cols, rows, 3);
  const wall = keepLarge(solid, cols, rows, Math.round(400 / (cm * cm)));

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
  const rooms: DwfRoom[] = [];
  for (let id = 1; id <= next; id++) {
    if (id === outside || areas[id]! < 0.8) continue;
    rooms.push({ id, areaM2: Math.round(areas[id]! * 100) / 100, kind: labelledKind(kinds.get(id) ?? []), names: names.get(id) ?? [] });
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
  const reach = Math.round(25 / cm);
  for (let k = 0; k < n; k++) {
    if (closed[k]! < 2) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    const seen = new Set<number>();
    for (const [dx, dy] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]] as const) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
      const id = room[py * cols + px]!;
      if (kept.has(id)) seen.add(id);
    }
    if (seen.size < 2) continue;
    for (const p of seen) {
      for (const q of seen) {
        if (p === q) continue;
        if (closed[k] === 3) doors.set(p, (doors.get(p) ?? new Set()).add(q));
        touching.add(`${p}:${q}`);
        if (closed[k] === 2) continue;
        const key = `${p}:${q}`;
        contact.set(key, (contact.get(key) ?? 0) + 1);
      }
    }
  }
  const core = new Set(
    rooms.filter((r) => r.names.some((name) => CORE.test(name))).map((r) => r.id),
  );
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
  if (flatLevels.size > 0) {
    const stepped = new Set(
      levels
        .filter((l) => !flatLevels.has(l.value))
        .map((l) => at(l.x, l.y))
        .filter((id) => kept.has(id) && !numbered.has(id) && labelledKind(kinds.get(id) ?? []) == null),
    );
    for (let grown = true; grown; ) {
      grown = false;
      for (const id of stepped) {
        if (core.has(id)) continue;
        if ([...core].some((c) => touching.has(`${id}:${c}`))) {
          core.add(id);
          grown = true;
        }
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
  const vote = (id: number) => {
    const votes = new Map<number, number>();
    for (const [key, count] of contact) {
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
      const best = vote(r.id);
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
  for (let k = 0; k < n; k++) wallOut[k] = wall[k] ? 1 : closed[k]!;
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

function keepLarge(src: Uint8Array, cols: number, rows: number, minPixels: number): Uint8Array {
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
    if (members.length >= minPixels) for (const m of members) out[m] = 1;
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
  limits: { sameWall: number; toCorner: number; glazed: number; narrowest: number; doorway: number },
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
        let shut = (a && b && gap <= limits.sameWall) || ((a || b) && gap <= limits.toCorner);
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
        const mark = !window && gap >= limits.narrowest && gap <= limits.doorway ? 4 : 2;
        if (shut) for (let k = last + 1; k < i; k++) into[idx(line, k)] = mark;
      }
      last = i;
    }
  }
}
