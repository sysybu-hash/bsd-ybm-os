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
  const baseH = h * 0.6;
  const parts: PiecePart[] = [
    part("base", "timber", { x: offsetX, y: baseH / 2, z: offsetZ, w: mattressW, h: baseH, d: mattressD }),
    part("mattress", "linen", {
      x: offsetX,
      y: baseH + (h - baseH) / 2,
      z: offsetZ,
      w: mattressW * 0.98,
      h: h - baseH,
      d: mattressD * 0.99,
    }),
    part("headboard", "timber", {
      x: offsetX,
      y: h * 0.75,
      z: offsetZ - mattressD / 2 + 0.03,
      w: mattressW,
      h: h * 1.5,
      d: 0.06,
    }),
  ];
  const pillows = !spec.haredi && mattressW >= DOUBLE_BED_MIN_M ? 2 : 1;
  const pillowW = Math.min(0.5, (mattressW / pillows) * 0.8);
  for (let i = 0; i < pillows; i++) {
    const spread = pillows === 1 ? 0 : (i - 0.5) * (mattressW / 2);
    parts.push(
      part("pillow", "linen", {
        x: offsetX + spread,
        y: h + 0.04,
        z: offsetZ - mattressD / 2 + 0.22,
        w: pillowW,
        h: 0.09,
        d: 0.34,
      }),
    );
  }
  parts.push(
    part("duvet", "linen", {
      x: offsetX,
      y: h + 0.02,
      z: offsetZ + mattressD * 0.12,
      w: mattressW * 0.98,
      h: 0.05,
      d: mattressD * 0.62,
    }),
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

/** A seat: pad, a back on the side away from what it faces, four legs. */
export function seat(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const padH = 0.06;
  const legW = Math.min(0.04, w * 0.12);
  const parts = [
    part("pad", "upholstery", { x: 0, y: h - padH / 2, z: 0, w, h: padH, d }),
    part("back", "upholstery", { x: 0, y: h + 0.2, z: -d / 2 + 0.03, w, h: 0.4, d: 0.05 }),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        part("leg", "timber", {
          x: sx * (w / 2 - legW),
          y: (h - padH) / 2,
          z: sz * (d / 2 - legW),
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

/** A bath or a basin, told apart the way the oblique plate tells them apart. */
export function fixture(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  if (fixtureKind(w, d) === "bath") {
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
