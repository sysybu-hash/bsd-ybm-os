import { flattenDxf, readDxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * What a drawing's own numbers say about heights, read as text and not guessed: the floors' levels off an elevations DXF, and the spot heights and slope labels
 * a plan carries. Metres from ±0.00. Nothing here asks a model.
 */

export type LevelMark = { value: number; layer: string; at: Pt };

const LEVEL_TEXT = /^\s*([+\-±−–])?\s*(\d{1,3})[.,](\d{2})\s*$/;
/** Layers an office names its level marks on: "MIFLAS" (מפלס), "level", "elev", "kot", "גובה". */
const LEVEL_LAYER = /mifla?s|מפלס|level|lvl|elev|kot|גובה/i;

/** A level mark's value: "+3.36" 3.36, "−0.48" −0.48, "±0.00" 0. Null for text that is not one. */
export function levelValue(text: string): number | null {
  const m = LEVEL_TEXT.exec(text);
  if (!m) return null;
  const v = Number(`${m[2]}.${m[3]}`);
  return m[1] === "-" || m[1] === "−" || m[1] === "–" ? -v : v;
}

export function levelMarksOf(pieces: DxfPiece[]): LevelMark[] {
  const out: LevelMark[] = [];
  for (const p of pieces) {
    if (p.text == null || !p.at) continue;
    const value = levelValue(p.text);
    if (value != null) out.push({ value, layer: p.layer, at: p.at });
  }
  return out;
}

export type DxfLevels = { floors: number[]; roof: number; parapet: number; from: string };

/**
 * The storeys' levels from an elevations drawing: the values its level-mark layer repeats (each elevation draws every floor's mark), taken in order from
 * ±0.00: `storeys` floors, then the roof. Null where the marks do not make one rising run with storeys between 2 and 6 m.
 */
export function levelsFromElevations(input: string | Uint8Array, storeys: number): DxfLevels | null {
  const drawing = readDxfDrawing(input);
  if (!drawing) return null;
  const marks = levelMarksOf(flattenDxf(drawing));
  const named = marks.filter((m) => LEVEL_LAYER.test(m.layer));
  const pool = named.length >= 4 ? named : marks;
  const count = new Map<number, number>();
  for (const m of pool) count.set(m.value, (count.get(m.value) ?? 0) + 1);
  // A floor's mark is on more than one elevation; a one-off is a spot height.
  const repeated = [...count.entries()].filter(([v, n]) => v > 0.5 && n >= 2).map(([v]) => v).sort((a, b) => a - b);
  const above = repeated.filter((v, i) => i === 0 || v - repeated[i - 1]! > 0.5);
  if (above.length < storeys) return null;
  const run = [0, ...above.slice(0, storeys)];
  const gaps = run.slice(1).map((v, i) => v - run[i]!);
  if (gaps.some((g) => g < 2 || g > 6)) return null;
  return { floors: run.slice(0, storeys), roof: run[storeys]!, parapet: 1, from: `${named.length >= 4 ? "level-mark layer" : "all level marks"}: ${run.map((v) => v.toFixed(2)).join(", ")}` };
}
