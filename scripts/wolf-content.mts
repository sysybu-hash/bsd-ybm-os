/**
 * What each kind of room holds, placed inside the room the plan reads: the pieces the plan itself draws are kept,
 * and a room the sheet leaves bare is given its own — desks and a board in a classroom, benches and screens in
 * a computer room, shelves in a library, a table and lockers in the teachers' room, stalls in a WC.
 * Every piece is tested against the room's own cells; nothing stands in a wall or outside the room.
 * Each piece comes back twice: as the 3D boxes the renderer draws and as the symbol the colour plan draws.
 */
import type { PlanRoom } from "@/lib/projects/building/plan-rooms";
import type { PlanOpening } from "@/lib/projects/building/plan-openings";
import type { Primitive } from "@/lib/projects/building/model";

export type FurnKind =
  | "desk" | "chair" | "teacherDesk" | "board" | "table" | "roundTable" | "shelf" | "locker" | "cabinet" | "counter"
  | "monitor" | "sofa" | "stall" | "toilet" | "basin" | "bench" | "plant" | "bed" | "mat";
export type Furn = { kind: FurnKind; x: number; y: number; lu: number; lv: number; angle: number };

const STEP = 0.02;
const snap = (v: number) => Math.round(v / STEP) * STEP;
const inCell = (room: PlanRoom, x: number, y: number): boolean => {
  const sy = snap(y);
  const row = room.rows.find((r) => Math.abs(r.y - sy) < 0.011 || Math.abs(r.y - (sy - STEP)) < 0.011);
  return !!row && row.spans.some(([a, b]) => x >= a && x < b);
};
/** A rectangle (centre, length along the angle, width across) all inside the room, with a clearance round it. */
const fits = (room: PlanRoom, f: Furn, clear = 0.12): boolean => {
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const hu = f.lu / 2 + clear, hv = f.lv / 2 + clear;
  for (const [u, v] of [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv], [0, 0], [-hu, 0], [hu, 0], [0, -hv], [0, hv]] as const) {
    if (!inCell(room, f.x + u * c - v * s, f.y + u * s + v * c)) return false;
  }
  return true;
};

type Edge = "W" | "E" | "N" | "S";
/** The edge of the room with the least window on it: where the board, the shelves, the desk stand. */
function quietEdge(room: PlanRoom, openings: PlanOpening[], prefer: Edge[] = ["W", "E", "N", "S"]): Edge {
  const b = room.bounds;
  const len = (e: Edge) => {
    let total = 0;
    for (const o of openings) {
      if (!o.exterior && !o.door) continue;
      const span = e === "W" || e === "E" ? [o.y, o.y + o.h] : [o.x, o.x + o.w];
      const lo = e === "W" || e === "E" ? b.y : b.x, hi = e === "W" || e === "E" ? b.y + b.h : b.x + b.w;
      const near = e === "W" ? Math.abs(o.x + o.w / 2 - b.x) < 0.6 : e === "E" ? Math.abs(o.x + o.w / 2 - (b.x + b.w)) < 0.6 : e === "N" ? Math.abs(o.y + o.h / 2 - b.y) < 0.6 : Math.abs(o.y + o.h / 2 - (b.y + b.h)) < 0.6;
      if (near) total += Math.max(0, Math.min(hi, span[1]!) - Math.max(lo, span[0]!));
    }
    return total;
  };
  return [...prefer].sort((p, q) => len(p) - len(q) || prefer.indexOf(p) - prefer.indexOf(q))[0]!;
}

/** A frame whose F axis points from the front edge into the room, and R across it. */
function frameFor(room: PlanRoom, edge: Edge) {
  const b = room.bounds;
  const F = edge === "W" ? { x: 1, z: 0 } : edge === "E" ? { x: -1, z: 0 } : edge === "N" ? { x: 0, z: 1 } : { x: 0, z: -1 };
  const R = { x: -F.z, z: F.x };
  const depth = edge === "W" || edge === "E" ? b.w : b.h;
  const width = edge === "W" || edge === "E" ? b.h : b.w;
  const origin = edge === "W" ? { x: b.x, z: b.y + b.h / 2 } : edge === "E" ? { x: b.x + b.w, z: b.y + b.h / 2 } : edge === "N" ? { x: b.x + b.w / 2, z: b.y } : { x: b.x + b.w / 2, z: b.y + b.h };
  /** a across (right of the room's middle of that edge), d into the room from the edge. */
  const at = (a: number, d: number) => ({ x: origin.x + R.x * a + F.x * d, y: origin.z + R.z * a + F.z * d });
  const angleF = Math.atan2(F.z, F.x);
  const angleR = Math.atan2(R.z, R.x);
  return { at, depth, width, angleF, angleR };
}

export function furnishRoom(room: PlanRoom, name: string, openings: PlanOpening[]): Furn[] {
  const out: Furn[] = [];
  const area = room.areaM2;
  const b = room.bounds;
  const add = (f: Furn, clear = 0.1) => { if (fits(room, f, clear)) { out.push(f); return true; } return false; };
  const n = name;
  const isClass = /כיתה|כתה/.test(n) || (room.kind === "classroom" && area >= 22 && !/טיפול|עבודה פרטנית|תקשורת|הקבצה|התרגעות|עזר/.test(n));
  const isLab = /טכנולוגיה|מחשב/.test(n) || room.kind === "computers";
  const isLibrary = /ספריה|משחקים/.test(n);
  const isTeachers = /מורים/.test(n);
  const isOffice = /מנהל|סגן|מזכירות|יועץ|פסיכולוג|אחות|רופא|קלינאית|צוות|הנהלה/.test(n);
  const isTreat = /טיפול|עבודה פרטנית|הקבצה|התרגעות|תקשורת|תעסוקה|מוזיקה|עזר/.test(n);
  const isWc = room.kind === "wc" || /שירותים/.test(n);
  const isKitchen = room.kind === "kitchen" || /מטבח/.test(n);
  const isStore = room.kind === "store" || /מחסן|ח\.שרת/.test(n);
  const isMmd = room.kind === "mmd" || /ממ"|מ\.מ\.מ/.test(n);
  const isHall = room.kind === "hall" || /אולם/.test(n);

  if (isHall) return out;
  // A label standing in an open lobby claims a region far larger than its room: nothing is placed in it.
  if ((isKitchen || isOffice || isStore) && area > 90) return out;

  if (isClass || isLab) {
    const edge = quietEdge(room, openings, b.w >= b.h ? ["W", "E", "N", "S"] : ["N", "S", "W", "E"]);
    const fr = frameFor(room, edge);
    const usableW = fr.width - 1.6;
    if (isClass) {
      // The board on the front wall, the teacher's desk before it, rows of pair desks facing it.
      add({ kind: "board", ...fr.at(0, 0.03), lu: Math.min(3.2, fr.width * 0.5), lv: 0.05, angle: fr.angleR });
      add({ kind: "teacherDesk", ...fr.at(0.9, 1.25), lu: 1.5, lv: 0.7, angle: fr.angleR });
      // The teacher sits between the board and the desk, facing the class.
      add({ kind: "chair", ...fr.at(0.9, 0.68), lu: 0.45, lv: 0.45, angle: fr.angleF }, 0.02);
      const cols = Math.max(2, Math.floor(usableW / 1.55));
      const rows = Math.max(1, Math.floor((fr.depth - 2.1) / 1.25));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = (c - (cols - 1) / 2) * 1.55;
          const d = 2.45 + r * 1.25;
          if (add({ kind: "desk", ...fr.at(a, d), lu: 1.2, lv: 0.55, angle: fr.angleR }, 0.15)) {
            for (const s of [-0.3, 0.3]) add({ kind: "chair", ...fr.at(a + s, d + 0.5), lu: 0.42, lv: 0.42, angle: fr.angleF + Math.PI }, 0.04);
          }
        }
      }
      // A cabinet along the back wall, a plant by the window.
      add({ kind: "cabinet", ...fr.at(-fr.width / 2 + 0.4, fr.depth - 0.3), lu: 1.0, lv: 0.45, angle: fr.angleR }, 0.05);
      add({ kind: "cabinet", ...fr.at(fr.width / 2 - 0.4, fr.depth - 0.3), lu: 1.0, lv: 0.45, angle: fr.angleR }, 0.05);
    } else {
      // Benches in rows, a screen and a chair at every place; the teacher's station before the board.
      add({ kind: "board", ...fr.at(0, 0.03), lu: Math.min(3.2, fr.width * 0.5), lv: 0.05, angle: fr.angleR });
      const cols = Math.max(1, Math.floor(usableW / 3.2));
      const rows = Math.max(1, Math.floor((fr.depth - 1.8) / 2.0));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = (c - (cols - 1) / 2) * 3.3;
          const d = 2.1 + r * 2.0;
          if (add({ kind: "table", ...fr.at(a, d), lu: 3.0, lv: 0.8, angle: fr.angleR }, 0.2)) {
            for (const s of [-1.05, -0.35, 0.35, 1.05]) {
              const p = fr.at(a + s, d);
              out.push({ kind: "monitor", ...p, lu: 0.5, lv: 0.05, angle: fr.angleR });
              add({ kind: "chair", ...fr.at(a + s, d + 0.62), lu: 0.45, lv: 0.45, angle: fr.angleF + Math.PI }, 0.03);
            }
          }
        }
      }
    }
    return out;
  }

  if (isLibrary) {
    const edge = quietEdge(room, openings);
    const fr = frameFor(room, edge);
    // Bookcases along the quiet wall and the back one, long tables with chairs in the middle.
    for (let a = -fr.width / 2 + 0.7; a < fr.width / 2 - 0.5; a += 1.05) add({ kind: "shelf", ...fr.at(a, 0.22), lu: 1.0, lv: 0.4, angle: fr.angleR }, 0.02);
    const rows = Math.max(1, Math.floor((fr.depth - 1.6) / 1.9));
    for (let r = 0; r < rows; r++) {
      const d = 1.7 + r * 1.9;
      if (add({ kind: "table", ...fr.at(0, d), lu: Math.min(3.6, fr.width - 1.4), lv: 0.9, angle: fr.angleR }, 0.2)) {
        const L = Math.min(3.6, fr.width - 1.4);
        for (let a = -L / 2 + 0.5; a <= L / 2 - 0.4; a += 0.9) {
          add({ kind: "chair", ...fr.at(a, d - 0.65), lu: 0.45, lv: 0.45, angle: fr.angleF }, 0.02);
          add({ kind: "chair", ...fr.at(a, d + 0.65), lu: 0.45, lv: 0.45, angle: fr.angleF + Math.PI }, 0.02);
        }
      }
    }
    return out;
  }

  if (isTeachers) {
    const edge = quietEdge(room, openings);
    const fr = frameFor(room, edge);
    for (let a = -fr.width / 2 + 0.5; a < fr.width / 2 - 0.4; a += 0.8) add({ kind: "locker", ...fr.at(a, 0.3), lu: 0.7, lv: 0.5, angle: fr.angleR }, 0.02);
    // The table where the room is widest: try across the room's depth, then its width, shorter each time.
    let seated = false;
    for (const L0 of [3.6, 3.0, 2.4, 1.8]) {
      for (const dd of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        if (seated) break;
        const d = fr.depth * dd + 0.3;
        for (const a0 of [0, -fr.width * 0.2, fr.width * 0.2]) {
          const L = Math.min(L0, Math.max(1.4, fr.width - 1.2));
          if (add({ kind: "table", ...fr.at(a0, d), lu: L, lv: 1.2, angle: fr.angleR }, 0.3)) {
            for (let a = a0 - L / 2 + 0.45; a <= a0 + L / 2 - 0.3; a += 0.8) {
              add({ kind: "chair", ...fr.at(a, d - 0.9), lu: 0.45, lv: 0.45, angle: fr.angleF }, 0.02);
              add({ kind: "chair", ...fr.at(a, d + 0.9), lu: 0.45, lv: 0.45, angle: fr.angleF + Math.PI }, 0.02);
            }
            seated = true;
            break;
          }
        }
      }
    }
    add({ kind: "sofa", ...fr.at(-fr.width / 2 + 0.7, fr.depth - 0.6), lu: 1.8, lv: 0.8, angle: fr.angleR + Math.PI }, 0.05);
    return out;
  }

  if (isOffice || isTreat) {
    const edge = quietEdge(room, openings);
    const fr = frameFor(room, edge);
    const desks = Math.max(1, Math.min(4, Math.round(area / 12)));
    for (let i = 0; i < desks; i++) {
      const a = (i - (desks - 1) / 2) * Math.min(2.2, fr.width / desks);
      if (add({ kind: "teacherDesk", ...fr.at(a, 0.55), lu: 1.4, lv: 0.7, angle: fr.angleR }, 0.1)) {
        out.push({ kind: "monitor", ...fr.at(a, 0.35), lu: 0.5, lv: 0.05, angle: fr.angleR });
        add({ kind: "chair", ...fr.at(a, 1.2), lu: 0.48, lv: 0.48, angle: fr.angleF + Math.PI }, 0.04);
      }
    }
    // The visitors' chairs stand across the desk and face it.
    add({ kind: "chair", ...fr.at(-0.5, Math.min(fr.depth - 0.9, 2.0)), lu: 0.45, lv: 0.45, angle: fr.angleF + Math.PI }, 0.04);
    add({ kind: "chair", ...fr.at(0.5, Math.min(fr.depth - 0.9, 2.0)), lu: 0.45, lv: 0.45, angle: fr.angleF + Math.PI }, 0.04);
    add({ kind: "cabinet", ...fr.at(fr.width / 2 - 0.4, fr.depth - 0.28), lu: 1.0, lv: 0.45, angle: fr.angleR }, 0.04);
    return out;
  }

  if (isWc) {
    const edge = quietEdge(room, openings);
    const fr = frameFor(room, edge);
    // Stalls along the quiet wall, basins across.
    const stalls = Math.max(1, Math.min(6, Math.floor((fr.width - 0.4) / 0.95)));
    for (let i = 0; i < stalls; i++) {
      const a = (i - (stalls - 1) / 2) * 0.95;
      if (add({ kind: "toilet", ...fr.at(a, 0.4), lu: 0.4, lv: 0.6, angle: fr.angleF }, 0.0)) {
        if (i < stalls - 1) out.push({ kind: "stall", ...fr.at(a + 0.475, 0.95), lu: 0.03, lv: 1.9, angle: fr.angleF });
      }
    }
    for (let i = 0; i < Math.min(3, stalls); i++) add({ kind: "basin", ...fr.at((i - (Math.min(3, stalls) - 1) / 2) * 0.8, fr.depth - 0.3), lu: 0.5, lv: 0.4, angle: fr.angleF + Math.PI }, 0.0);
    return out;
  }

  if (isKitchen) {
    const edge = quietEdge(room, openings);
    const fr = frameFor(room, edge);
    for (let a = -fr.width / 2 + 0.6; a < fr.width / 2 - 0.4; a += 1.2) add({ kind: "counter", ...fr.at(a, 0.35), lu: 1.2, lv: 0.6, angle: fr.angleR }, 0.0);
    add({ kind: "counter", ...fr.at(0, Math.min(fr.depth - 0.9, 2.2)), lu: Math.min(2.4, fr.width - 1.2), lv: 0.9, angle: fr.angleR }, 0.3);
    return out;
  }

  if (isStore || isMmd) {
    const edge = quietEdge(room, openings);
    const fr = frameFor(room, edge);
    for (let a = -fr.width / 2 + 0.5; a < fr.width / 2 - 0.3; a += 1.05) add({ kind: "shelf", ...fr.at(a, 0.22), lu: 1.0, lv: 0.4, angle: fr.angleR }, 0.02);
    if (isMmd) add({ kind: "bench", ...fr.at(0, fr.depth - 0.4), lu: Math.min(2.4, fr.width - 1), lv: 0.4, angle: fr.angleR }, 0.04);
    return out;
  }
  return out;
}

const M = (x: number) => x;
/** The 3D boxes of a piece, standing on `level`. */
export function furnPrimitives(f: Furn, level: number, tag: string): Primitive[] {
  const out: Primitive[] = [];
  const c = Math.cos(f.angle), s = Math.sin(f.angle);
  const part = (u: number, v: number, lu: number, lv: number, y0: number, y1: number, material: Primitive extends { material: infer T } ? T : never) =>
    out.push({ type: "box", centre: { x: f.x + u * c - v * s, y: level + (y0 + y1) / 2, z: f.y + u * s + v * c }, size: { x: lu, y: y1 - y0, z: lv }, rotY: -f.angle, material: material as never, tag });
  const legs = (lu: number, lv: number, h: number, t = 0.035, inset = 0.04) => {
    for (const su of [-1, 1]) for (const sv of [-1, 1]) part(su * (lu / 2 - inset), sv * (lv / 2 - inset), t, t, 0, h, "metal");
  };
  switch (f.kind) {
    case "desk":
      legs(f.lu, f.lv, 0.72);
      part(0, 0, f.lu, f.lv, 0.72, 0.755, "timber");
      break;
    case "teacherDesk":
      legs(f.lu, f.lv, 0.74);
      part(0, 0, f.lu, f.lv, 0.74, 0.775, "worktop");
      part(f.lu / 2 - 0.25, 0, 0.45, f.lv - 0.05, 0.1, 0.74, "cabinet");
      break;
    case "table":
      legs(f.lu, f.lv, 0.74);
      part(0, 0, f.lu, f.lv, 0.74, 0.775, "timber");
      break;
    case "roundTable":
      out.push({ type: "cylinder", centre: { x: f.x, y: level + 0.37, z: f.y }, radius: 0.05, height: 0.74, material: "metal", tag });
      out.push({ type: "cylinder", centre: { x: f.x, y: level + 0.755, z: f.y }, radius: f.lu / 2, height: 0.03, material: "timber", tag });
      break;
    case "chair": {
      // Facing along `angle`: the back stands behind the seat.
      legs(f.lu * 0.9, f.lv * 0.9, 0.44, 0.025, 0.03);
      part(0, 0, f.lu * 0.95, f.lv * 0.95, 0.44, 0.48, "upholsteryAccent");
      part(-f.lu * 0.45, 0, 0.04, f.lv * 0.95, 0.48, 0.86, "upholsteryAccent");
      break;
    }
    case "board":
      part(0, 0, f.lu, 0.05, 0.9, 2.1, "whiteboard");
      part(0, 0.02, f.lu + 0.06, 0.04, 0.88, 0.92, "metal");
      break;
    case "monitor":
      part(0, 0, 0.16, 0.12, 0.75, 0.8, "metal");
      part(0, 0, f.lu, 0.035, 0.8, 1.12, "screen");
      break;
    case "shelf":
      part(0, 0, f.lu, f.lv, 0, 2.0, "cabinet");
      for (const y of [0.45, 0.9, 1.35, 1.8]) part(0, f.lv * 0.1, f.lu - 0.06, f.lv - 0.1, y, y + 0.02, "timber");
      break;
    case "locker":
      part(0, 0, f.lu, f.lv, 0, 1.9, "darkSteel");
      break;
    case "cabinet":
      part(0, 0, f.lu, f.lv, 0, 1.3, "cabinet");
      part(0, 0, f.lu + 0.02, f.lv + 0.02, 1.3, 1.33, "worktop");
      break;
    case "counter":
      part(0, 0, f.lu, f.lv, 0, 0.86, "cabinet");
      part(0, 0, f.lu + 0.02, f.lv + 0.02, 0.86, 0.9, "worktop");
      break;
    case "sofa":
      part(0, 0, f.lu, f.lv, 0.1, 0.42, "sofaFabric");
      part(0, f.lv / 2 - 0.1, f.lu, 0.2, 0.42, 0.82, "sofaFabric");
      part(-f.lu / 2 + 0.08, 0, 0.16, f.lv, 0.42, 0.62, "sofaFabric");
      part(f.lu / 2 - 0.08, 0, 0.16, f.lv, 0.42, 0.62, "sofaFabric");
      break;
    case "stall":
      part(0, 0, f.lu, f.lv, 0.15, 2.05, "linen");
      break;
    case "toilet":
      part(0, 0, f.lu, f.lv, 0, 0.4, "ceramic");
      part(-f.lu / 2 + 0.05, 0, 0.12, f.lv * 0.8, 0.4, 0.85, "ceramic");
      break;
    case "basin":
      part(0, 0, f.lu, f.lv, 0.78, 0.86, "ceramic");
      part(0, 0, 0.08, 0.08, 0, 0.78, "metal");
      break;
    case "bench":
      legs(f.lu, f.lv, 0.44);
      part(0, 0, f.lu, f.lv, 0.44, 0.48, "timber");
      break;
    case "mat":
      part(0, 0, f.lu, f.lv, 0, 0.05, "upholsteryAccent");
      break;
    case "plant":
      out.push({ type: "cylinder", centre: { x: f.x, y: level + 0.25, z: f.y }, radius: 0.25, height: 0.5, material: "planter", tag });
      out.push({ type: "tree", at: { x: f.x, y: level + 0.5, z: f.y }, height: 1.6, crown: 0.5, tag });
      break;
    case "bed":
      part(0, 0, f.lu, f.lv, 0.2, 0.5, "linen");
      break;
  }
  void M;
  return out;
}
