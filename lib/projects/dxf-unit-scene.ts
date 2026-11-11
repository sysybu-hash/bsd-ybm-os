import type { Pt } from "@/lib/projects/dxf-drawing";
import type { UnitPlan } from "@/lib/projects/dxf-unit-by-doors";
import { DXF_PAGE_UNITS_PER_METRE } from "@/lib/projects/floorplan-dxf";
import { inferRoomKind } from "@/lib/projects/floorplan-layout";
import type { SpanRow } from "@/lib/projects/floorplan-solid";
import type { SceneInput } from "@/lib/projects/scene3d/build-scene";
import { mergeSpanRows } from "@/lib/projects/scene3d/floors";

/**
 * A flat cut from a CAD floor, as the scene builder's input — straight from
 * the drawing, with no second reading of its lines.
 *
 * The cut (dxf-unit-by-doors.ts) already knows every cell: the flat's floor,
 * its balconies, the walls, windows and railings, the spaces each door joins.
 * The sales-sheet route reads walls back out of stroke pairs, and on a CAD
 * sheet whose walls are hairline faces it found ten bodies in a flat of
 * nine rooms. Here a wall is the drawn wall, a door is the opening its own
 * swing closes, a window is the glass drawn in the wall, and a room is the
 * space between doors, named by the label standing in it.
 *
 * Page units are points at 1:50 (DXF_PAGE_UNITS_PER_METRE), y down, origin at
 * the cut's raster corner.
 */

type Band = SceneInput["bodies"][number];
type SceneOpening = SceneInput["openings"][number];
type Rect = { x: number; y: number; w: number; h: number };

const WALL = 1;
const GLASS = 2;
/** How far past the floor a cell can still be the wall that bounds it. */
const WALL_REACH_M = 0.5;
/** Half the depth of the deepest built-in: an island 90 deep. */
const BUILT_IN_HALF_DEPTH_M = 0.5;
/** Less floor than this closed off is a stool's arc or a stroke's corner. */
const BUILT_IN_MIN_M2 = 0.25;
/** Joinery this near a sink or hob in the same room is the kitchen's worktop; further off it is a wardrobe. */
const KITCHEN_REACH_M = 2;
const DEFAULT_WALL_M = 0.2;
const ROOM_WORD = /שינה|הורים|מטבח|סלון|מגורים|מרפס|ממ["״']?ד|רחצ|שירות|מקלחת|אמבט|פינת|אוכל|מבוא|כביסה|מחסן|ארונות|חדר/u;

export function unitSceneInput(plan: UnitPlan): SceneInput {
  const { cols, rows, cell, grid, space } = plan;
  const N = cols * rows;
  const mask = plan.mask.slice();
  // An entrance door's swing is drawn over the floor it opens across, and those
  // cells lie on its lines in no space: דירה 14's hall had a hole inside its
  // front door. Floor them from the flat's side, inside the door's box.
  for (const door of plan.doors) {
    if (!door.entrance) continue;
    const X0 = Math.max(0, Math.floor((door.box.x0 - plan.x0) / cell));
    const X1 = Math.min(cols - 1, Math.floor((door.box.x1 - plan.x0) / cell));
    const Y0 = Math.max(0, Math.floor((plan.y1 - door.box.y1) / cell));
    const Y1 = Math.min(rows - 1, Math.floor((plan.y1 - door.box.y0) / cell));
    const stack: number[] = [];
    for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) if (mask[Y * cols + X] === 1) stack.push(Y * cols + X);
    while (stack.length) {
      const s = stack.pop()!;
      const X = s % cols;
      const Y = (s - X) / cols;
      for (const [x, y] of [[X - 1, Y], [X + 1, Y], [X, Y - 1], [X, Y + 1]] as const) {
        if (x < X0 || x > X1 || y < Y0 || y > Y1) continue;
        const t = y * cols + x;
        if (mask[t] || grid[t] !== 0 || space[t] !== -1) continue;
        mask[t] = 1;
        stack.push(t);
      }
    }
  }
  const k = plan.unitsM * DXF_PAGE_UNITS_PER_METRE;
  const upm = DXF_PAGE_UNITS_PER_METRE;
  const cp = cell * k;
  const px = (x: number) => (x - plan.x0) * k;
  const py = (y: number) => (plan.y1 - y) * k;
  const cellOf = (q: Pt) => {
    const X = Math.floor((q.x - plan.x0) / cell);
    const Y = Math.floor((plan.y1 - q.y) / cell);
    return X >= 0 && Y >= 0 && X < cols && Y < rows ? Y * cols + X : -1;
  };
  const metres = (m: number) => m / plan.unitsM;

  // Cells within a wall's reach of the floor, short of the outside. Measured
  // square (eight neighbours): counted in four steps the reach is a diamond,
  // and every outer corner of a thick wall came out cut off at 45°.
  const reach = Math.round(metres(WALL_REACH_M) / cell);
  const dist = new Int16Array(N).fill(-1);
  const queue: number[] = [];
  for (let s = 0; s < N; s++) {
    if (mask[s]) {
      dist[s] = 0;
      queue.push(s);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const s = queue[h]!;
    if (dist[s]! >= reach) continue;
    const x = s % cols;
    const l = x > 0;
    const r = x < cols - 1;
    for (const t of [l ? s - 1 : -1, r ? s + 1 : -1, s - cols, s + cols, l ? s - cols - 1 : -1, r ? s - cols + 1 : -1, l ? s + cols - 1 : -1, r ? s + cols + 1 : -1]) {
      if (t < 0 || t >= N || dist[t] !== -1) continue;
      dist[t] = dist[s]! + 1;
      queue.push(t);
    }
  }
  // Whether a cell has floor of kind `want` within a few cells, and none of kind `not`.
  const besideOnly = (s0: number, want: number, not: number) => {
    const r = 3;
    const X = s0 % cols;
    const Y = (s0 - X) / cols;
    let seen = false;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const X2 = X + dx;
        const Y2 = Y + dy;
        if (X2 < 0 || Y2 < 0 || X2 >= cols || Y2 >= rows) continue;
        const m = mask[Y2 * cols + X2];
        if (m === not) return false;
        if (m === want) seen = true;
      }
    }
    return seen;
  };
  const spaceCells = new Map<number, number>();
  for (let s = 0; s < N; s++) if (space[s]! > 0) spaceCells.set(space[s]!, (spaceCells.get(space[s]!) ?? 0) + 1);
  const sliver = metres(1.5) * metres(1) / (cell * cell);
  const balustrade = new Uint8Array(N);
  // A hairline wall on a balcony's outer edge is its parapet line too: thin, with the balcony on one side and nothing of the flat near.
  const run = (s0: number, step: number, sameRow: boolean) => {
    let n = 1;
    for (const dir of [-1, 1]) {
      let t = s0 + dir * step;
      while (t >= 0 && t < N && grid[t] === WALL && (!sameRow || Math.floor(t / cols) === Math.floor(s0 / cols)) && n < 10) {
        n++;
        t += dir * step;
      }
    }
    return n;
  };
  const thinCells = Math.round(metres(0.09) / cell);
  for (let s = 0; s < N; s++) {
    if (mask[s] || !besideOnly(s, 2, 1)) continue;
    const sliverGap = grid[s] === 0 && space[s]! > 0 && !plan.flatSpaces.includes(space[s]!) && (spaceCells.get(space[s]!) ?? 0) < sliver;
    if (grid[s] === GLASS || sliverGap || (grid[s] === WALL && Math.min(run(s, 1, true), run(s, cols, false)) <= thinCells)) balustrade[s] = 1;
  }
  const solid = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (mask[s] || dist[s] === -1) continue;
    // Drawn wall and glass; and between a wall's faces, the hairline gap that belongs to no room.
    // Glass on a balcony's outer edge is its balustrade — the scene rails
    // every terrace edge with no wall — not a wall: built as one, it stood
    // floor to ceiling across the view out.
    if (balustrade[s]) continue;
    // The gap between a wall's two faces is a sliver of a space; a neighbour's room is not, and filled in it thickened the party wall half a metre into flat 15.
    if (grid[s] === WALL || grid[s] === GLASS || (grid[s] === 0 && space[s]! > 0 && !plan.flatSpaces.includes(space[s]!) && (spaceCells.get(space[s]!) ?? 0) < sliver)) solid[s] = 1;
  }
  straightenOuterFaces(solid, mask, dist, cols, rows, Math.round(metres(0.6) / cell));

  // A wall's centre and thickness across a point, from the drawn wall cells there.
  const wallAcross = (at: Pt, orientation: "h" | "v"): { lo: number; hi: number } | null => {
    const c = cellOf(at);
    if (c < 0) return null;
    const X = c % cols;
    const Y = (c - X) / cols;
    const limit = Math.round(metres(0.35) / cell);
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = -limit; d <= limit; d++) {
      const s = orientation === "h" ? (Y + d) * cols + X : Y * cols + X + d;
      if (s < 0 || s >= N) continue;
      if (grid[s] === WALL || solid[s]) {
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
    }
    if (!Number.isFinite(lo)) return null;
    // Back to page units across the wall: y for a horizontal wall, x for a vertical one.
    const base = orientation === "h" ? Y * cp : X * cp;
    return { lo: base + lo * cp, hi: base + (hi + 1) * cp };
  };

  const openings: SceneOpening[] = [];
  // Whether balcony (2) or flat (1) floor lies within a few cells of a drawing-unit box.
  const nearMask = (b: { x0: number; y0: number; x1: number; y1: number }, want: number) => {
    const pad = Math.round(metres(0.3) / cell);
    const X0 = Math.max(0, Math.floor((b.x0 - plan.x0) / cell) - pad);
    const X1 = Math.min(cols - 1, Math.floor((b.x1 - plan.x0) / cell) + pad);
    const Y0 = Math.max(0, Math.floor((plan.y1 - b.y1) / cell) - pad);
    const Y1 = Math.min(rows - 1, Math.floor((plan.y1 - b.y0) / cell) + pad);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (mask[y * cols + x] === want) return true;
    return false;
  };
  const bandAt = (orientation: "h" | "v", from: Pt, to: Pt, fallbackCentre: number): Omit<SceneOpening, "kind"> => {
    const along = orientation === "h" ? [px(from.x), px(to.x)] : [py(from.y), py(to.y)];
    const lo = Math.min(along[0]!, along[1]!);
    const hi = Math.max(along[0]!, along[1]!);
    const step = metres(0.12);
    const ends = orientation === "h"
      ? [{ x: Math.min(from.x, to.x) - step, y: from.y }, { x: Math.max(from.x, to.x) + step, y: from.y }]
      : [{ x: from.x, y: Math.min(from.y, to.y) - step }, { x: from.x, y: Math.max(from.y, to.y) + step }];
    const measured = ends.map((q) => wallAcross(q, orientation)).filter((w): w is { lo: number; hi: number } => w != null);
    // The thinner end: past one end of an opening there may stand a partition
    // meeting the wall, and measured across it the wall read 67 cm — a window
    // in דירה 14's bedroom built a wall slab half a metre into the room.
    const thick = measured.filter((m) => m.hi - m.lo >= 0.08 * upm).sort((a, b) => a.hi - a.lo - (b.hi - b.lo))[0] ?? measured[0];
    const centre = thick ? (thick.lo + thick.hi) / 2 : fallbackCentre;
    const thickness = thick ? Math.max(thick.hi - thick.lo, 0.08 * upm) : DEFAULT_WALL_M * upm;
    return { orientation, centre, thickness, from: lo, to: hi };
  };

  // Doors: a swing's closed end and its hinge are the opening; a slider's box is.
  for (const door of plan.doors) {
    if (door.swings.length) {
      const spans = door.swings.map((swing) => {
        const tipOf = (q: Pt) => Math.min(...door.strokes.flatMap(([a, b]) => [Math.hypot(a.x - q.x, a.y - q.y), Math.hypot(b.x - q.x, b.y - q.y)]));
        // The closed leaf lies in the wall's line: just past its tip stands the jamb.
        // The open one ends in the room. A frame drawn at the closed tip fooled the stroke test.
        const jambPast = (q: Pt) => {
          const len = Math.hypot(q.x - swing.hinge.x, q.y - swing.hinge.y) || 1;
          const ux = (q.x - swing.hinge.x) / len;
          const uy = (q.y - swing.hinge.y) / len;
          let hits = 0;
          for (const d of [0.06, 0.1, 0.14]) {
            const c = cellOf({ x: q.x + (ux * d) / plan.unitsM, y: q.y + (uy * d) / plan.unitsM });
            if (c >= 0 && (grid[c] === WALL || solid[c])) hits++;
          }
          return hits;
        };
        const ja = jambPast(swing.a);
        const jb = jambPast(swing.b);
        const openA = ja !== jb ? ja < jb : tipOf(swing.a) <= tipOf(swing.b);
        return { hinge: swing.hinge, closed: openA ? swing.b : swing.a, open: openA ? swing.a : swing.b };
      });
      const first = spans[0]!;
      const orientation: "h" | "v" = Math.abs(first.closed.x - first.hinge.x) >= Math.abs(first.closed.y - first.hinge.y) ? "h" : "v";
      const pts = spans.flatMap((sp) => [sp.hinge, sp.closed]);
      const from = orientation === "h" ? pts.reduce((a, b) => (b.x < a.x ? b : a)) : pts.reduce((a, b) => (b.y < a.y ? b : a));
      const to = orientation === "h" ? pts.reduce((a, b) => (b.x > a.x ? b : a)) : pts.reduce((a, b) => (b.y > a.y ? b : a));
      const band = bandAt(orientation, from, { x: orientation === "h" ? to.x : from.x, y: orientation === "h" ? from.y : to.y }, orientation === "h" ? py(first.hinge.y) : px(first.hinge.x));
      openings.push({
        ...band,
        kind: "door",
        leaf: { x: px(first.hinge.x), y: py(first.hinge.y), dx: (first.open.x - first.hinge.x) * k, dy: -(first.open.y - first.hinge.y) * k },
      });
    } else {
      const { x0, y0, x1, y1 } = door.box;
      const orientation: "h" | "v" = x1 - x0 >= y1 - y0 ? "h" : "v";
      const mid = orientation === "h" ? (y0 + y1) / 2 : (x0 + x1) / 2;
      const band = orientation === "h" ? bandAt("h", { x: x0, y: mid }, { x: x1, y: mid }, py(mid)) : bandAt("v", { x: mid, y: y0 }, { x: mid, y: y1 }, px(mid));
      // No swing: a sliding or folding door. Onto a balcony it is the glazed
      // slider the sheet draws; built as a door it stood an empty hole.
      const onBalcony = door.spaces.some((id) => {
        for (let s = 0; s < N; s++) if (space[s] === id) return mask[s] === 2;
        return false;
      }) || nearMask(door.box, 2);
      // A slider's depth is its drawn track, not the wall's: measured past its end into a
      // partition, דירה 14's kitchen slider came out 75 cm deep and its bars read as pillars.
      const minor = (orientation === "h" ? y1 - y0 : x1 - x0) * plan.unitsM;
      const fitted =
        minor >= 0.05 && minor <= 0.45 && minor * upm < band.thickness
          ? { ...band, centre: orientation === "h" ? py(mid) : px(mid), thickness: Math.max(minor, 0.12) * upm }
          : band;
      openings.push({ ...fitted, kind: onBalcony ? "slider" : "door" });
    }
  }

  // Windows: each run of glass by the floor, set in the wall it fills.
  const seen = new Uint8Array(N);
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || grid[s0] !== GLASS || balustrade[s0] || dist[s0] === -1 || mask[s0]) continue;
    const comp: number[] = [];
    const stack = [s0];
    seen[s0] = 1;
    while (stack.length) {
      const s = stack.pop()!;
      comp.push(s);
      const x = s % cols;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= cols) continue;
          const t = s + dy * cols + dx;
          if (t < 0 || t >= N || seen[t] || grid[t] !== GLASS || balustrade[t] || dist[t] === -1 || mask[t]) continue;
          seen[t] = 1;
          stack.push(t);
        }
      }
    }
    let X0 = Infinity;
    let Y0 = Infinity;
    let X1 = -Infinity;
    let Y1 = -Infinity;
    for (const s of comp) {
      const x = s % cols;
      const y = (s - x) / cols;
      X0 = Math.min(X0, x);
      X1 = Math.max(X1, x);
      Y0 = Math.min(Y0, y);
      Y1 = Math.max(Y1, y);
    }
    const w = (X1 - X0 + 1) * cell;
    const h = (Y1 - Y0 + 1) * cell;
    if (Math.max(w, h) < metres(0.4)) continue;
    const orientation: "h" | "v" = w >= h ? "h" : "v";
    const wx0 = plan.x0 + X0 * cell;
    const wx1 = plan.x0 + (X1 + 1) * cell;
    const wy1 = plan.y1 - Y0 * cell;
    const wy0 = plan.y1 - (Y1 + 1) * cell;
    const midY = (wy0 + wy1) / 2;
    const midX = (wx0 + wx1) / 2;
    const band = orientation === "h" ? bandAt("h", { x: wx0, y: midY }, { x: wx1, y: midY }, py(midY)) : bandAt("v", { x: midX, y: wy0 }, { x: midX, y: wy1 }, px(midX));
    // A window is drawn as two or three parallel lines: one window, not one per line.
    // Nor a window over a door the sheet already opened there.
    const same = openings.some(
      (o) =>
        o.orientation === band.orientation &&
        Math.abs(o.centre - band.centre) < 0.45 * upm &&
        Math.min(o.to, band.to) - Math.max(o.from, band.from) > 0.5 * Math.min(o.to - o.from, band.to - band.from),
    );
    if (same) continue;
    openings.push({ ...band, kind: "window" });
  }

  // The walls run through their openings: the scene cuts each hole from its body.
  for (const o of openings) {
    const r = o.orientation === "h"
      ? { x: o.from, y: o.centre - o.thickness / 2, w: o.to - o.from, h: o.thickness }
      : { x: o.centre - o.thickness / 2, y: o.from, w: o.thickness, h: o.to - o.from };
    for (let y = Math.max(0, Math.floor(r.y / cp)); y < Math.min(rows, Math.ceil((r.y + r.h) / cp)); y++) {
      for (let x = Math.max(0, Math.floor(r.x / cp)); x < Math.min(cols, Math.ceil((r.x + r.w) / cp)); x++) solid[y * cols + x] = 1;
    }
  }
  const bodies: Band[] = rectanglesOf(solid, cols, rows)
    .filter((r) => r.w * r.h >= 2)
    .map((r) => {
      const page = { x: r.x * cp, y: r.y * cp, w: r.w * cp, h: r.h * cp };
      return page.w >= page.h
        ? { orientation: "h" as const, centre: page.y + page.h / 2, thickness: page.h, from: page.x, to: page.x + page.w }
        : { orientation: "v" as const, centre: page.x + page.w / 2, thickness: page.w, from: page.y, to: page.y + page.h };
    });

  const rowsOf = (keep: (s: number) => boolean): SpanRow[] => {
    const out: SpanRow[] = [];
    for (let y = 0; y < rows; y++) {
      const spans: Array<[number, number]> = [];
      let start = -1;
      for (let x = 0; x <= cols; x++) {
        const on = x < cols && keep(y * cols + x);
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          spans.push([start * cp, x * cp]);
          start = -1;
        }
      }
      if (spans.length) out.push({ y: y * cp, spans });
    }
    return out;
  };
  // A door's opening has a threshold: with no floor under it the dollhouse
  // looked through דירה 14's front door to the grey below.
  for (const o of openings) {
    if (o.kind !== "door") continue;
    const r = o.orientation === "h"
      ? { x: o.from, y: o.centre - o.thickness / 2, w: o.to - o.from, h: o.thickness }
      : { x: o.centre - o.thickness / 2, y: o.from, w: o.thickness, h: o.to - o.from };
    for (let y = Math.max(0, Math.floor(r.y / cp)); y < Math.min(rows, Math.ceil((r.y + r.h) / cp)); y++) {
      for (let x = Math.max(0, Math.floor(r.x / cp)); x < Math.min(cols, Math.ceil((r.x + r.w) / cp)); x++) if (!mask[y * cols + x]) mask[y * cols + x] = 1;
    }
  }
  // Floor in no room — under a door's swing, on a stroke, a threshold — is the
  // room's beside it. Left to no one it was laid nowhere, and a bedroom had a
  // hole by its door.
  // Each such patch goes whole to the room it shares the longest edge with:
  // grown cell by cell from every room at once, two rooms met on a diagonal.
  const roomOf = space.slice();
  {
    const floorCount = new Map<number, number>();
    for (let s = 0; s < N; s++) if (mask[s] === 1) floorCount.set(space[s]!, (floorCount.get(space[s]!) ?? 0) + 1);
    const minCells = metres(1) * metres(1) / (cell * cell);
    const isRoom = (s: number) => mask[s] === 1 && plan.flatSpaces.includes(space[s]!) && (floorCount.get(space[s]!) ?? 0) >= minCells;
    const done = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (done[s0] || mask[s0] !== 1 || isRoom(s0)) continue;
      const patch = [s0];
      done[s0] = 1;
      const touch = new Map<number, number>();
      for (let h = 0; h < patch.length; h++) {
        const s = patch[h]!;
        const x = s % cols;
        for (const t of [x > 0 ? s - 1 : -1, x < cols - 1 ? s + 1 : -1, s - cols, s + cols]) {
          if (t < 0 || t >= N || mask[t] !== 1) continue;
          if (isRoom(t)) touch.set(space[t]!, (touch.get(space[t]!) ?? 0) + 1);
          else if (!done[t]) {
            done[t] = 1;
            patch.push(t);
          }
        }
      }
      const best = [...touch].sort((a, b) => b[1] - a[1])[0];
      if (best) for (const s of patch) roomOf[s] = best[0];
    }
  }
  const floorRects = mergeSpanRows(rowsOf((s) => mask[s] === 1), cp);

  // A balcony's floor has holes where the sheet drew a level mark or a
  // drain on it: closed, or the scene rails round each one.
  const deck = new Uint8Array(N);
  for (let s = 0; s < N; s++) deck[s] = mask[s] === 2 ? 1 : 0;
  {
    const seenHole = new Uint8Array(N);
    // A drain's circle and its fall line cut דירה 14's north balcony a 1.3 × 0.4 m hole, railed round in the middle of the floor.
    // Only drawn symbols: a hole holding wall or glass (a column, a planter's wall) stays one.
    const most = (2.5 * metres(1) * metres(1)) / (cell * cell);
    for (let s0 = 0; s0 < N; s0++) {
      if (deck[s0] || seenHole[s0]) continue;
      const comp: number[] = [];
      const stack = [s0];
      seenHole[s0] = 1;
      let enclosed = true;
      while (stack.length) {
        const s1 = stack.pop()!;
        comp.push(s1);
        const x = s1 % cols;
        for (const t of [x > 0 ? s1 - 1 : -1, x < cols - 1 ? s1 + 1 : -1, s1 - cols, s1 + cols]) {
          if (t < 0 || t >= N) {
            enclosed = false;
            continue;
          }
          // Floor the reader gave the flat counts too: the drain's ring closed a space of its own, and it joined the flat's.
          if (grid[t] === WALL || grid[t] === GLASS) enclosed = false;
          if (deck[t] || seenHole[t]) continue;
          seenHole[t] = 1;
          stack.push(t);
        }
        if (comp.length > most) enclosed = false;
      }
      if (enclosed && comp.length <= most) for (const s1 of comp) deck[s1] = 1;
    }
  }

  // Balconies: each connected run of balcony floor.
  const terraceIds = new Int32Array(N).fill(-1);
  let terraces = 0;
  for (let s0 = 0; s0 < N; s0++) {
    if (!deck[s0] || terraceIds[s0] !== -1) continue;
    const stack = [s0];
    terraceIds[s0] = terraces;
    while (stack.length) {
      const s = stack.pop()!;
      const x = s % cols;
      for (const t of [x > 0 ? s - 1 : -1, x < cols - 1 ? s + 1 : -1, s - cols, s + cols]) {
        if (t >= 0 && t < N && deck[t] && terraceIds[t] === -1) {
          terraceIds[t] = terraces;
          stack.push(t);
        }
      }
    }
    terraces++;
  }
  const terraceRectsAll = Array.from({ length: terraces }, (_, i) => mergeSpanRows(rowsOf((s) => terraceIds[s] === i), cp));
  // A band only a wall thick, lying against a terrace you can stand on, is the
  // parapet's outer face read as floor. דירה 20 counted that face as a balcony
  // of its own — 1.8 m², three strips, no one size — and it drew a second
  // outline around the roof terrace.
  const sideM = (r: Rect) => Math.min(r.w, r.h) / upm;
  const skinGap = 0.5 * upm;
  const touches = (a: Rect, b: Rect) =>
    a.x < b.x + b.w + skinGap && a.x + a.w + skinGap > b.x && a.y < b.y + b.h + skinGap && a.y + a.h + skinGap > b.y;
  const places = terraceRectsAll.filter((rs) => rs.some((r) => sideM(r) >= 0.4));
  const terraceRects = terraceRectsAll.filter((rs) => {
    if (rs.some((r) => sideM(r) >= 0.4)) return true;
    return !rs.some((a) => places.some((other) => other.some((b) => touches(a, b))));
  });

  // A label set over a wall line or a mask stands for the floor nearest it.
  const floorCellNear = (q: Pt): number => {
    const c = cellOf(q);
    if (c < 0) return -1;
    if (mask[c]) return c;
    const r = Math.round(metres(0.6) / cell);
    const X = c % cols;
    const Y = (c - X) / cols;
    let best = -1;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const X2 = X + dx;
        const Y2 = Y + dy;
        if (X2 < 0 || Y2 < 0 || X2 >= cols || Y2 >= rows || !mask[Y2 * cols + X2]) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          best = Y2 * cols + X2;
          bestD = d;
        }
      }
    }
    return best;
  };
  const furniture = piecesOf(plan, px, py, upm);

  // Built-in joinery drawn as loose lines: what those lines close off from a
  // room's floor, together with its walls, is a worktop, an island, a
  // wardrobe. A line across open floor closes nothing and stays a line.
  const bar = new Uint8Array(N);
  const stroke = (a: Pt, b: Pt) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell / 2)) + 1;
    for (let i = 0; i <= steps; i++) {
      const c = cellOf({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
      if (c < 0) continue;
      // One cell either way: a stroke stopping short of a wall face by a hair still meets it.
      const X = c % cols;
      for (const t of [c, X > 0 ? c - 1 : -1, X < cols - 1 ? c + 1 : -1, c - cols, c + cols]) if (t >= 0 && t < N) bar[t] = 1;
    }
  };
  for (const [a, b] of plan.outlines) stroke(a, b);
  // A hob or a sink set in a worktop closes the worktop's outline where it stands: 18's run is drawn as a line
  // from the far wall to the hob's side, the hob's own square its end, and without it the worktop leaked into the room.
  for (const f of furniture) {
    if (f.kind !== "hob" && f.kind !== "sink") continue;
    const at = (x: number, y: number): Pt => ({ x: x / k + plan.x0, y: plan.y1 - y / k });
    const [p, q, r, s] = [at(f.x, f.y), at(f.x + f.w, f.y), at(f.x + f.w, f.y + f.h), at(f.x, f.y + f.h)];
    stroke(p, q);
    stroke(q, r);
    stroke(r, s);
    stroke(s, p);
  }
  const builtIn = new Int32Array(N).fill(-1);
  const deepest = Math.round(metres(BUILT_IN_HALF_DEPTH_M) / cell);
  let builtIns = 0;
  const skippedBuiltIns: number[] = [];
  for (const id of plan.flatSpaces) {
    // The room's open floor: its largest part with the joinery's lines up.
    const part = new Int32Array(N).fill(-1);
    const sizes: number[] = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (mask[s0] !== 1 || space[s0] !== id || bar[s0] || part[s0] !== -1) continue;
      const stack = [s0];
      part[s0] = sizes.length;
      let n = 0;
      while (stack.length) {
        const s1 = stack.pop()!;
        n++;
        const x = s1 % cols;
        for (const t of [x > 0 ? s1 - 1 : -1, x < cols - 1 ? s1 + 1 : -1, s1 - cols, s1 + cols]) {
          if (t >= 0 && t < N && mask[t] === 1 && space[t] === id && !bar[t] && part[t] === -1) {
            part[t] = sizes.length;
            stack.push(t);
          }
        }
      }
      sizes.push(n);
    }
    if (sizes.length < 2) continue;
    const open = sizes.indexOf(Math.max(...sizes));
    // Everything else of the room — the closed-off parts and the lines round them — in connected pieces.
    const rest = (s1: number) => mask[s1] === 1 && space[s1] === id && part[s1] !== open;
    const seen = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (!rest(s0) || seen[s0]) continue;
      const group: number[] = [];
      const stack = [s0];
      seen[s0] = 1;
      while (stack.length) {
        const s1 = stack.pop()!;
        group.push(s1);
        const x = s1 % cols;
        for (const t of [x > 0 ? s1 - 1 : -1, x < cols - 1 ? s1 + 1 : -1, s1 - cols, s1 + cols]) {
          if (t >= 0 && t < N && !seen[t] && rest(t)) {
            seen[t] = 1;
            stack.push(t);
          }
        }
      }
      const cellM2 = cell * cell * plan.unitsM * plan.unitsM;
      const enclosed = group.filter((s1) => !bar[s1]).length * cellM2;
      // As deep as joinery: a beam's line across the room closes off half of it, and that half is floor.
      const inGroup = new Set(group);
      let frontier = group.filter((s1) => {
        const x = s1 % cols;
        return [x > 0 ? s1 - 1 : -1, x < cols - 1 ? s1 + 1 : -1, s1 - cols, s1 + cols].some((t) => t < 0 || !inGroup.has(t));
      });
      const level = new Map<number, number>(frontier.map((s1) => [s1, 1]));
      while (frontier.length) {
        const next: number[] = [];
        for (const s1 of frontier) {
          const x = s1 % cols;
          for (const t of [x > 0 ? s1 - 1 : -1, x < cols - 1 ? s1 + 1 : -1, s1 - cols, s1 + cols]) {
            if (t >= 0 && inGroup.has(t) && !level.has(t)) {
              level.set(t, level.get(s1)! + 1);
              next.push(t);
            }
          }
        }
        frontier = next;
      }
      // A shallow wardrobe is drawn full of its hanger strokes: 21's entrance one, 45 deep, kept under 0.1 m² between
      // its lines and was dropped. What lies two cells or more inside the closed-off part counts too — a stray line
      // across open floor is three cells thick and has none.
      const inner = [...level.values()].filter((d) => d >= 3).length * cellM2;
      if (Math.max(enclosed, inner) < BUILT_IN_MIN_M2) {
        if (group.length * cellM2 >= 0.1) skippedBuiltIns.push(Number((group.length * cellM2).toFixed(2)));
        continue;
      }
      if (Math.max(...level.values()) > deepest) continue;
      for (const s1 of group) builtIn[s1] = builtIns;
      builtIns++;
    }
  }
  const cooking = furniture.filter((f) => f.kind === "sink" || f.kind === "hob");
  for (let g = 0; g < builtIns; g++) {
    const rects = mergeSpanRows(rowsOf((s1) => builtIn[s1] === g), cp).filter((r) => r.w >= 0.2 * upm && r.h >= 0.2 * upm);
    const roomOf = space[builtIn.indexOf(g)]!;
    // A worktop where the kitchen's sink or hob stands, in it or in its room; a wardrobe elsewhere (a bathroom's turns into its vanity).
    // Near it, too: 21's living room holds the kitchen, and its entrance wardrobe, 6 m from the sinks, came out a worktop.
    const gap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
      Math.hypot(Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h)));
    const kitchen = cooking.some(
      (f) => space[Math.floor((f.y + f.h / 2) / cp) * cols + Math.floor((f.x + f.w / 2) / cp)] === roomOf && rects.some((r) => gap(r, f) <= KITCHEN_REACH_M * upm),
    );
    for (const r of rects) furniture.push({ ...r, kind: kitchen ? "counter" : "storage", drawn: true });
  }
  if (skippedBuiltIns.length) console.warn(JSON.stringify({ stage: "built-ins", skippedAsLines: skippedBuiltIns.length, m2: skippedBuiltIns }));
  // A sink in no counter — the drawn ones, and the joinery the lines close off —
  // is a basin standing on its own: built as a kitchen sink it was a bowl with
  // nothing under it, and the WC's basin was missing. Judged before the
  // kitchen's runs were read, the kitchen's own two sinks became basins.
  const counters = furniture.filter((f) => f.kind === "counter");
  for (const f of furniture) {
    if (f.kind !== "sink") continue;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    if (!counters.some((c) => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h)) Object.assign(f, { kind: "fixture", fixture: "basin" });
  }
  const fixturesIn = (id: number) =>
    furniture.filter((f) => {
      const X = Math.floor((f.x + f.w / 2) / cp);
      const Y = Math.floor((f.y + f.h / 2) / cp);
      return X >= 0 && Y >= 0 && X < cols && Y < rows && space[Y * cols + X] === id;
    });

  // Rooms: the flat's spaces, named by the labels standing in them.
  const labels = plan.texts
    // "חלון ממ״ד הזזה" names a window, not the room it is in.
    .filter((t) => ROOM_WORD.test(t.text) && !/חלון|דלת/u.test(t.text))
    .map((t) => ({ ...t, cell: floorCellNear(t.at) }))
    .filter((t) => t.cell >= 0);
  const counts = new Map<number, number>();
  for (let s = 0; s < N; s++) if (mask[s] === 1 && roomOf[s]! > 0) counts.set(roomOf[s]!, (counts.get(roomOf[s]!) ?? 0) + 1);
  const named = new Map<string, number>();
  const rooms: SceneInput["rooms"] = [];
  for (const [id, n] of counts) {
    const areaM2 = n * cell * cell * plan.unitsM * plan.unitsM;
    if (areaM2 < 1) continue;
    const inside = labels.filter((t) => space[t.cell] === id && mask[t.cell] === 1 && !/מרפס/u.test(t.text));
    // A bathroom is named by what stands in it: the sheet writes no word there.
    const fixtures = fixturesIn(id).map((f) => f.fixture ?? f.kind);
    const byFixtures = fixtures.includes("bath") || fixtures.includes("shower") ? "אמבטיה" : fixtures.includes("toilet") ? "שירותים" : fixtures.includes("washer") ? "חדר כביסה" : null;
    const base = inside[0]?.text.trim() ?? byFixtures ?? (areaM2 < 6 ? "מבואה" : "מסדרון");
    const count = (named.get(base) ?? 0) + 1;
    named.set(base, count);
    rooms.push({
      name: count > 1 ? `${base} ${count}` : base,
      kind: inferRoomKind(base),
      areaM2,
      rects: mergeSpanRows(rowsOf((s) => mask[s] === 1 && roomOf[s] === id), cp),
    });
  }
  // An open space carries two names (living and kitchen): the scene splits it by them.
  const labelledRooms = labels
    .filter((t) => mask[t.cell] === 1 && !/מרפס/u.test(t.text))
    .map((t) => {
      const h = Math.max(t.height * k, 0.25 * upm);
      const w = Math.max(t.text.length * h * 0.6, 0.8 * upm);
      return { name: t.text.trim(), kind: inferRoomKind(t.text), box: { x: px(t.at.x), y: py(t.at.y) - h, w, h } };
    });

  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const r of [...floorRects, ...terraceRects.flat()]) {
    bx0 = Math.min(bx0, r.x);
    by0 = Math.min(by0, r.y);
    bx1 = Math.max(bx1, r.x + r.w);
    by1 = Math.max(by1, r.y + r.h);
  }

  return {
    unitsPerMetre: upm,
    bounds: { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 },
    bodies,
    openings,
    floorRects,
    terraceRects,
    furniture,
    rooms,
    labelledRooms,
  };
}

/** Furniture and fixtures the drawing places as blocks, by the block's name. */
function piecesOf(plan: UnitPlan, px: (x: number) => number, py: (y: number) => number, upm: number): SceneInput["furniture"] {
  const out: SceneInput["furniture"] = [];
  const k = plan.unitsM * DXF_PAGE_UNITS_PER_METRE;
  for (const piece of plan.pieces) {
    // Only what stands on this flat: its neighbour's furniture shares the window.
    const cx = piece.corners.reduce((a, q) => a + q.x, 0) / piece.corners.length;
    const cy = piece.corners.reduce((a, q) => a + q.y, 0) / piece.corners.length;
    const X = Math.floor((cx - plan.x0) / plan.cell);
    const Y = Math.floor((plan.y1 - cy) / plan.cell);
    if (X < 0 || Y < 0 || X >= plan.cols || Y >= plan.rows || !plan.mask[Y * plan.cols + X]) continue;
    const xs = piece.corners.map((q) => px(q.x));
    const ys = piece.corners.map((q) => py(q.y));
    const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (rect.w < 0.2 * upm || rect.h < 0.2 * upm) continue;
    const name = piece.block.toLowerCase();
    const kind = pieceKind(name, rect.w / upm, rect.h / upm, piece.kind === "sanitary");
    if (!kind) continue;
    // A dining set is one block: its table and each chair round it, built as themselves, not one slab the set's size.
    const parts = (piece.parts ?? [])
      .map((b) => ({ x: px(b.x0), y: py(b.y1), w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k }))
      .filter((b) => Math.max(b.w, b.h) >= 0.2 * upm);
    const top = parts.sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const chairs = parts.filter((b) => b !== top && Math.max(b.w, b.h) / upm <= 0.65);
    // A top 96 × 215 measures as a bed; with chairs drawn round it, it is the table they stand at.
    if (kind.kind === "table" && top && chairs.length >= 2 && Math.min(top.w, top.h) / upm >= 0.6 && Math.max(top.w, top.h) / upm >= 0.9) {
      out.push({ ...top, kind: "table", drawn: true });
      // A chair is often closed only at its back, a 7 × 34 cm slat: the seat
      // stands on the table's side of it. Built at a chair's size, once each.
      const side = 0.44 * upm;
      const tc = { x: top.x + top.w / 2, y: top.y + top.h / 2 };
      const seats: Array<{ x: number; y: number }> = [];
      for (const c of chairs) {
        let at = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
        if (Math.min(c.w, c.h) <= 0.12 * upm) {
            at = c.w < c.h ? { x: at.x + Math.sign(tc.x - at.x) * side * 0.45, y: at.y } : { x: at.x, y: at.y + Math.sign(tc.y - at.y) * side * 0.45 };
        }
        if (seats.some((q) => Math.hypot(q.x - at.x, q.y - at.y) < side * 0.6)) continue;
        seats.push(at);
        out.push({ x: at.x - side / 2, y: at.y - side / 2, w: side, h: side, kind: "seat", drawn: true });
      }
      continue;
    }
    // A sofa block draws its cushions inside it; a desk is one top. דירה 14's second armchair, 140 × 70, was built as a desk.
    if (kind.kind === "desk" && (piece.parts ?? []).length >= 2) {
      out.push({ ...rect, kind: "seat", drawn: true });
      continue;
    }
    // A bed's head at the end its block draws the pillow: 18's two single beds, pillows both at the window, came back
    // one each way when the walls decided it.
    if (kind.kind === "bed") {
      const down = rect.h >= rect.w;
      const len = down ? rect.h : rect.w;
      const pillows = parts.filter((b) => Math.max(b.w, b.h) < len * 0.6 && Math.min(b.w, b.h) >= 0.12 * upm);
      const ends = pillows.map((b) => (down ? b.y + b.h / 2 - (rect.y + rect.h / 2) : b.x + b.w / 2 - (rect.x + rect.w / 2)) / len);
      if (ends.length && ends.every((e) => e > 0.25)) {
        out.push({ ...rect, ...kind, head: down ? "south" : "east", drawn: true });
        continue;
      }
      if (ends.length && ends.every((e) => e < -0.25)) {
        out.push({ ...rect, ...kind, head: down ? "north" : "west", drawn: true });
        continue;
      }
    }
    out.push({ ...rect, ...kind, drawn: true });
  }
  return out;
}

/**
 * What a block is: by its name where the office names it, otherwise by its
 * size — a 90 × 210 rectangle in a bedroom is a bed whatever the block is called.
 */
function pieceKind(
  name: string,
  wM: number,
  hM: number,
  sanitary: boolean,
): { kind: string; fixture?: "bath" | "shower" | "toilet" | "basin" | "washer" } | null {
  if (/sherotim|toilet|wc|asla/.test(name)) return { kind: "fixture", fixture: "toilet" };
  if (/bath|ambatya/.test(name)) return { kind: "fixture", fixture: "bath" };
  if (/shower|miklaha/.test(name)) return { kind: "fixture", fixture: "shower" };
  if (/kvisa|washer/.test(name)) return { kind: "fixture", fixture: "washer" };
  // A wash basin drawn as a ring of loose arcs, read in dxf-unit-by-doors: a basin, never the kitchen's sink.
  if (name === "drawn-basin") return { kind: "fixture", fixture: "basin" };
  if (/kiyor|sink|basin/.test(name)) return { kind: "sink" };
  if (/gaz|hob|kirayim/.test(name)) return { kind: "hob" };
  if (/mekarer|fridge|aron|wardrobe|closet/.test(name)) return { kind: "storage" };
  if (name === "stool") return { kind: "stool" };
  if (/bed|mita/.test(name)) return { kind: "bed" };
  if (/table|shulhan/.test(name)) return { kind: "table" };
  if (/sofa|sapa|chair|kise/.test(name)) return { kind: "seat" };
  const long = Math.max(wM, hM);
  const short = Math.min(wM, hM);
  // No fixture is this deep: 18's dining set, table and six chairs, is one block drawn on the sanitary layer.
  if (sanitary && short >= 1.2 && long >= 1.5 && long <= 3.4) return { kind: "table" };
  if (sanitary) {
    if (long >= 1.4 && long <= 1.9 && short >= 0.6 && short <= 0.9) return { kind: "fixture", fixture: "bath" };
    // A basin's vanity: a worktop half a metre deep, as long as the wall it stands on.
    // Built as a kitchen counter, it stood with no basin in it.
    if (long >= 0.8 && long <= 2.4 && short >= 0.4 && short < 0.6) return { kind: "fixture", fixture: "basin" };
    return null;
  }
  if (long >= 1.85 && long <= 2.25 && short >= 0.8 && short <= 2.0) return { kind: "bed" };
  if (long >= 1.5 && long <= 3.4 && short >= 0.8 && short <= 1.9) return { kind: "table" };
  if (long >= 1.0 && long <= 1.8 && short >= 0.5 && short <= 0.8) return { kind: "desk" };
  if (long <= 1.0 && short >= 0.5) return { kind: "seat" };
  return null;
}

/**
 * A wall's outer face kept straight. What stands against the flat's walls from
 * outside — the stairwell's treads, a lobby's wall ending on it — fills in as
 * wall within reach of the floor, and דירה 14's corridor wall came out in steps.
 * Along each straight inner face the wall's thickness is the thinnest one held
 * over a third of its length; what juts past that on the outside is dropped.
 * A column inside has an inner face of its own, so it is never cut through; nor
 * is a cell as near some other floor as the wall is thick — a door's jamb, the
 * wall closing a hall (`dist`: cells from the nearest floor).
 */
export function straightenOuterFaces(solid: Uint8Array, mask: Uint8Array, dist: Int16Array, cols: number, rows: number, minRun: number): void {
  const drop: number[] = [];
  // Each direction: lines across the wall (rows for a wall running up the page), and the step into it.
  for (const across of ["row", "col"] as const) {
    const lines = across === "row" ? rows : cols;
    const length = across === "row" ? cols : rows;
    const at = (line: number, i: number) => (across === "row" ? line * cols + i : i * cols + line);
    for (const dir of [1, -1]) {
      // For each line, every run of wall starting at the floor: where it starts and how thick it is to the outside.
      const runs: Array<Map<number, number>> = [];
      for (let line = 0; line < lines; line++) {
        const found = new Map<number, number>();
        for (let i = 0; i < length; i++) {
          const prev = i - dir;
          if (prev < 0 || prev >= length || !mask[at(line, prev)] || !solid[at(line, i)]) continue;
          let j = i;
          while (j >= 0 && j < length && solid[at(line, j)]) j += dir;
          // Through to more floor: a partition, not an outer wall.
          if (j >= 0 && j < length && mask[at(line, j)]) continue;
          found.set(i, Math.abs(j - i));
        }
        runs.push(found);
      }
      // A straight inner face: consecutive lines whose run starts at the same place.
      const visited = runs.map(() => new Set<number>());
      for (let line = 0; line < lines; line++) {
        for (const start of runs[line]!.keys()) {
          if (visited[line]!.has(start)) continue;
          const face: Array<{ line: number; t: number }> = [];
          for (let l = line; l < lines && runs[l]!.has(start) && !visited[l]!.has(start); l++) {
            visited[l]!.add(start);
            face.push({ line: l, t: runs[l]!.get(start)! });
          }
          if (face.length < minRun) continue;
          const sorted = face.map((f) => f.t).sort((a, b) => a - b);
          const enough = Math.max(minRun / 2, face.length / 3);
          const thickness = sorted.find((t) => face.filter((f) => Math.abs(f.t - t) <= 1).length >= enough);
          if (thickness == null) continue;
          for (const f of face) {
            if (f.t <= thickness + 2) continue;
            for (let k = thickness + 1; k < f.t; k++) {
              const s = at(f.line, start + dir * k);
              if (dist[s] === -1 || dist[s]! > thickness + 1) drop.push(s);
            }
          }
        }
      }
    }
  }
  for (const s of drop) solid[s] = 0;
}

/** Cells set in a mask, as maximal horizontal runs stacked into rectangles (cell units). */
function rectanglesOf(on: Uint8Array, cols: number, rows: number): Rect[] {
  const out: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let y = 0; y <= rows; y++) {
    const runs: Array<[number, number]> = [];
    if (y < rows) {
      let start = -1;
      for (let x = 0; x <= cols; x++) {
        const set = x < cols && on[y * cols + x] === 1;
        if (set && start < 0) start = x;
        if (!set && start >= 0) {
          runs.push([start, x]);
          start = -1;
        }
      }
    }
    const next = new Map<string, Rect>();
    for (const [a, b] of runs) {
      const key = `${a}:${b}`;
      const prev = open.get(key);
      if (prev) {
        prev.h += 1;
        next.set(key, prev);
        open.delete(key);
      } else next.set(key, { x: a, y, w: b - a, h: 1 });
    }
    for (const r of open.values()) out.push(r);
    open = next;
  }
  for (const r of open.values()) out.push(r);
  return out;
}
