import sharp from "sharp";

import { askDrawing } from "@/lib/projects/building/house-ai";
import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";

/**
 * What each room of a private house is, from what its sheet draws in it.
 *
 * The house sheets name their rooms in outline lettering, and the DWF the
 * pipeline reads keeps only the blank mask under each name: the reader finds
 * the rooms but not what they are, and named them by size — an upper floor of
 * bedrooms came out with a living room and a kitchen, and every bedroom under
 * 10 m² a corridor, built empty. Each room is still furnished on the sheet:
 * beds and wardrobes, a sofa and a dining table, a worktop with its hob and
 * sink, a bath. The vision model is shown the floor's lines with the rooms the
 * reader found outlined and numbered, and says what each one is by what is
 * drawn in it. An answer is kept only where the room could be one: a
 * bathroom is not 15 m², a bedroom not a cupboard or a passage.
 */
export type HouseRoomUse = "bedroom" | "living" | "kitchen" | "bathroom" | "laundry" | "storage" | "study" | "stairs" | "hall" | "balcony" | "other";
const USES: HouseRoomUse[] = ["bedroom", "living", "kitchen", "bathroom", "laundry", "storage", "study", "stairs", "hall", "balcony", "other"];

export const USE_KIND: Record<HouseRoomUse, FloorplanRoomKind> = {
  bedroom: "bedroom",
  living: "living",
  kitchen: "kitchen",
  bathroom: "bathroom",
  laundry: "utility",
  storage: "utility",
  study: "other",
  stairs: "circulation",
  hall: "circulation",
  balcony: "balcony",
  other: "other",
};

export type HouseRoomReading = { id: number; use: HouseRoomUse; kept: boolean; why: string };

const PROMPT = `A floor plan of a pair of semi-detached private houses in Israel, drawn in lines (north up). The rooms the plan reader found are outlined in red and numbered in red.
For each red number, say what the room is, judging by what is drawn inside its red outline and by its size and place:
"bedroom" (beds, wardrobes), "living" (salon or dining: sofa, dining table with chairs), "kitchen" (worktop along the wall with a hob of four rings and a sink; a small table may stand in it), "bathroom" (bath, shower, toilet, basin), "laundry" (washing machine), "storage", "study" (desk and shelves, no bed), "stairs" (a flight of treads), "hall" (an entrance, passage or landing with nothing standing in it), "balcony", or "other".
A part of a larger space that the outline cuts off takes the use of what is drawn in it; an outline that takes in two rooms takes the use of the larger. A room that holds a hob is a kitchen even where a flight of stairs or a table shares it; light diagonal hatching in a rectangle is a bed's blanket, a dark filled block a wardrobe. Answer JSON only: {"rooms":[{"id":1,"use":"bedroom","why":"two single beds and a wardrobe"}]}`;

/** Whether a room of this size and shape could be put to this use. */
export function plausibleUse(use: HouseRoomUse, areaM2: number, shortSideM: number): { ok: boolean; why?: string } {
  if (use === "bathroom" && areaM2 > 12) return { ok: false, why: `${areaM2} m²: too large for a bathroom` };
  if (use === "bedroom" && (areaM2 < 6 || shortSideM < 2)) return { ok: false, why: `${areaM2} m², ${shortSideM.toFixed(2)} m across: too small for a bedroom` };
  if (use === "living" && (areaM2 < 8 || shortSideM < 2.4)) return { ok: false, why: `${areaM2} m², ${shortSideM.toFixed(2)} m across: too small for a living room` };
  if (use === "kitchen" && (areaM2 < 3 || shortSideM < 1.5)) return { ok: false, why: `${areaM2} m²: too small for a kitchen` };
  if (use === "study" && (areaM2 < 4 || shortSideM < 1.8)) return { ok: false, why: `${areaM2} m²: too small for a study` };
  if (use === "laundry" && areaM2 < 1.5) return { ok: false, why: `${areaM2} m²: a cupboard, left to the sheet` };
  return { ok: true };
}

/** The floor's lines in a box, without the wall and blanket hatch that greys a picture of them out. */
function lineDrawing(sheet: DwfGeometry, box: { x: number; y: number; width: number; height: number }, px: number, upm: number): Buffer {
  const k = px / box.width;
  const h = Math.round(box.height * k);
  const inside = (x: number, y: number) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  const byPen = new Map<string, string[]>();
  for (const s of [...sheet.segments, ...sheet.curves]) {
    if (!inside(s.x1, s.y1) && !inside(s.x2, s.y2)) continue;
    const pen = (s.stroke ?? 0) & 0xffffff;
    const grey = Math.min(pen >> 16, (pen >> 8) & 0xff, pen & 0xff);
    // Near-white is the tile grid, which prints as nothing.
    if (grey >= 0xf0) continue;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm;
    let a = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180;
    a = Math.min(a, 180 - a);
    if (pen !== 0 && len >= 0.05 && Math.abs(a - 45) < 4) continue;
    const colour = pen === 0 ? "#222" : grey >= 0xc0 ? "#aaa" : "#777";
    const list = byPen.get(colour) ?? [];
    list.push(`M${((s.x1 - box.x) * k).toFixed(1)} ${((s.y1 - box.y) * k).toFixed(1)}L${((s.x2 - box.x) * k).toFixed(1)} ${((s.y2 - box.y) * k).toFixed(1)}`);
    byPen.set(colour, list);
  }
  const paths = [...byPen].map(([colour, d]) => `<path d="${d.join("")}" stroke="${colour}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h}"><rect width="100%" height="100%" fill="#fff"/>${paths}</svg>`);
}

/** Each room's most inward pixel: the one farthest from its edge. */
function poles(floor: DwfFloor, ids: Set<number>): Map<number, { x: number; y: number }> {
  const { cols, rows, room } = floor;
  const dist = new Float32Array(cols * rows);
  for (let k = 0; k < dist.length; k++) dist[k] = ids.has(room[k]!) ? 1e9 : 0;
  const pass = (forward: boolean) => {
    const steps = forward
      ? [[-1, 0, 1], [0, -1, 1], [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2]]
      : [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2]];
    for (let yy = 0; yy < rows; yy++) {
      const y = forward ? yy : rows - 1 - yy;
      for (let xx = 0; xx < cols; xx++) {
        const x = forward ? xx : cols - 1 - xx;
        const k = y * cols + x;
        if (!dist[k]) continue;
        let v = dist[k]!;
        for (const [dx, dy, w] of steps) {
          const nx = x + dx!;
          const ny = y + dy!;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const q = ny * cols + nx;
          v = Math.min(v, room[q] === room[k] ? dist[q]! + w! : w!);
        }
        dist[k] = v;
      }
    }
  };
  pass(true);
  pass(false);
  const best = new Map<number, { x: number; y: number; d: number }>();
  for (let k = 0; k < dist.length; k++) {
    const id = room[k]!;
    if (!ids.has(id)) continue;
    const have = best.get(id);
    if (!have || dist[k]! > have.d) best.set(id, { x: k % cols, y: Math.floor(k / cols), d: dist[k]! });
  }
  return new Map([...best].map(([id, p]) => [id, { x: p.x, y: p.y }]));
}

/**
 * What the rooms of a house floor's flats are, by room id; null when there is
 * no key or no answer. `read` lists every answer with whether it was kept.
 */
export async function readHouseRoomUses(
  sheet: DwfGeometry,
  floor: DwfFloor,
  ask: (prompt: string, images: Buffer[]) => Promise<Record<string, unknown> | null> = askDrawing,
): Promise<{ kinds: Map<number, FloorplanRoomKind>; uses: Map<number, HouseRoomUse>; read: HouseRoomReading[]; image: Buffer } | null> {
  const { cols, rows, cm, room } = floor;
  const ids = new Set(floor.apartments.flatMap((a) => a.rooms));
  if (ids.size === 0) return null;
  const spans = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  for (let k = 0; k < room.length; k++) {
    const id = room[k]!;
    if (!ids.has(id)) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    const s = spans.get(id) ?? { x0: x, y0: y, x1: x, y1: y };
    spans.set(id, { x0: Math.min(s.x0, x), y0: Math.min(s.y0, y), x1: Math.max(s.x1, x), y1: Math.max(s.y1, y) });
  }
  const all = [...spans.values()];
  const pad = Math.round(100 / cm);
  const x0 = Math.max(0, Math.min(...all.map((s) => s.x0)) - pad);
  const y0 = Math.max(0, Math.min(...all.map((s) => s.y0)) - pad);
  const x1 = Math.min(cols - 1, Math.max(...all.map((s) => s.x1)) + pad);
  const y1 = Math.min(rows - 1, Math.max(...all.map((s) => s.y1)) + pad);
  const upm = floor.unitsPerMetre;
  const unitsPerPx = (upm * cm) / 100;
  const box = { x: x0 * unitsPerPx, y: y0 * unitsPerPx, width: (x1 - x0 + 1) * unitsPerPx, height: (y1 - y0 + 1) * unitsPerPx };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const width = 2400;
  const height = Math.round((width * h) / w);

  // The rooms' edges in red, a pixel of the floor's grid each.
  const edges = Buffer.alloc(w * h * 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = y * cols + x;
      const id = room[k]!;
      if (!ids.has(id)) continue;
      const edge = (x > 0 && room[k - 1] !== id) || (x < cols - 1 && room[k + 1] !== id) || (y > 0 && room[k - cols] !== id) || (y < rows - 1 && room[k + cols] !== id);
      if (!edge) continue;
      const o = ((y - y0) * w + (x - x0)) * 4;
      edges[o] = 230;
      edges[o + 3] = 255;
    }
  }
  const outline = await sharp(edges, { raw: { width: w, height: h, channels: 4 } }).resize(width, height, { kernel: "nearest" }).png().toBuffer();
  const k = width / w;
  const numbers = [...poles(floor, ids)]
    .map(
      ([id, p]) =>
        `<text x="${((p.x - x0 + 0.5) * k).toFixed(1)}" y="${((p.y - y0 + 0.5) * k).toFixed(1)}" font-size="34" font-family="Arial" font-weight="bold" fill="#e00" stroke="#fff" stroke-width="6" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${id}</text>`,
    )
    .join("");
  const image = await sharp(lineDrawing(sheet, box, width, upm))
    .resize(width, height)
    .composite([{ input: outline }, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${numbers}</svg>`) }])
    .jpeg({ quality: 88 })
    .toBuffer();
  const answer = await ask(PROMPT, [image]);
  if (!answer || !Array.isArray(answer.rooms)) return null;
  const kinds = new Map<number, FloorplanRoomKind>();
  const uses = new Map<number, HouseRoomUse>();
  const read: HouseRoomReading[] = [];
  for (const raw of answer.rooms as Array<Record<string, unknown>>) {
    const id = Number(raw?.id);
    const use = raw?.use as HouseRoomUse;
    const info = floor.rooms.find((r) => r.id === id);
    const span = spans.get(id);
    if (!info || !span || !USES.includes(use)) continue;
    const short = (Math.min(span.x1 - span.x0, span.y1 - span.y0) + 1) * (cm / 100);
    const check = plausibleUse(use, info.areaM2, short);
    read.push({ id, use, kept: check.ok, why: check.why ?? (typeof raw.why === "string" ? raw.why : "") });
    if (!check.ok) continue;
    uses.set(id, use);
  }
  for (const [id, use] of twinUses(floor, spans, uses)) {
    uses.set(id, use);
    const r = read.find((n) => n.id === id);
    if (r) Object.assign(r, { use, kept: true, why: `as its mirror twin (${r.use})` });
    else read.push({ id, use, kept: true, why: "as its mirror twin" });
  }
  for (const [id, use] of uses) {
    // A room read as holding nothing is left to the sheet: its pan, where the
    // sanitary reader finds one, still makes it a WC.
    if (SHEET_DECIDES.has(use)) continue;
    const areaM2 = floor.rooms.find((r) => r.id === id)?.areaM2 ?? 0;
    // A kitchen the size of a salon is the salon it opens into, and is set out as one.
    kinds.set(id, use === "kitchen" && areaM2 >= 16 ? "living" : USE_KIND[use]);
  }
  return { kinds, uses, read, image };
}

const FURNISHED: ReadonlySet<HouseRoomUse> = new Set(["bedroom", "living", "kitchen", "bathroom"]);
const SHEET_DECIDES: ReadonlySet<HouseRoomUse> = new Set(["storage", "stairs", "hall", "other"]);

/**
 * A pair of houses is drawn as mirrors, and a room's twin across the party
 * wall is the same room: where one was read as a room people live in and the
 * other as a passage, a store or nothing, the passage takes the twin's use.
 * One kitchen of A's pair was read as the stairs that share it.
 */
function twinUses(
  floor: DwfFloor,
  spans: Map<number, { x0: number; y0: number; x1: number; y1: number }>,
  uses: Map<number, HouseRoomUse>,
): Map<number, HouseRoomUse> {
  const out = new Map<number, HouseRoomUse>();
  if (floor.apartments.length !== 2) return out;
  const [a, b] = floor.apartments as [DwfFloor["apartments"][number], DwfFloor["apartments"][number]];
  const box = (ids: number[]) => {
    const own = ids.map((id) => spans.get(id)).filter((s) => s != null);
    return { x0: Math.min(...own.map((s) => s.x0)), x1: Math.max(...own.map((s) => s.x1)) };
  };
  const ba = box(a.rooms);
  const bb = box(b.rooms);
  const axis = ba.x1 < bb.x0 ? (ba.x1 + bb.x0) / 2 : bb.x1 < ba.x0 ? (bb.x1 + ba.x0) / 2 : null;
  if (axis == null) return out;
  const reach = 50 / floor.cm;
  const areaOf = (id: number) => floor.rooms.find((r) => r.id === id)?.areaM2 ?? 0;
  for (const [mine, theirs] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const id of mine.rooms) {
      const s = spans.get(id);
      const use = uses.get(id);
      if (!s || (use && FURNISHED.has(use))) continue;
      const mx = 2 * axis - (s.x0 + s.x1) / 2;
      const my = (s.y0 + s.y1) / 2;
      const twin = theirs.rooms.find((t) => {
        const ts = spans.get(t);
        if (!ts) return false;
        const area = areaOf(t);
        return Math.abs(area - areaOf(id)) <= 0.03 * area && Math.hypot((ts.x0 + ts.x1) / 2 - mx, (ts.y0 + ts.y1) / 2 - my) <= reach;
      });
      const twinUse = twin != null ? uses.get(twin) : undefined;
      if (twinUse && FURNISHED.has(twinUse)) out.set(id, twinUse);
    }
  }
  return out;
}
