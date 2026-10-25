import { fixtureKind } from "@/lib/projects/scene3d/furniture/fixture-kind";
import { cushion, ellipse, hollow, pillow, rrect, shell, slab, taperedLeg, tube, turned } from "@/lib/projects/scene3d/furniture/forms";
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
    // A frame with a shadow gap under it, on short feet: the base is set in from the mattress's edge.
    slab("base", "timber", { x: offsetX, y: 0.06 + (baseH - 0.06) / 2, z: offsetZ, w: mattressW, h: baseH - 0.06, d: mattressD }, 0.035, 0.012),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg("foot", "timber", { x: offsetX + sx * (mattressW / 2 - 0.08), z: offsetZ + sz * (mattressD / 2 - 0.08), h: 0.06 }, 0.025, 0.018))),
    cushion("mattress", "linen", { x: offsetX, y: baseH + mattressH / 2, z: offsetZ + 0.01, w: mattressW, h: mattressH, d: mattressD - 0.04 }, { corner: 0.07 }),
    // A timber headboard, raked back a touch, with a bevelled top: not a board stood on its edge.
    { ...slab("headboard", "timber", { x: offsetX, y: h * 1.05, z: back + 0.05, w: mattressW, h: h * 2.1, d: 0.08 }, 0.03, 0.012), shape: { kind: "extrude" as const, outline: rrect(mattressW, 0.08, 0.03, 6), bevel: 0.012 } },
  ];
  const pillows = !spec.haredi && mattressW >= DOUBLE_BED_MIN_M ? 2 : 1;
  const pillowW = Math.min(0.62, (mattressW / pillows) * 0.82);
  const pillowD = Math.min(0.36, mattressD * 0.3);
  for (let i = 0; i < pillows; i++) {
    const spread = pillows === 1 ? 0 : (i - 0.5) * (mattressW / 2);
    // Pillows lean on the headboard and are plump in the middle.
    parts.push(pillow("pillow", "linen", { x: offsetX + spread, y: h + 0.085, z: back + 0.12 + pillowD / 2, w: pillowW, h: 0.17, d: pillowD }, -0.16));
  }
  // The duvet over the lower two-thirds, as a soft loft that droops over the mattress's sides; its top edge turned down.
  const duvetD = mattressD * 0.66;
  const duvetZ = offsetZ + mattressD / 2 - duvetD / 2 - 0.02;
  parts.push(
    cushion("duvet", "linen", { x: offsetX, y: h + 0.04, z: duvetZ, w: mattressW, h: 0.1, d: duvetD }, { corner: 0.08 }),
    cushion("fold", "linen", { x: offsetX, y: h + 0.1, z: duvetZ - duvetD / 2 + 0.14, w: mattressW * 0.99, h: 0.05, d: 0.26 }, { corner: 0.05 }),
    // A throw across the foot, the one colour on the bed.
    cushion("throw", "upholstery", { x: offsetX, y: h + 0.105, z: offsetZ + mattressD / 2 - Math.min(0.5, mattressD * 0.25) / 2 - 0.04, w: mattressW * 0.99, h: 0.035, d: Math.min(0.5, mattressD * 0.25) }, { corner: 0.04 }),
  );
  return parts;
}

/** A table: top, apron and four legs, inset so the legs read as legs. */
export function table(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const topH = 0.04;
  const legR = Math.min(0.04, w * 0.07, d * 0.07);
  const inset = Math.min(0.1, w * 0.15, d * 0.15);
  const parts = [
    slab("top", "timber", { x: 0, y: h - topH / 2, z: 0, w, h: topH, d }, Math.min(0.08, d * 0.25), 0.012),
    part("apron", "timber", { x: 0, y: h - topH - 0.03, z: 0, w: w - inset - 0.02, h: 0.06, d: d - inset - 0.02 }, 0.01),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(taperedLeg("leg", "timber", { x: sx * (w / 2 - inset / 2 - legR), z: sz * (d / 2 - inset / 2 - legR), h: h - topH }, legR, legR * 0.62));
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
  const armW = Math.min(0.2, w * 0.11);
  const backD = Math.min(0.24, d * 0.28);
  const plinthH = Math.max(0.12, h - 0.2);
  const seats = Math.max(1, Math.round((w - 2 * armW) / 0.7));
  const seatW = (w - 2 * armW) / seats;
  const seatD = d - backD - 0.02;
  const parts: PiecePart[] = [
    // A plinth set in from the edge: the sofa stands on a shadow, not on the floor.
    slab("base", "upholstery", { x: 0, y: 0.05 + (plinthH - 0.05) / 2, z: 0, w: w * 0.98, h: plinthH - 0.05, d: d * 0.98 }, 0.07, 0.03),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => taperedLeg("foot", "timber", { x: sx * (w / 2 - 0.1), z: sz * (d / 2 - 0.1), h: 0.05 }, 0.025, 0.016))),
    // The back: tall, soft, raked a few degrees back.
    { ...cushion("back", "upholstery", { x: 0, y: (h + 0.32) / 2 + 0.02, z: -d / 2 + backD / 2 + 0.01, w, h: h + 0.28, d: backD }, { corner: 0.1 }), tiltX: -0.09 },
  ];
  for (const sx of [-1, 1]) {
    // Arms: rolled, wider at the top than the foot.
    parts.push(cushion("arm", "upholstery", { x: sx * (w / 2 - armW / 2), y: (h + 0.14) / 2, z: 0.01, w: armW, h: h + 0.14, d: d * 0.99 }, { corner: armW * 0.45 }));
  }
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + armW + seatW * (i + 0.5);
    parts.push(
      cushion("seat", "upholstery", { x, y: plinthH + (h - plinthH) / 2 + 0.01, z: d / 2 - seatD / 2, w: seatW - 0.02, h: h - plinthH + 0.03, d: seatD }, { corner: 0.08 }),
      // A scatter cushion leaning on the back, in the sofa's woven fabric, set a little askew.
      { ...cushion("cushion", "upholstery", { x: x + (i % 2 ? 0.05 : -0.05), y: h + 0.17, z: -d / 2 + backD + 0.12, w: Math.min(seatW - 0.08, 0.5), h: 0.2, d: 0.42 }, { corner: 0.1 }), tiltX: -0.95, rotY: i % 2 ? 0.12 : -0.1 },
    );
  }
  return parts;
}

/** A seat: padded pad, a back on the side away from what it faces, four legs. */
export function seat(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  if (w > 1.0) return sofa(w, d, h);
  // An armchair: a sofa of one place. דירה 14's is 77 × 67 cm.
  if (w > 0.7 && d > 0.6) return sofa(w, d, h);
  const padH = 0.06;
  const legR = Math.min(0.022, w * 0.06);
  const parts: PiecePart[] = [
    // A seat pan dished a little, upholstered, its corners soft.
    cushion("pad", "upholstery", { x: 0, y: h - padH / 2, z: 0.015, w: w * 0.96, h: padH + 0.02, d: d * 0.92 }, { corner: 0.07 }),
    // The back rest: a curved slat, raked back, rounded like a hand-made dining chair.
    { ...cushion("back", "upholstery", { x: 0, y: h + 0.23, z: -d / 2 + 0.05, w: w * 0.9, h: 0.4, d: 0.05 }, { corner: 0.03 }), tiltX: -0.12 },
  ];
  // Back uprights and the four legs: round, tapering to the foot, the rear pair running up to carry the back.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rear = sz < 0;
      parts.push(taperedLeg("leg", "timber", { x: sx * (w / 2 - legR * 2.2), z: sz * (d / 2 - legR * 2.2), h: rear ? h + 0.42 : h - padH }, legR, legR * 0.65));
    }
  }
  return parts;
}

/** A wardrobe: carcass, one door per 0.60 of measured width, a handle each. */
export function storage(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const doors = Math.max(1, Math.ceil(w / WARDROBE_DOOR_W_M));
  const doorW = w / doors;
  const parts = [
    slab("carcass", "timber", { x: 0, y: h / 2, z: 0, w, h, d }, 0.012, 0.008),
  ];
  const hh = Math.min(0.15, h * 0.125);
  for (let i = 0; i < doors; i++) {
    const x = -w / 2 + doorW * (i + 0.5);
    parts.push(
      // A flat door with an eased edge, proud of the carcass by a hair.
      slab("door", "joinery", { x, y: h / 2, z: d / 2 - 0.008, w: doorW - 0.006, h: h - 0.03, d: 0.024 }, 0.006, 0.004),
      // A slim bar handle, its ends turned back to the door, on the door's free edge.
      tube("handle", "metal", { x: x + doorW / 2 - 0.05, y: h * 0.52, z: d / 2 + 0.01, w: 0.02, h: 2 * hh, d: 0.02 }, [[0, -hh, -0.004], [0, -hh, 0.004], [0, hh, 0.004], [0, hh, -0.004]], 0.005),
    );
  }
  return parts;
}

/** A kitchen run: toe kick, carcass, worktop, and a reveal per 0.60. */
export function counter(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const topH = 0.04;
  const kickH = 0.1;
  const holes = (spec.holes ?? []).map((q) => rrect(q.w, q.d, 0.04, 5).map(([x, z]) => [x + q.x, z + q.z] as [number, number]));
  // A stone top with a softly eased edge, and the openings its sinks sit in; the carcass below is open there too, so the bowl has depth to go down into.
  const cut = (p: PiecePart, outline: Array<[number, number]>, bevel: number): PiecePart =>
    holes.length ? { ...p, shape: { kind: "extrude" as const, outline, bevel, holes } } : p;
  const parts = [
    part("kick", "skirting", { x: 0, y: kickH / 2, z: 0.05, w: w * 0.99, h: kickH, d: Math.max(0.05, d - 0.1) }),
    cut(part("carcass", "joinery", { x: 0, y: kickH + (h - kickH - topH) / 2, z: 0, w, h: h - kickH - topH, d }, 0.004), rrect(w, d, 0.004, 3), 0.002),
    cut(slab("worktop", "worktop", { x: 0, y: h - topH / 2, z: 0, w, h: topH, d }, 0.012, 0.01), rrect(w, d, 0.012, 6), 0.01),
  ];
  const drawers = Math.max(1, Math.round(w / 0.6));
  for (let i = 1; i < drawers; i++) {
    parts.push(
      part("reveal", "worktop", { x: -w / 2 + (w / drawers) * i, y: kickH + (h - kickH - topH) / 2, z: d / 2 - 0.004, w: 0.006, h: h - kickH - topH, d: 0.01 }),
    );
  }
  // A finger-pull groove under the top: the handleless kitchen's one detail.
  parts.push(part("pull", "steel", { x: 0, y: h - topH - 0.02, z: d / 2 - 0.002, w: w * 0.97, h: 0.014, d: 0.01 }));
  return parts;
}

/** A hob: a plate flush with the worktop and four rings on the plate's grid. */
export function hob(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const parts = [slab("plate", "steel", { x: 0, y: h - 0.01, z: 0, w, h: 0.02, d }, 0.02, 0.004)];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const r = Math.min(0.09, w * 0.15, d * 0.15);
      // A burner: a cap on a crown, turned; the ring a lathe, not a flat square.
      parts.push(turned("ring", "steel", { x: sx * w * 0.22, y: h + 0.017, z: sz * d * 0.22 }, r, 0.034, [[0, -0.017], [r * 0.9, -0.017], [r * 0.9, -0.004], [r * 0.55, 0.004], [r * 0.5, 0.017], [0, 0.017]]));
    }
  }
  return parts;
}

/** A sink: bowls sunk into the worktop (the counter's top is open where they go), a drain in each floor, a gooseneck tap. */
export function sink(spec: PieceSpec): PiecePart[] {
  const { w, d, h } = facingBox(spec);
  const openW = Math.max(0.1, w - 0.06);
  const openD = Math.max(0.1, d - 0.08);
  const bowls = spec.double ? 2 : 1;
  const gap = spec.double ? 0.04 : 0;
  const bowlW = (openW - gap * (bowls - 1)) / bowls;
  const parts: PiecePart[] = [
    // One rim for every bowl, inset from the drawn box so a single sink reads narrower than its outline.
    part("rim", "steel", { x: 0, y: h + 0.008, z: 0.02, w: openW, h: 0.012, d: openD }),
  ];
  for (let i = 0; i < bowls; i++) {
    const x = -openW / 2 + bowlW / 2 + i * (bowlW + gap);
    parts.push(
      // The lip lies on the worktop; the walls go down 18 cm to a floor with its drain.
      hollow("basin", "steel", { x, z: 0.02, top: h + 0.004 }, { w: bowlW + 0.04, d: openD + 0.04 }, { w: bowlW, d: openD }, 0.18, 0.04),
      turned("drain", "steel", { x, y: h - 0.17, z: 0.02 }, 0.03, 0.01, [[0, -0.005], [0.03, -0.005], [0.03, 0.005], [0, 0.005]]),
    );
  }
  if (spec.double) parts.push(part("divider", "steel", { x: 0, y: h + 0.004, z: 0.02, w: gap + 0.02, h: 0.008, d: openD + 0.04 }));
  parts.push(
    tube("tap", "metal", { x: 0, y: h + 0.15, z: -d / 2 + 0.14, w: 0.04, h: 0.3, d: 0.3 }, [[0, -0.15, -0.1], [0, 0.05, -0.1], [0, 0.14, -0.06], [0, 0.14, 0.04], [0, 0.04, 0.1]], 0.012),
  );
  return parts;
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
  // A washing machine: a white box with its round door on top, as a sheet
  // draws it — a square with a drum. 21's, unnamed, was built as a basin.
  if (spec.fixture === "washer") {
    // An appliance from above: a white top, a dark control strip with its dial
    // along the back, a pale steel drum lid. A plain white box with a grey
    // square was painted as a toilet (13/10/2026), and a dark round door in a
    // white square as a toilet's bowl (15/10/2026).
    const drum = Math.min(w, d - 0.14) * 0.62;
    return [
      part("washer", "ceramic", { x: 0, y: 0.425, z: 0, w, h: 0.85, d }, 0.02),
      part("plate", "metal", { x: 0, y: 0.856, z: -d / 2 + 0.07, w: w * 0.92, h: 0.012, d: 0.11 }),
      part("dial", "metal", { x: w * 0.24, y: 0.866, z: -d / 2 + 0.07, w: 0.06, h: 0.014, d: 0.06 }, 0.03),
      part("drum", "metal", { x: 0, y: 0.858, z: 0.06, w: drum, h: 0.012, d: drum }, drum / 2),
    ];
  }
  if (spec.fixture === "basin" && Math.max(w, d) >= 0.5) return vanity(w, d);
  // A bath is long as well as narrow: a pan with the room's dimension written
  // in it measured 60 by 100 and was built as a third bath in 17.
  if (spec.fixture === "bath" || (!spec.fixture && fixtureKind(w, d) === "bath" && Math.max(w, d) >= 1.2)) {
    // A tub, not a block: a rim round a basin sunk nearly to the floor. Built
    // solid with a plate on top, from above it read as a white box, and the
    // designs drew a cabinet there.
    const rim = Math.min(0.08, Math.min(w, d) * 0.12);
    return [
      // The tub: an outer shell with softly rounded corners and a dark well dropped into it, a tap on its end.
      // The tub: a hollow shell, rim round an opening, walls going down to a floor a hand above the bottom: a bath with a bather's depth in it.
      shell("tub", "ceramic", { x: 0, y0: 0, z: 0, w, h, d }, rim, Math.min(w, d) * 0.35, 0.12),
      tube("tap", "metal", { x: 0, y: h + 0.1, z: -d / 2 + rim / 2, w: 0.04, h: 0.2, d: 0.04 + rim - 0.004 }, [[0, -0.1, -(0.02 + rim / 2 - 0.016)], [0, 0.04, -(0.02 + rim / 2 - 0.016)], [0, 0.1, -(0.02 + rim / 2 - 0.016) + 0.02], [0, 0.1, 0.02 + rim / 2 - 0.016]], 0.012),
    ];
  }
  // Unnamed and not a bath: a pan runs out from its wall, a basin along it.
  // A sales sheet draws both as curves, with no name; every one was built as
  // a basin, and דירה 14's two bathrooms had no WC. A square is neither —
  // its 57 cm washer is one — and stays the plain block it was.
  // And a pan is at most 60 cm across: an 80 cm "pan" was a level mark's
  // hatched circle on 18's roof.
  // Its bowl is often all that is drawn closed (22's: 34 by 27, the cistern a
  // pair of loose lines), so a pan is built at a pan's size round it.
  if (!spec.fixture && d >= w * 1.05 && d >= 0.3 && w <= 0.6 && d <= 0.85) return toilet(Math.max(w, 0.38), Math.max(d, 0.6));
  return [
    turned("pedestal", "ceramic", { x: 0, y: h * 0.4, z: 0 }, Math.min(w, d) * 0.24, h * 0.8, [[0.7, -h * 0.4], [1, -h * 0.4], [0.8, 0], [1.1, h * 0.4]].map(([r, y]) => [r! * Math.min(w, d) * 0.22, y!] as [number, number])),
    { ...slab("bowl", "ceramic", { x: 0, y: h - 0.06, z: 0, w, h: 0.12, d }, Math.min(w, d) / 2, 0.04), shape: { kind: "extrude" as const, outline: ellipse(w / 2, d / 2, 28), bevel: 0.04 } },
    tube("tap", "metal", { x: 0, y: h + 0.1, z: -d / 2 + 0.06, w: 0.035, h: 0.16, d: 0.14 }, [[0, -0.08, -0.04], [0, 0.04, -0.04], [0, 0.08, 0], [0, 0.06, 0.05]], 0.01),
  ];
}

/** A pan against the wall: the cistern behind, the bowl and its seat before it. */
function toilet(w: number, d: number): PiecePart[] {
  const cisternD = Math.min(0.16, d * 0.3);
  const bowlD = d - cisternD;
  const bw = Math.min(w * 0.82, 0.4);
  return [
    slab("cistern", "ceramic", { x: 0, y: 0.38, z: -d / 2 + cisternD / 2, w: w * 0.95, h: 0.76, d: cisternD }, 0.04, 0.02),
    // The bowl: an oval pan narrowing at the front, with its seat in the same line.
    { ...slab("bowl", "ceramic", { x: 0, y: 0.19, z: -d / 2 + cisternD + bowlD / 2, w: bw, h: 0.38, d: bowlD }, 0.1, 0.03), shape: { kind: "extrude" as const, outline: ellipse(bw / 2, bowlD / 2, 24), bevel: 0.03 } },
    { ...slab("seat", "ceramic", { x: 0, y: 0.4, z: -d / 2 + cisternD + bowlD / 2, w: bw * 1.04, h: 0.035, d: bowlD * 0.98 }, 0.1, 0.012), shape: { kind: "extrude" as const, outline: ellipse((bw * 1.04) / 2, (bowlD * 0.98) / 2, 24), bevel: 0.012 } },
  ];
}

/** A shower: the tray, a glass screen along its open front, the riser at the back. */
function shower(w: number, d: number): PiecePart[] {
  return [
    part("tray", "ceramic", { x: 0, y: 0.03, z: 0, w, h: 0.06, d }, 0.02),
    part("screen", "glass", { x: 0, y: 1.03, z: d / 2 - 0.005, w, h: 1.94, d: 0.01 }),
    part("riser", "metal", { x: 0, y: 1.05, z: -d / 2 + 0.03, w: 0.03, h: 1.9, d: 0.03 }),
  ];
}

/** A basin on its vanity: the cabinet, the top, the bowl sunk in it and the tap. */
function vanity(w: number, d: number): PiecePart[] {
  const top = 0.85;
  const bw = Math.min(w - 0.08, 0.5);
  const bd = Math.min(d - 0.12, 0.38);
  return [
    slab("cabinet", "joinery", { x: 0, y: (top - 0.04 + 0.15) / 2, z: 0, w, h: top - 0.04 - 0.15, d: d * 0.95 }, 0.01, 0.006),
    slab("top", "worktop", { x: 0, y: top - 0.02, z: 0, w, h: 0.04, d }, 0.015, 0.01),
    // An oval bowl on the top with a dark well, and a swan-neck tap.
    // A vessel basin standing on the top: a hollow shell with its opening and a real depth.
    shell("bowl", "ceramic", { x: 0, y0: top, z: 0.02, w: bw, h: 0.13, d: bd }, 0.018, bd / 2, 0.03),
    tube("tap", "metal", { x: 0, y: top + 0.19, z: -d / 2 + 0.1, w: 0.04, h: 0.2, d: 0.2 }, [[0, -0.1, -0.06], [0, 0.04, -0.06], [0, 0.1, -0.02], [0, 0.1, 0.05], [0, 0.04, 0.09]], 0.01),
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
