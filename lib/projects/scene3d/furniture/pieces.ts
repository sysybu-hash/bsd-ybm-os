import { fixtureKind } from "@/lib/projects/scene3d/furniture/fixture-kind";
import { facingBox, part, type PiecePart, type PieceSpec } from "@/lib/projects/scene3d/furniture/types";
import {
  DOUBLE_BED_MIN_M,
  TWIN_MATTRESS_L_M,
  TWIN_MATTRESS_W_M,
  WARDROBE_DOOR_W_M,
} from "@/lib/projects/scene3d/standards";

/**
 * Every piece, built from the box that was measured.
 *
 * Each constructor is written as though the piece faces north — its back to
 * the top of the page — and the caller rotates. Nothing here reads anything
 * about this apartment except the box it is given and the rules it is told.
 */

/**
 * A bed: base, mattress, headboard at the back, pillows and a folded duvet.
 *
 * The modesty rule is applied here and nowhere else, because this is the only
 * place that can obey it: a drawn double rectangle is a sleeping zone, and
 * what stands in it is one 0.90 by 2.00 mattress along the long wall, with one
 * pillow and one headboard. The image model was given three paragraphs of
 * prompt about this and still drew a double in four of five reference sheets.
 * Here a double cannot be constructed.
 */
export function bed(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const mattressW = spec.haredi ? Math.min(TWIN_MATTRESS_W_M, w) : w;
  const mattressD = spec.haredi ? Math.min(TWIN_MATTRESS_L_M, d) : d;
  // A twin stands along the long wall, at the edge its headboard is against.
  const offsetX = spec.haredi ? -(w - mattressW) / 2 : 0;
  const offsetZ = spec.haredi ? -(d - mattressD) / 2 : 0;
  const baseH = h * 0.55;
  const mattressH = h - baseH;
  const back = offsetZ - mattressD / 2;
  const parts: PiecePart[] = [
    part("base", "timber", { x: offsetX, y: baseH / 2, z: offsetZ, w: mattressW, h: baseH, d: mattressD }, 0.01),
    part("mattress", "linen", { x: offsetX, y: baseH + mattressH / 2, z: offsetZ + 0.03, w: mattressW * 0.98, h: mattressH, d: mattressD - 0.08 }, 0.05),
    // An upholstered headboard, padded, standing behind the mattress.
    part("headboard", "upholstery", { x: offsetX, y: h * 1.05, z: back + 0.04, w: mattressW, h: h * 2.1, d: 0.08 }, 0.035),
  ];
  const pillows = !spec.haredi && mattressW >= DOUBLE_BED_MIN_M ? 2 : 1;
  const pillowW = Math.min(0.62, (mattressW / pillows) * 0.82);
  const pillowD = Math.min(0.36, mattressD * 0.3);
  for (let i = 0; i < pillows; i++) {
    const spread = pillows === 1 ? 0 : (i - 0.5) * (mattressW / 2);
    parts.push(part("pillow", "linen", { x: offsetX + spread, y: h + 0.06, z: back + 0.1 + pillowD / 2, w: pillowW, h: 0.12, d: pillowD }, 0.055));
  }
  // The duvet over the lower two-thirds, its top edge turned down.
  const duvetD = mattressD * 0.66;
  const duvetZ = offsetZ + mattressD / 2 - duvetD / 2 - 0.02;
  parts.push(
    part("duvet", "upholstery", { x: offsetX, y: h + 0.03, z: duvetZ, w: mattressW, h: 0.07, d: duvetD }, 0.03),
    part("fold", "linen", { x: offsetX, y: h + 0.075, z: duvetZ - duvetD / 2 + 0.12, w: mattressW * 0.99, h: 0.03, d: 0.22 }, 0.014),
  );
  return parts;
}

/** A table: top, apron and four legs, inset so the legs read as legs. */
export function table(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const topH = 0.04;
  const legW = Math.min(0.07, w * 0.12, d * 0.12);
  const inset = Math.min(0.09, w * 0.15, d * 0.15);
  const parts = [
    part("top", "timber", { x: 0, y: h - topH / 2, z: 0, w, h: topH, d }),
    part("apron", "timber", {
      x: 0,
      y: h - topH - 0.03,
      z: 0,
      w: w - inset,
      h: 0.06,
      d: d - inset,
    }),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        part("leg", "timber", {
          x: sx * (w / 2 - inset / 2 - legW / 2),
          y: (h - topH) / 2,
          z: sz * (d / 2 - inset / 2 - legW / 2),
          w: legW,
          h: h - topH,
          d: legW,
        }),
      );
    }
  }
  return parts;
}

/** A desk: slab, four legs, and a modesty panel across the back. */
export function desk(spec: PieceSpec): PiecePart[] {
  const parts = table(spec).filter((p) => p.tag !== "apron");
  const { w, d, h } = facingBox(spec);
  parts.push(
    part("panel", "timber", { x: 0, y: h * 0.55, z: -d / 2 + 0.05, w: w * 0.9, h: h * 0.55, d: 0.03 }),
  );
  return parts;
}

/**
 * A sofa: a plinth, a seat cushion and a back cushion a place, padded arms.
 * Built as a sofa is upholstered — דירה 16's two-seaters, one box each, read
 * from above as a board.
 */
function sofa(w: number, d: number, h: number): PiecePart[] {
  const armW = Math.min(0.18, w * 0.1);
  const backD = Math.min(0.22, d * 0.26);
  const plinthH = Math.max(0.12, h - 0.2);
  const seats = Math.max(1, Math.round((w - 2 * armW) / 0.7));
  const seatW = (w - 2 * armW) / seats;
  const seatD = d - backD - 0.02;
  const parts: PiecePart[] = [
    part("base", "upholstery", { x: 0, y: plinthH / 2, z: 0, w, h: plinthH, d }, 0.03),
    part("back", "upholstery", { x: 0, y: (h + 0.32) / 2, z: -d / 2 + backD / 2, w, h: h + 0.32, d: backD }, 0.05),
  ];
  for (const sx of [-1, 1]) {
    parts.push(part("arm", "upholstery", { x: sx * (w / 2 - armW / 2), y: (h + 0.16) / 2, z: 0, w: armW, h: h + 0.16, d }, 0.06));
  }
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + armW + seatW * (i + 0.5);
    parts.push(
      part("seat", "upholstery", { x, y: plinthH + (h - plinthH) / 2, z: d / 2 - seatD / 2, w: seatW - 0.015, h: h - plinthH, d: seatD }, 0.06),
      part("cushion", "linen", { x, y: h + 0.2, z: -d / 2 + backD + 0.09, w: seatW - 0.05, h: 0.38, d: 0.16 }, 0.07),
    );
  }
  return parts;
}

/** A seat: padded pad, a back on the side away from what it faces, four legs. */
export function seat(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  if (w > 1.0) return sofa(w, d, h);
  // An armchair: a sofa of one place.
  if (w > 0.7 && d > 0.7) return sofa(w, d, h);
  const padH = 0.07;
  const legW = Math.min(0.035, w * 0.1);
  const parts = [
    part("pad", "upholstery", { x: 0, y: h - padH / 2, z: 0.01, w: w * 0.96, h: padH, d: d * 0.94 }, 0.025),
    part("back", "upholstery", { x: 0, y: h + 0.22, z: -d / 2 + 0.035, w: w * 0.92, h: 0.42, d: 0.06 }, 0.025),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        part("leg", "timber", {
          x: sx * (w / 2 - legW * 1.5),
          y: (h - padH) / 2,
          z: sz * (d / 2 - legW * 1.5),
          w: legW,
          h: h - padH,
          d: legW,
        }),
      );
    }
  }
  return parts;
}

/** A wardrobe: carcass, one door per 0.60 of measured width, a handle each. */
export function storage(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const doors = Math.max(1, Math.ceil(w / WARDROBE_DOOR_W_M));
  const doorW = w / doors;
  const parts = [part("carcass", "timber", { x: 0, y: h / 2, z: 0, w, h, d })];
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + doorW * (i + 0.5);
    parts.push(
      part("door", "joinery", {
        x,
        y: h / 2,
        z: d / 2 - 0.01,
        w: doorW - 0.006,
        h: h - 0.02,
        d: 0.02,
      }),
      part("handle", "metal", {
        x: x + doorW / 2 - 0.05,
        y: h * 0.52,
        z: d / 2 + 0.005,
        w: 0.015,
        h: Math.min(0.3, h * 0.25),
        d: 0.015,
      }),
    );
  }
  return parts;
}

/** A kitchen run: toe kick, carcass, worktop, and a reveal per 0.60. */
export function counter(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const topH = 0.04;
  const kickH = 0.1;
  const parts = [
    part("kick", "joinery", { x: 0, y: kickH / 2, z: 0.05, w, h: kickH, d: Math.max(0.05, d - 0.1) }),
    part("carcass", "joinery", { x: 0, y: kickH + (h - kickH - topH) / 2, z: 0, w, h: h - kickH - topH, d }),
    part("worktop", "worktop", { x: 0, y: h - topH / 2, z: 0, w, h: topH, d }),
  ];
  const drawers = Math.max(1, Math.round(w / 0.6));
  for (let i = 1; i < drawers; i++) {
    parts.push(
      part("reveal", "worktop", {
        x: -w / 2 + (w / drawers) * i,
        y: kickH + (h - kickH - topH) / 2,
        z: d / 2 - 0.004,
        w: 0.006,
        h: h - kickH - topH,
        d: 0.01,
      }),
    );
  }
  return parts;
}

/** A hob: a plate flush with the worktop and four rings on the plate's grid. */
export function hob(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const parts = [part("plate", "steel", { x: 0, y: h - 0.01, z: 0, w, h: 0.02, d })];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        part("ring", "steel", {
          x: sx * w * 0.22,
          y: h + 0.008,
          z: sz * d * 0.22,
          w: Math.min(0.18, w * 0.3),
          h: 0.016,
          d: Math.min(0.18, d * 0.3),
        }),
      );
    }
  }
  return parts;
}

/** A sink: rim, a basin sunk into it, and a tap at the back edge. */
export function sink(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const rimH = 0.02;
  return [
    part("rim", "steel", { x: 0, y: h - rimH / 2, z: 0, w, h: rimH, d }),
    part("basin", "steel", {
      x: 0,
      y: h - rimH - 0.08,
      z: 0.02,
      w: Math.max(0.1, w - 0.12),
      h: 0.16,
      d: Math.max(0.1, d - 0.12),
    }),
    part("tap", "metal", { x: 0, y: h + 0.12, z: -d / 2 + 0.06, w: 0.04, h: 0.24, d: 0.04 }),
    part("spout", "metal", { x: 0, y: h + 0.22, z: -d / 2 + 0.16, w: 0.03, h: 0.03, d: Math.min(0.2, d) }),
  ];
}

/**
 * A sanitary fixture. Where the reading says which, it is built as that; where
 * it does not — a sales sheet's reading — a bath and a basin are told apart
 * the way the oblique plate tells them apart.
 */
export function fixture(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  if (spec.fixture === "toilet") return toilet(w, d);
  if (spec.fixture === "shower") return shower(w, d);
  if (spec.fixture === "basin" && Math.max(w, d) >= 0.5) return vanity(w, d);
  if (spec.fixture === "bath" || (!spec.fixture && fixtureKind(w, d) === "bath")) {
    return [
      part("tub", "ceramic", { x: 0, y: h / 2, z: 0, w, h, d }),
      part("water", "ceramic", {
        x: 0,
        y: h - 0.03,
        z: 0,
        w: Math.max(0.1, w - 0.12),
        h: 0.02,
        d: Math.max(0.1, d - 0.12),
      }),
      part("tap", "metal", { x: 0, y: h + 0.08, z: -d / 2 + 0.06, w: 0.04, h: 0.16, d: 0.04 }),
    ];
  }
  return [
    part("pedestal", "ceramic", { x: 0, y: h * 0.4, z: 0, w: w * 0.45, h: h * 0.8, d: d * 0.45 }),
    part("bowl", "ceramic", { x: 0, y: h - 0.06, z: 0, w, h: 0.12, d }),
    part("tap", "metal", { x: 0, y: h + 0.06, z: -d / 2 + 0.05, w: 0.035, h: 0.12, d: 0.035 }),
  ];
}

/** A pan against the wall: the cistern behind, the bowl and its seat before it. */
function toilet(w: number, d: number): PiecePart[] {
  const cisternD = Math.min(0.16, d * 0.3);
  const bowlD = d - cisternD;
  return [
    part("cistern", "ceramic", { x: 0, y: 0.38, z: -d / 2 + cisternD / 2, w: w * 0.95, h: 0.76, d: cisternD }),
    part("bowl", "ceramic", { x: 0, y: 0.19, z: -d / 2 + cisternD + bowlD / 2, w: w * 0.8, h: 0.38, d: bowlD }),
    part("seat", "ceramic", { x: 0, y: 0.395, z: -d / 2 + cisternD + bowlD / 2, w: w * 0.9, h: 0.03, d: bowlD * 0.95 }),
  ];
}

/** A shower: the tray, a glass screen along its open front, the riser at the back. */
function shower(w: number, d: number): PiecePart[] {
  return [
    part("tray", "ceramic", { x: 0, y: 0.03, z: 0, w, h: 0.06, d }),
    part("screen", "glass", { x: 0, y: 1.03, z: d / 2 - 0.005, w, h: 1.94, d: 0.01 }),
    part("riser", "metal", { x: 0, y: 1.05, z: -d / 2 + 0.03, w: 0.03, h: 1.9, d: 0.03 }),
  ];
}

/** A basin on its vanity: the cabinet, the top, the bowl sunk in it and the tap. */
function vanity(w: number, d: number): PiecePart[] {
  const top = 0.85;
  return [
    part("cabinet", "joinery", { x: 0, y: (top - 0.04 + 0.15) / 2, z: 0, w, h: top - 0.04 - 0.15, d: d * 0.95 }),
    part("top", "worktop", { x: 0, y: top - 0.02, z: 0, w, h: 0.04, d }),
    part("bowl", "ceramic", { x: 0, y: top + 0.04, z: 0.02, w: Math.min(w - 0.08, 0.5), h: 0.08, d: Math.min(d - 0.12, 0.38) }),
    part("tap", "metal", { x: 0, y: top + 0.1, z: -d / 2 + 0.05, w: 0.035, h: 0.2, d: 0.035 }),
  ];
}

/**
 * A block the measurement could not name.
 *
 * Deliberately dull: a plain neutral box. A piece that is not identified must
 * never read as a specific wrong object — it is how a row of beds came back as
 * a bathtub, and the oblique plate carries the same warning in its palette.
 */
export function unknown(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  return [part("block", "neutral", { x: 0, y: h / 2, z: 0, w, h, d })];
}
