import type { PlacedText } from "@/lib/projects/floorplan-dwf";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { roomLabelKind } from "@/lib/projects/floorplan-segment";

/** Words of one line of text, joined in reading order (right to left), with where the line sits. */
export type TextLine = { x: number; y: number; height: number; text: string };

/**
 * A sheet's words gathered into lines.
 *
 * A DWF sets each word as a text of its own — "מרפסת", "מקורה", "בשטח" — so a
 * label is rebuilt from the words that share its baseline and size, near
 * each other, read right to left.
 */
export function textLines(texts: PlacedText[]): TextLine[] {
  const lines: Array<{ y: number; height: number; words: PlacedText[] }> = [];
  for (const t of texts) {
    if (!t.text.trim()) continue;
    const line = lines.find(
      (l) =>
        Math.abs(l.y - t.y) <= Math.max(0.5, t.height * 0.3) &&
        Math.abs(l.height - t.height) < 0.5 &&
        l.words.some((w) => Math.abs(w.x - t.x) < t.height * 8),
    );
    if (line) line.words.push(t);
    else lines.push({ y: t.y, height: t.height, words: [t] });
  }
  return lines.map((l) => {
    const xs = l.words.map((w) => w.x);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: l.y - l.height / 2,
      height: l.height,
      text: l.words
        .sort((a, b) => b.x - a.x)
        .map((w) => w.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  });
}

/** The room names written on a floor plan, as points with the kind each names. */
export function roomLabels(texts: PlacedText[]): Array<{ x: number; y: number; kind: FloorplanRoomKind; text: string }> {
  return textLines(texts)
    .map((line) => ({ x: line.x, y: line.y, kind: roomLabelKind(line.text), text: line.text }))
    .filter((label): label is { x: number; y: number; kind: FloorplanRoomKind; text: string } => label.kind != null);
}

/**
 * The terrace areas a floor plan prints — "מרפסת מקורה בשטח של כ-19.15 מ"ר" —
 * where the terrace is this floor's. "היטל מרפסת קומה ב" is the floor above's
 * terrace drawn over this one, and is not.
 */
export function terraceAreas(texts: PlacedText[]): Array<{ x: number; y: number; value: number }> {
  const lines = textLines(texts);
  // The figure and the words round it are set as separate lines: "מרפסת
  // מקורה" above, "בשטח של כ-19.15 מ"ר" below it.
  const near = (a: TextLine, b: TextLine) =>
    Math.abs(a.y - b.y) <= a.height * 3.5 && Math.abs(a.x - b.x) <= a.height * 12;
  return lines
    .filter((line) => /בשטח/.test(line.text))
    .map((line) => ({ line, m: /(\d+(?:\.\d+)?)/.exec(line.text) }))
    .filter((hit): hit is { line: TextLine; m: RegExpExecArray } => hit.m != null)
    .filter(({ line }) => {
      const round = lines.filter((other) => near(line, other));
      return round.some((other) => /מרפסת/.test(other.text)) && !round.some((other) => /היטל/.test(other.text));
    })
    .map(({ line, m }) => ({ x: line.x, y: line.y, value: Number(m[1]) }))
    .filter((area) => area.value >= 1 && area.value <= 80);
}

/**
 * The levels a floor plan marks — "+ 11.80" on a flat, "+ 11.78" in its lobby —
 * in metres above the building's ±0.00. The absolute height set under each,
 * "787.30", carries no sign and is left out.
 */
export function levelMarks(texts: PlacedText[]): Array<{ x: number; y: number; value: number }> {
  return textLines(texts)
    .map((line) => ({ line, m: /^(?:\+\s*(\d{1,3}\.\d{2})|(\d{1,3}\.\d{2})\s*\+)$/.exec(line.text) }))
    .filter((hit): hit is { line: TextLine; m: RegExpExecArray } => hit.m != null)
    .map(({ line, m }) => ({ x: line.x, y: line.y, value: Number(m[1] ?? m[2]) }));
}
