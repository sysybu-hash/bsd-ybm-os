import type { DwfArc, DwfGeometry } from "@/lib/projects/floorplan-dwf";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";

/**
 * The pans and basins a permit plan draws, which it draws with curves.
 *
 * Rectangles give the baths, the shower trays and the washing machines; the
 * rest of a bathroom has no straight side. On this set a pan is a handful of
 * circular arcs — the bowl's two ends, its long sides, the seat inside — and
 * a basin is an ellipse drawn as a ring of short straight strokes, standing in
 * the rectangle of its vanity. So:
 *
 * - a pan is a cluster of touching arcs, 6–60 cm in radius, at least three of
 *   them, 30–52 by 42–80 cm over all, in a wet room or an unnamed one (a WC
 *   is often not named). A door's swing is an arc too, but a wide one: a
 *   quarter turn over 40 cm is not part of any pan.
 * - a basin is a closed ring of ten or more strokes under 15 cm each — the
 *   curve layer's or the line layer's — 25–75 cm across. The sheet's lettering
 *   is set in the same short strokes, but a digit is 20 cm tall. A ring over a
 *   pan is the pan's own outline. In a kitchen the same ring is the sink.
 *   Where a rectangle up to 1.3 m stands round it, that is the vanity and the
 *   piece is the vanity.
 */
type Rect = { x: number; y: number; w: number; h: number };

export function readDwfSanitary(
  sheet: DwfGeometry,
  upm: number,
  roomKindAt: (x: number, y: number) => FloorplanRoomKind | null | undefined,
  inFlat: (x: number, y: number) => boolean,
  rects: Rect[] = [],
): FurniturePiece[] {
  const cm = (v: number) => (v / upm) * 100;
  const wetAt = (x: number, y: number) => {
    const kind = roomKindAt(x, y);
    return kind == null || kind === "bathroom" || kind === "utility";
  };
  const out: FurniturePiece[] = [];
  const piece = (r: Rect, fixture: NonNullable<FurniturePiece["fixture"]>, kind: FurniturePiece["kind"] = "fixture") =>
    out.push({ ...r, kind, widthCm: cm(r.w), depthCm: cm(r.h), ...(kind === "fixture" ? { fixture } : {}) });

  // --- pans
  const arcBox = (a: DwfArc): Rect => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i <= 12; i++) {
      const t = a.start + ((a.end - a.start) * i) / 12;
      const x = a.cx + a.r * Math.cos(t);
      const y = a.cy + a.r * Math.sin(t);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const arcs = sheet.arcs
    .filter((a) => {
      const r = cm(a.r);
      const sweep = Math.abs(a.end - a.start);
      if (r < 6 || r > 60 || (r > 40 && sweep > 1.2)) return false;
      const mid = (a.start + a.end) / 2;
      const x = a.cx + a.r * Math.cos(mid);
      const y = a.cy + a.r * Math.sin(mid);
      return inFlat(x, y) && wetAt(x, y);
    })
    .map((a) => ({ a, box: arcBox(a) }));
  const touch = (p: Rect, q: Rect, slack: number) =>
    p.x - slack <= q.x + q.w && q.x - slack <= p.x + p.w && p.y - slack <= q.y + q.h && q.y - slack <= p.y + p.h;
  const parent = arcs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < arcs.length; i++) {
    for (let j = i + 1; j < arcs.length; j++) if (touch(arcs[i]!.box, arcs[j]!.box, 0.02 * upm)) parent[find(i)] = find(j);
  }
  const groups = new Map<number, typeof arcs>();
  arcs.forEach((q, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), q]));
  for (const group of groups.values()) {
    if (group.length < 3 || !group.some((q) => cm(q.a.r) >= 10)) continue;
    const box = union(group.map((q) => q.box));
    const s = Math.min(cm(box.w), cm(box.h));
    const l = Math.max(cm(box.w), cm(box.h));
    if (s >= 30 && s <= 52 && l >= 42 && l <= 80) piece(box, "toilet");
  }

  // --- basins: rings of short strokes
  const strokes = [...sheet.segments, ...sheet.curves].filter((g) => {
    const len = cm(Math.hypot(g.x2 - g.x1, g.y2 - g.y1));
    return len >= 0.4 && len < 15;
  });
  const snap = 0.003 * upm;
  const key = (x: number, y: number) => `${Math.round(x / snap)},${Math.round(y / snap)}`;
  const vertexParent = new Map<string, string>();
  const vfind = (v: string): string => {
    let n = v;
    while (vertexParent.get(n) !== n) n = vertexParent.get(n)!;
    vertexParent.set(v, n);
    return n;
  };
  const degree = new Map<string, number>();
  for (const g of strokes) {
    const a = key(g.x1, g.y1);
    const b = key(g.x2, g.y2);
    for (const v of [a, b]) {
      if (!vertexParent.has(v)) vertexParent.set(v, v);
      degree.set(v, (degree.get(v) ?? 0) + 1);
    }
    const ra = vfind(a);
    const rb = vfind(b);
    if (ra !== rb) vertexParent.set(ra, rb);
  }
  const rings = new Map<string, Array<(typeof strokes)[number]>>();
  for (const g of strokes) {
    const root = vfind(key(g.x1, g.y1));
    rings.set(root, [...(rings.get(root) ?? []), g]);
  }
  for (const ring of rings.values()) {
    if (ring.length < 10) continue;
    const vertices = new Set(ring.flatMap((g) => [key(g.x1, g.y1), key(g.x2, g.y2)]));
    // Closed: a tap or a drain drawn onto the ring leaves a spur or two.
    const closed = [...vertices].filter((v) => (degree.get(v) ?? 0) >= 2).length >= vertices.size * 0.8;
    if (!closed) continue;
    const box = union(ring.map((g) => ({ x: Math.min(g.x1, g.x2), y: Math.min(g.y1, g.y2), w: Math.abs(g.x2 - g.x1), h: Math.abs(g.y2 - g.y1) })));
    const s = Math.min(cm(box.w), cm(box.h));
    const l = Math.max(cm(box.w), cm(box.h));
    if (s < 25 || l > 75 || l > s * 1.8) continue;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // A vanity stands on pixels that are no room's, so the fixture's room is
    // read round it: eight points 20 cm out from it, most of them the flat's.
    const reach = Math.max(box.w, box.h) / 2 + 0.2 * upm;
    const round = Array.from({ length: 8 }, (_, i) => [cx + reach * Math.cos((i * Math.PI) / 4), cy + reach * Math.sin((i * Math.PI) / 4)] as const).filter(([x, y]) =>
      inFlat(x, y),
    );
    if (round.length < 3) continue;
    const kinds = round.map(([x, y]) => roomKindAt(x, y));
    // The most of them: a sample past the wall is the next room's.
    const tally = new Map<FloorplanRoomKind | null, number>();
    for (const k of kinds) tally.set(k ?? null, (tally.get(k ?? null) ?? 0) + 1);
    const room = [...tally].sort((a, b) => b[1] - a[1])[0]![0];
    // A pan's own outline, drawn in strokes over its arcs, is the pan.
    if (out.some((p) => p.fixture === "toilet" && cx > p.x && cx < p.x + p.w && cy > p.y && cy < p.y + p.h)) continue;
    if (room === "kitchen" || room === "living") {
      piece(box, "basin", "sink");
      continue;
    }
    if (room !== null && room !== "bathroom" && room !== "utility") continue;
    const vanity = rects
      .filter((r) => r.x <= box.x && r.y <= box.y && r.x + r.w >= box.x + box.w && r.y + r.h >= box.y + box.h && Math.max(cm(r.w), cm(r.h)) <= 130)
      .sort((p, q) => p.w * p.h - q.w * q.h)[0];
    piece(vanity ?? box, "basin");
  }
  return out;
}

function union(boxes: Rect[]): Rect {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
