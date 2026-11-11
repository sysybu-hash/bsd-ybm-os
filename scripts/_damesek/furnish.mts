// Scratch (Damesek Eliezer dedicated builder): each furniture / sanitary block built as the thing it is — a bench with its seat,
// back and ends, the aron kodesh with its doors and parochet, the bimah's platform, rail and lectern, a hung WC, a urinal, a marble
// vanity — inside the block's own drawn extent, turned the way the plan turns it. Delete when done.
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";

export type Block = { family: string; layer: string; pieces: DxfPiece[]; m?: { a: number; b: number; c: number; d: number; e: number; f: number } };
/** The block's frame: centre (plan cm), its local axes as plan unit vectors, its extent along each (cm). */
export type Frame = { c: Pt; u: Pt; v: Pt; w: number; d: number };

const ptsOf = (p: DxfPiece): Pt[] => {
  if (p.circle) return [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: p.circle!.c.x + sx * p.circle!.r, y: p.circle!.c.y + sy * p.circle!.r })));
  // an arc runs counter-clockwise from start to end: one whose end angle is past 2π (end < start) wraps, not the long way round
  if (p.arc) { const { c, r, start } = p.arc; const end = p.arc.end < start ? p.arc.end + 2 * Math.PI : p.arc.end; const n = 8; return Array.from({ length: n + 1 }, (_, k) => { const t = start + ((end - start) * k) / n; return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }; }); }
  return p.pts ?? p.rings?.flat() ?? [];
};

export function frameOf(b: Block): Frame | null {
  const pts = b.pieces.filter((p) => p.type !== "TEXT" && p.type !== "MTEXT" && p.type !== "ATTRIB").flatMap(ptsOf);
  if (pts.length < 2) return null;
  let u = { x: 1, y: 0 };
  if (b.m) { const l = Math.hypot(b.m.a, b.m.b); if (l > 1e-9) u = { x: b.m.a / l, y: b.m.b / l }; }
  const v = { x: -u.y, y: u.x };
  const us = pts.map((q) => q.x * u.x + q.y * u.y), vs = pts.map((q) => q.x * v.x + q.y * v.y);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return { c: { x: u.x * cu + v.x * cv, y: u.y * cu + v.y * cv }, u, v, w: u1 - u0, d: v1 - v0 };
}

/** Parts in the frame's own terms: lu along u, lv along v (cm from the centre), y from the floor (cm), sizes in cm. */
type Part = { lu: number; lv: number; y0: number; y1: number; su: number; sv: number; mat: BuildingMaterial; round?: number };

export function toPrims(f: Frame, level: number, parts: Part[], tag: string): Primitive[] {
  const rotY = Math.atan2(f.u.y, f.u.x);
  return parts.filter((p) => p.su > 0.2 && p.sv > 0.2 && p.y1 - p.y0 > 0.2).map((p) => {
    const X = f.c.x + f.u.x * p.lu + f.v.x * p.lv, Y = f.c.y + f.u.y * p.lu + f.v.y * p.lv;
    return {
      type: "box" as const,
      centre: { x: X / 100, y: (level + (p.y0 + p.y1) / 2) / 100, z: -Y / 100 },
      size: { x: p.su / 100, y: (p.y1 - p.y0) / 100, z: p.sv / 100 },
      material: p.mat,
      tag,
      ...(Math.abs(rotY) > 1e-4 ? { rotY } : {}),
      ...(p.round ? { round: p.round / 100 } : {}),
    };
  });
}

/**
 * The parts of a block of this family. `back` is the side (+1 or −1 along the short axis, or along v when `alongV`) the piece's back is
 * on: a bench's back away from what it faces, a WC's cistern against its wall.
 */
export function partsOf(family: string, layer: string, f: Frame, back: (axis: "u" | "v") => 1 | -1): { parts: Part[]; kind: string } {
  const long: "u" | "v" = f.w >= f.d ? "u" : "v";
  const L = long === "u" ? f.w : f.d, D = long === "u" ? f.d : f.w;
  // a part laid out as (along the long axis, along the short axis) → frame (lu, lv)
  const P = (a: number, s: number, y0: number, y1: number, sa: number, ss: number, mat: BuildingMaterial, round?: number): Part =>
    long === "u" ? { lu: a, lv: s, y0, y1, su: sa, sv: ss, mat, round } : { lu: s, lv: a, y0, y1, su: ss, sv: sa, mat, round };
  const short: "u" | "v" = long === "u" ? "v" : "u";

  if (/Church_Pew|ספסל/i.test(family)) {
    const sb = back(short), seatD = Math.min(45, D * 0.8);
    const seatC = -sb * (D / 2 - seatD / 2);
    return {
      kind: "pew",
      parts: [
        P(0, seatC, 37, 41, L - 8, seatD, "timber", 1), // the seat's board
        P(0, seatC + sb * 1, 41, 48, L - 12, seatD - 4, "pewCushion", 3), // its red foam cushion
        P(0, sb * (D / 2 - 2.5), 37, 96, L - 8, 5, "timber", 1.5), // the back's shell
        P(0, sb * (D / 2 - 7), 50, 90, L - 14, 4, "pewCushion", 2.5), // its red foam back cushion
        P(0, sb * (D / 2 - 8), 0, 37, L - 8, 2, "timber"), // the apron down to the floor
        P(-(L / 2 - 2.5), 0, 0, 98, 5, D, "walnut", 2), P(L / 2 - 2.5, 0, 0, 98, 5, D, "walnut", 2), // the ends
        P(-(L / 2 - 2.5), 0, 0, 6, 7, D + 2, "walnut", 1), P(L / 2 - 2.5, 0, 0, 6, 7, D + 2, "walnut", 1), // their plinths
        P(0, sb * (D / 2 + 1), 80, 96, L - 8, 4, "walnut", 1), // a shtender ledge on the back for the row behind
        P(0, sb * (D / 2 + 1), 64, 67, L - 8, 4, "walnut"), // the book shelf under it
      ],
    };
  }
  if (/ארון קודש/.test(family)) {
    const sb = back(short), H = 280;
    return {
      kind: "aron",
      parts: [
        P(0, 0, 0, 25, L, D, "stone"), // its stepped base
        P(0, sb * 4, 25, H - 30, L - 10, D - 8, "walnut"), // the ark
        P(0, -sb * (D / 2 - 2), 40, H - 50, (L - 10) * 0.82, 3, "velvet"), // the parochet before its doors
        P(0, -sb * (D / 2 - 0.2), 44, 52, (L - 10) * 0.8, 1, "upholsteryAccent"), // its embroidered hem
        P(0, -sb * (D / 2 - 0.2), H - 64, H - 58, (L - 10) * 0.8, 1, "upholsteryAccent"), // and its upper band
        P(0, -sb * (D / 2 - 0.2), (H - 10) / 2 - 5, (H - 10) / 2 + 40, Math.min(50, L * 0.2), 1, "upholsteryAccent"), // the crown on it
        P(0, -sb * (D / 2 - 1), H - 50, H - 40, (L - 10) * 0.9, 4, "metal"), // its rod
        P(0, 0, H - 30, H, L, D, "walnut"), // the crown
        P(0, -sb * (D / 2 - 3), H - 25, H - 5, L * 0.5, 4, "metal"), // the tablets' plate
      ],
    };
  }
  if (/בימה/.test(family)) {
    const parts: Part[] = [P(0, 0, 0, 20, L, D, "timber")];
    // its rail on four sides (open at the steps' end), posts at the corners, a lectern in the middle
    for (const s of [-1, 1]) parts.push(P(0, s * (D / 2 - 2), 20, 110, L, 4, "walnut"));
    parts.push(P(L / 2 - 2, 0, 20, 110, 4, D, "walnut"));
    for (const a of [-1, 1]) for (const s of [-1, 1]) parts.push(P(a * (L / 2 - 4), s * (D / 2 - 4), 0, 120, 8, 8, "walnut"));
    parts.push(P(0, 0, 20, 100, Math.min(150, L * 0.5), Math.min(70, D * 0.5), "walnut"));
    parts.push(P(0, 0, 100, 106, Math.min(160, L * 0.55), Math.min(80, D * 0.6), "upholstery"));
    return { kind: "bimah", parts };
  }
  if (/WC|Toilet|אסלה/i.test(family)) {
    // its depth runs from the wall: the long axis; the cistern hidden in the wall, a flush plate on it
    const lb = back(long);
    return {
      kind: "wc",
      parts: [
        P(lb * (L / 2 - 6), 0, 0, 100, 10, D, "ceramic"), // the installation's panel
        P(-lb * 6, 0, 25, 42, L - 14, D * 0.95, "ceramic", 12),
        P(-lb * 6, 0, 42, 45, L - 16, D * 0.9, "ceramic", 12), // the seat
        P(lb * (L / 2 - 11), 0, 95, 110, 2, 22, "metal"),
      ],
    };
  }
  if (/Urinal/i.test(family)) {
    const lb = back(short);
    return { kind: "urinal", parts: [P(0, lb * 2, 50, 110, Math.min(L, 38), D - 4, "ceramic", 8)] };
  }
  if (/Shower|מקלחת/i.test(family)) return { kind: "shower", parts: [P(0, 0, 0, 5, L, D, "ceramic")] };
  if (/כיורשיש|שיש/.test(family)) {
    const sb = back(short);
    const parts: Part[] = [P(0, 0, 82, 86, L, D, "stoneDark"), P(0, sb * (D / 2 - 1), 86, 96, L, 2, "stoneDark")];
    const n = Math.max(1, Math.round(L / 90));
    for (let k = 0; k < n; k++) {
      const a = -L / 2 + (L * (k + 0.5)) / n;
      parts.push(P(a, 0, 70, 86.5, 42, Math.min(32, D * 0.6), "ceramic", 6));
      parts.push(P(a, sb * (D / 2 - 6), 86, 108, 3, 3, "metal"), P(a, sb * (D / 2 - 12), 104, 108, 3, 14, "metal"));
    }
    return { kind: "vanity", parts };
  }
  if (/Sink|כיור|Lavatory/i.test(family)) {
    const sb = back(short);
    return { kind: "sink", parts: [P(0, 0, 68, 86, L, D, "ceramic", 6), P(0, sb * (D / 2 - 4), 86, 106, 3, 3, "metal")] };
  }
  if (/Grab|Rail/i.test(family)) return { kind: "rail", parts: [P(0, 0, 75, 80, L, Math.min(D, 6), "metal", 2)] };
  if (/Table|שולחן|Desk|WORKSTATION/i.test(family)) {
    const parts: Part[] = [P(0, 0, 72, 76, L, D, "timber")];
    for (const a of [-1, 1]) for (const s of [-1, 1]) parts.push(P(a * (L / 2 - 5), s * (D / 2 - 5), 0, 72, 5, 5, "metal"));
    return { kind: "table", parts };
  }
  if (/Chair|כסא|כיסא/i.test(family)) {
    const sb = back(short);
    const parts: Part[] = [P(0, 0, 42, 46, L * 0.95, D * 0.9, "upholstery", 2), P(0, sb * (D / 2 - 3), 46, 88, L * 0.9, 4, "timber", 1)];
    for (const a of [-1, 1]) for (const s of [-1, 1]) parts.push(P(a * (L / 2 - 4), s * (D / 2 - 4), 0, 42, 3, 3, "metal"));
    return { kind: "chair", parts };
  }
  if (/^ארון ספרים/.test(family)) {
    // open shelves of sefarim: a walnut carcass, a shelf every 36 cm, rows of books in the dark bindings a beit midrash keeps
    const sb = back(short), H = 220, t = 2.5;
    const parts: Part[] = [
      P(0, 0, 0, 8, L - 4, D - 4, "slab"),
      P(0, sb * (D / 2 - 1), 8, H, L, 2, "walnut"), // the back
      P(-(L / 2 - t / 2), 0, 0, H, t, D, "walnut"), P(L / 2 - t / 2, 0, 0, H, t, D, "walnut"), // the sides
      P(0, 0, H - 3, H, L, D + 1, "walnut", 1), // the top
    ];
    const bays = Math.max(1, Math.round(L / 90));
    for (let k = 1; k < bays; k++) parts.push(P(-L / 2 + (L * k) / bays, 0, 8, H - 3, 2, D - 2, "walnut"));
    const BIND: BuildingMaterial[] = ["velvet", "darkSteel", "walnut", "upholstery", "velvet", "darkSteel"];
    let seed = Math.round(L * 7 + D * 13);
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let y = 8; y + 30 <= H - 3; y += 36) {
      parts.push(P(0, 0, y, y + 2, L - 2 * t, D - 2, "walnut")); // the shelf
      for (let k = 0; k < bays; k++) {
        const a0 = -L / 2 + (L * k) / bays + t + 1, a1 = -L / 2 + (L * (k + 1)) / bays - t - 1;
        for (let a = a0; a < a1 - 2; ) {
          const w = Math.min(a1 - a, 3 + rnd() * 4), h = 22 + rnd() * 9;
          if (rnd() > 0.06) parts.push(P(a + w / 2, sb * 2, y + 2, y + 2 + h, w - 0.3, Math.min(D - 6, 22), BIND[Math.floor(rnd() * BIND.length)]!));
          a += w;
        }
      }
    }
    return { kind: "bookcase", parts };
  }
  if (/Closet|Wardrobe|ארון|Shelf|ספרי|Book/i.test(family)) {
    const sb = back(short), H = 220;
    const parts: Part[] = [P(0, 0, 0, 10, L - 4, D - 6, "slab"), P(0, 0, 10, H, L, D, "walnut")];
    const n = Math.max(1, Math.round(L / 50));
    for (let k = 1; k < n; k++) parts.push(P(-L / 2 + (L * k) / n, -sb * (D / 2 + 0.3), 12, H - 4, 0.6, 0.8, "frame"));
    for (let k = 0; k < n; k++) parts.push(P(-L / 2 + (L * (k + 0.5)) / n + 18, -sb * (D / 2 + 1), 95, 125, 1.5, 2, "metal"));
    return { kind: "closet", parts };
  }
  if (/Bed/i.test(family)) return { kind: "bed", parts: [P(0, 0, 0, 30, L, D, "timber"), P(0, 0, 30, 50, L - 4, D - 4, "upholstery", 4)] };
  if (/Bath/i.test(family)) return { kind: "bath", parts: [P(0, 0, 0, 55, L, D, "ceramic", 4)] };
  if (/Washer/i.test(family)) return { kind: "washer", parts: [P(0, 0, 0, 85, L, D, "ceramic", 2)] };
  if (/Pulpit|Podium|עמוד/i.test(family)) {
    const sb = back(short);
    return { kind: "amud", parts: [P(0, 0, 0, 105, L, D, "walnut"), P(0, -sb * 2, 105, 112, L + 4, D + 4, "walnut"), P(0, -sb * (D / 2 + 1), 30, 95, L * 0.7, 2, "upholstery")] };
  }
  if (/Drain Pipe|צינורות|Koltan/i.test(family)) return { kind: "pipe", parts: [P(0, 0, 0, 408, Math.min(L, 16), Math.min(D, 16), "plaster")] };
  if (/Floor_Drain|ניקוז|נכים/i.test(family)) return { kind: "flat", parts: [P(0, 0, 0, 1, L, D, "metal")] };
  if (/SANT/.test(layer)) return { kind: "sant", parts: [P(0, 0, 0, 80, L, D, "ceramic", 4)] };
  return { kind: "box", parts: [P(0, 0, 0, 75, L, D, "timber")] };
}
