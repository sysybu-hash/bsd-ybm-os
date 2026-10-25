import { parseRoomDims, ROOM_EXCLUDE } from "@/lib/projects/building/dxf-house";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

/**
 * The rooms a floor sheet labels itself: each room's name as the architect
 * wrote it, and the "W*L" written under it — the booklet's measurements are
 * these, the architect's own, not what the model stood up.
 */
export type RoomLabel = {
  name: string | null;
  dims: { w: number; l: number } | null;
  areaM2: number | null;
  /** Where its name stands, as a share of the sheet's page: the plan's render is framed on the sheet. */
  fx: number;
  fy: number;
  /** In the first home of a mirrored pair, or the house is not one. */
  home: boolean;
};

/** Room words a label's name is taken on without its "W*L": a terrace, a bath the sheet gives no size. */
const ROOM_WORDS = /סלון|מטבח|שינה|ממ"?ד|מ\.מ\.ד|אמבט|שירות|רחצה|מרפסת|מחסן|מבואה|פרוזדור|מסדרון|כביסה|חדר|הורים|ילדים|עבודה|אוכל|ארונות|מקלחת/;

const ROOM_NAMES: Array<[RegExp, string]> = [
  [/^ח\.?\s*שינה$/, "חדר שינה"],
  [/^ח\.?\s*רחצה$/, "חדר רחצה"],
  [/^ח\.?\s*הורים$/, "חדר הורים"],
  [/^מ\.?\s*מ\.?\s*ד\.?$|^ממ"?ד$/, 'ממ"ד'],
];

/** A label's name as the booklet writes it: the architect's abbreviations spelled out. */
export function roomNameHe(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "חלל";
  return ROOM_NAMES.find(([re]) => re.test(n))?.[1] ?? n;
}

/**
 * The labels on one floor sheet: a CAD file's as it reads them (roomsDrawn),
 * else name and size paired by the nearest "W*L" under the name.
 */
export function readRoomLabels(g: DwfGeometry): RoomLabel[] {
  const unit = DWF_FLOOR_UNITS_PER_METRE;
  if (g.roomsDrawn?.length) {
    const raw = g.roomsDrawn.flatMap((r) => {
      const dims = r.dims ? parseRoomDims(r.dims.replace(/\s/g, "")) : null;
      if (!r.name && !dims) return [];
      return [{ name: r.name, dims: dims ? { w: dims.w, l: dims.l } : null, areaM2: dims?.areaM2 ?? null, x: r.x, y: r.y }];
    });
    return placed(raw, g, unit);
  }
  const texts = g.texts.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text);
  const sizes = texts.filter((t) => parseRoomDims(t.text.replace(/\s/g, "")));
  const names = texts.filter((t) => /[\u0590-\u05FF]/.test(t.text) && !ROOM_EXCLUDE.test(t.text) && t.text.length <= 24 && !parseRoomDims(t.text));
  const used = new Set<(typeof sizes)[number]>();
  const raw: Raw[] = [];
  for (const n of names) {
    const near = sizes
      .filter((q) => !used.has(q))
      .map((q) => ({ q, d: Math.hypot(q.x - n.x, q.y - n.y) }))
      .sort((a, b) => a.d - b.d)[0];
    const size = near && near.d < 1.6 * unit ? near.q : null;
    if (!size && !ROOM_WORDS.test(n.text)) continue;
    if (size) used.add(size);
    const dims = size ? parseRoomDims(size.text.replace(/\s/g, "")) : null;
    raw.push({ name: n.text, dims: dims ? { w: dims.w, l: dims.l } : null, areaM2: dims?.areaM2 ?? null, x: n.x, y: n.y });
  }
  for (const s of sizes) {
    if (used.has(s)) continue;
    const dims = parseRoomDims(s.text.replace(/\s/g, ""))!;
    raw.push({ name: null, dims: { w: dims.w, l: dims.l }, areaM2: dims.areaM2, x: s.x, y: s.y });
  }
  return placed(raw, g, unit);
}

type Raw = { name: string | null; dims: { w: number; l: number } | null; areaM2: number | null; x: number; y: number };

/**
 * The rooms a sheet names, each once: its labels in metres, less those written
 * twice and its balconies — what a model's named rooms are counted against.
 */
export function namedRoomCount(rooms: Array<{ name: string | null; dims: string | null; at: [number, number] }>): number {
  const raw: Raw[] = rooms.map((r) => {
    const d = r.dims ? parseRoomDims(r.dims.replace(/\s/g, "")) : null;
    return { name: r.name, dims: d ? { w: d.w, l: d.l } : null, areaM2: d?.areaM2 ?? null, x: r.at[0], y: r.at[1] };
  });
  return tidy(raw, 1).filter((r) => r.name && !/מרפסת/.test(r.name)).length;
}

/** The labels as shares of the sheet's page, each marked whether it is the first home's. */
function placed(raw: Raw[], g: DwfGeometry, unit: number): RoomLabel[] {
  const labels = tidy(raw, unit);
  const { home, twin } = firstHome(labels, unit);
  return labels.map((r, i) => {
    const size = r.dims ? r : (labels[twin[i]!] ?? r);
    return {
      name: r.name,
      dims: size.dims,
      areaM2: size.areaM2,
      fx: g.pageWidth > 0 ? r.x / g.pageWidth : 0,
      fy: g.pageHeight > 0 ? r.y / g.pageHeight : 0,
      home: home[i]!,
    };
  });
}

const dimsKey = (d: Raw["dims"]) => (d ? [d.w, d.l].sort((a, b) => a - b).join("x") : "");

/** One room's label, its mirror's, or one home's room the other gives the size of. */
const sameRoom = (a: Raw, b: Raw) => roomNameHe(a.name) === roomNameHe(b.name) && (!a.dims || !b.dims || dimsKey(a.dims) === dimsKey(b.dims));

/**
 * A sheet writes some labels twice on one spot, and leaves some "W*L" loose
 * off its room — a size a named room already carries, or one standing out
 * past every named room. Neither is a room.
 */
function tidy(raw: Raw[], unit: number): Raw[] {
  const named = raw.filter((r) => r.name);
  const sized = new Set(named.filter((r) => r.dims).map((r) => dimsKey(r.dims)));
  const margin = 1.5 * unit;
  const inside = (r: Raw) =>
    named.length < 3 ||
    (r.x >= Math.min(...named.map((n) => n.x)) - margin &&
      r.x <= Math.max(...named.map((n) => n.x)) + margin &&
      r.y >= Math.min(...named.map((n) => n.y)) - margin &&
      r.y <= Math.max(...named.map((n) => n.y)) + margin);
  const kept: Raw[] = [];
  for (const r of [...raw].sort((a, b) => Number(!!b.dims) - Number(!!a.dims))) {
    if (!r.name && (sized.has(dimsKey(r.dims)) || !inside(r))) continue;
    if (kept.some((k) => roomNameHe(k.name) === roomNameHe(r.name) && Math.hypot(k.x - r.x, k.y - r.y) < 0.3 * unit)) continue;
    kept.push(r);
  }
  return kept;
}

/**
 * A pair of semi-detached houses is drawn as one home and its mirror: every
 * label has its twin across the party wall. Where most do, the first home is
 * the labels on one side of that wall, and any label the other side alone
 * carries (the architect wrote it once, for both); where they do not, the
 * sheet is one house and every label is its own. A label the architect left
 * unsized takes its twin's size.
 */
function firstHome(labels: Raw[], unit: number): { home: boolean[]; twin: number[] } {
  const all = { home: labels.map(() => true), twin: labels.map(() => -1) };
  if (labels.length < 4) return all;
  let best: { along: "x" | "y"; axis: number; partnered: number; twin: number[] } | null = null;
  for (const along of ["x", "y"] as const) {
    const across = along === "x" ? "y" : "x";
    const votes = new Map<number, number>();
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const [a, b] = [labels[i]!, labels[j]!];
        if (!sameRoom(a, b) || Math.abs(a[across] - b[across]) > 0.5 * unit || Math.abs(a[along] - b[along]) < 1 * unit) continue;
        const axis = Math.round((a[along] + b[along]) / 2 / (0.25 * unit)) * 0.25 * unit;
        votes.set(axis, (votes.get(axis) ?? 0) + 1);
      }
    const top = [...votes].sort((p, q) => q[1] - p[1])[0];
    if (!top) continue;
    const axis = top[0];
    const twin = labels.map((a) =>
      labels.findIndex((b) => b !== a && sameRoom(a, b) && Math.abs(a[across] - b[across]) <= 0.5 * unit && Math.abs(a[along] + b[along] - 2 * axis) <= 1 * unit),
    );
    const partnered = twin.filter((t) => t >= 0).length;
    if (!best || partnered > best.partnered) best = { along, axis, partnered, twin };
  }
  if (!best || best.partnered < 0.6 * labels.length) return all;
  const { along, axis, twin } = best;
  return { home: labels.map((r, i) => r[along] <= axis + 0.5 * unit || twin[i]! < 0), twin };
}
