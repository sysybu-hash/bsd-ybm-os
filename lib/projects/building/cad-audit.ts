import { layerKind, profileFor } from "@/lib/projects/building/cad-layers";
import { levelMarksOf, type LevelMark } from "@/lib/projects/building/cad-levels";
import { inferUnitsM, wholeSheet } from "@/lib/projects/building/dxf-house";
import { readDxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * Everything a plan says that a model has to answer for, read off the drawing's own pieces and set down in the architect's words: what its layers hold and which
 * the reader does not take, the level marks, the slopes (a "שיפוע" label with the percentage beside it, or the fall between the two level marks near it), the
 * heights it writes ("גובה 1.20 מ'"), the curved walls and the stairs. Nothing is dropped silently: whatever the model does not build is listed here.
 */

export type SlopeFinding = { text: string; at: [number, number]; percent: number | null; basis: string };
export type DrawingAudit = {
  file: string;
  unitsM: number;
  /** Layers whose pieces no reader takes, biggest first. */
  unread: Array<{ layer: string; pieces: number; holds: string }>;
  levels: Array<{ value: number; at: [number, number] }>;
  slopes: SlopeFinding[];
  heights: Array<{ text: string; metres: number }>;
  curvedWalls: number;
  stairLayerPieces: number;
};

const SLOPE_WORD = /שיפוע|שפוע|slope|ramp|רמפה|מדרון/i;
const PERCENT = /(\d+(?:[.,]\d+)?)\s*%/;
const RATIO = /\b1\s*[:/]\s*(\d+(?:[.,]\d+)?)\b/;
const HEIGHT_TEXT = /גובה\s*0?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:מ'|מטר|m)?/;

const holdsOf = (pieces: DxfPiece[]): string => {
  const c = { lines: 0, hatch: 0, text: 0, arcs: 0, blocks: 0 };
  for (const p of pieces) {
    if (p.text != null) c.text++;
    else if (p.rings) c.hatch++;
    else if (p.arc || p.circle) c.arcs++;
    else if (p.insert) c.blocks++;
    else if (p.pts) c.lines++;
  }
  const parts = [c.lines && `${c.lines} קווים`, c.hatch && `${c.hatch} שטחי מילוי`, c.text && `${c.text} כתובות`, c.arcs && `${c.arcs} קשתות`, c.blocks && `${c.blocks} בלוקים`].filter(Boolean);
  return parts.join(", ") || "ריק";
};

/** Where a piece lies, in metres from the sheet's top-left corner. */
const place = (p: Pt, origin: Pt, unitsM: number): [number, number] => [Number(((p.x - origin.x) * unitsM).toFixed(2)), Number(((p.y - origin.y) * unitsM).toFixed(2))];

export function auditDxf(input: string | Uint8Array, file: string): DrawingAudit | null {
  const drawing = readDxfDrawing(input);
  if (!drawing) return null;
  const profile = profileFor(drawing.layers.keys());
  const whole = wholeSheet(drawing, profile);
  if (!whole) return null;
  const { sheet, pieces } = whole;
  const unitsM = inferUnitsM(drawing, pieces, profile, sheet);
  const origin: Pt = { x: sheet.centre.x - sheet.width / 2, y: sheet.centre.y - sheet.height / 2 };

  const byLayer = new Map<string, DxfPiece[]>();
  for (const p of pieces) (byLayer.get(p.layer) ?? byLayer.set(p.layer, []).get(p.layer)!).push(p);
  const unread = [...byLayer.entries()]
    .filter(([layer, ps]) => layerKind(profile, layer) == null && ps.length >= 10)
    .map(([layer, ps]) => ({ layer, pieces: ps.length, holds: holdsOf(ps) }))
    .sort((a, b) => b.pieces - a.pieces);

  const marks = levelMarksOf(pieces);
  const levels = marks.map((m) => ({ value: m.value, at: place(m.at, origin, unitsM) }));

  // A slope: the label, and its percentage from the text beside it, else from the fall between the nearest level marks.
  const texts = pieces.filter((p) => p.text != null && p.at);
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) * unitsM;
  const slopes: SlopeFinding[] = [];
  for (const t of texts) {
    const text = t.text!;
    const labelled = SLOPE_WORD.test(text);
    const own = PERCENT.exec(text) ?? RATIO.exec(text);
    if (!labelled && !PERCENT.test(text)) continue;
    // A bare "1.5%" written beside its "שיפוע" label is that label's number, not a second slope.
    if (!labelled && texts.some((o) => o !== t && SLOPE_WORD.test(o.text!) && near(o.at!, t.at!) <= 4)) continue;
    let percent: number | null = null;
    let basis = "";
    const fromText = (s: string) => {
      const pm = PERCENT.exec(s);
      if (pm) return { v: Number(pm[1]!.replace(",", ".")), how: `כתוב ${s.trim()}` };
      const rm = RATIO.exec(s);
      if (rm) return { v: 100 / Number(rm[1]!.replace(",", ".")), how: `כתוב ${s.trim()}` };
      return null;
    };
    const beside = own ? fromText(text) : (() => {
      const close = texts.filter((o) => o !== t && near(o.at!, t.at!) <= 4 && fromText(o.text!)).sort((a, b) => near(a.at!, t.at!) - near(b.at!, t.at!))[0];
      return close ? fromText(close.text!) : null;
    })();
    if (beside) {
      percent = beside.v;
      basis = beside.how;
    } else if (labelled) {
      const around = marks.filter((m) => near(m.at, t.at!) <= 10).sort((a, b) => near(a.at, t.at!) - near(b.at, t.at!));
      const a = around[0];
      const b = around.find((m) => a && Math.abs(m.value - a.value) >= 0.05);
      if (a && b) {
        const run = near(a.at, b.at);
        if (run > 0.5) {
          percent = Number(((Math.abs(a.value - b.value) / run) * 100).toFixed(1));
          basis = `מחושב: ירידה של ${Math.abs(a.value - b.value).toFixed(2)} מ' לאורך ${run.toFixed(1)} מ' בין שני מפלסים כתובים`;
        }
      }
    }
    slopes.push({ text: text.trim(), at: place(t.at!, origin, unitsM), percent, basis: basis || "אין מפלסים קרובים לחישוב" });
  }

  const heights: DrawingAudit["heights"] = [];
  for (const t of texts) {
    const m = HEIGHT_TEXT.exec(t.text!);
    if (m) heights.push({ text: t.text!.trim(), metres: Number(m[1]!.replace(",", ".")) });
  }

  const curvedWalls = pieces.filter((p) => (p.arc || p.type === "SPLINE" || p.type === "ELLIPSE") && ["wall-ext", "wall-int"].includes(layerKind(profile, p.layer) ?? "")).length;
  const stairLayerPieces = pieces.filter((p) => layerKind(profile, p.layer) === "stairs").length;
  return { file, unitsM, unread, levels, slopes, heights, curvedWalls, stairLayerPieces };
}

/** The audit as lines the architect reads (Hebrew), each a fact the drawing holds. */
export function auditLines(a: DrawingAudit): { warnings: string[]; notes: string[] } {
  const name = a.file;
  const notes: string[] = [];
  const warnings: string[] = [];
  const spots = a.levels.filter((l) => l.value !== 0 || true);
  if (spots.length) {
    const vals = [...new Set(spots.map((l) => l.value.toFixed(2)))].sort((x, y) => Number(x) - Number(y));
    notes.push(`${name}: ${spots.length} סימוני מפלס בתוכנית (${vals.slice(0, 12).join(", ")}${vals.length > 12 ? "…" : ""})`);
  }
  if (a.slopes.length) {
    const withPct = a.slopes.filter((s) => s.percent != null);
    notes.push(`${name}: ${a.slopes.length} סימוני שיפוע בתוכנית, ${withPct.length} מהם עם אחוז שנקרא${withPct.length ? ` (${withPct.slice(0, 6).map((s) => `${s.percent}% — ${s.basis}`).join("; ")})` : ""}`);
    // A slope the model does not build is said so: the generic house plot stands on flat or one-fall land.
    warnings.push(`${name}: ${a.slopes.length} שיפועים סומנו בתוכנית ואינם נבנים במודל הכללי (הקרקע שטוחה או בעלת שיפוע אחד)`);
  }
  if (a.heights.length) notes.push(`${name}: ${a.heights.length} כתובות גובה (${[...new Set(a.heights.map((h) => h.metres))].slice(0, 8).join(", ")} מ')`);
  if (a.curvedWalls) notes.push(`${name}: ${a.curvedWalls} חלקי קיר מעוגלים`);
  if (a.unread.length) warnings.push(`${name}: שכבות שאף קורא לא לוקח: ${a.unread.slice(0, 8).map((u) => `${u.layer} (${u.pieces}: ${u.holds})`).join("; ")}${a.unread.length > 8 ? "…" : ""}`);
  return { warnings, notes };
}

export type { LevelMark };
