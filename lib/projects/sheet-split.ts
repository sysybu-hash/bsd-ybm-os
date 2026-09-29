import type { DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";

export type StripSheetKind = "floor" | "elevation" | "section" | "roof" | "site" | "form" | "other";

/** One drawing on a permit strip. */
export type StripSheet = {
  box: { x: number; y: number; width: number; height: number };
  kind: StripSheetKind;
  /** The drawing's title as the sheet prints it, when it prints it as text. */
  title: string | null;
  /** On a floor plan: the apartment numbers marked on it, in order. */
  units: number[];
};

/** Clustering grid, in points: about 14 mm of paper. */
const CELL = 40;

/**
 * A permit strip cut into its drawings.
 *
 * The strip (the "גרמושקה") is a dozen or more drawings side by side on one
 * sheet, a paper's width of white between them. Everything drawn is dropped
 * onto a coarse grid — the strip's own frame lines left out, since they run
 * its whole length — and each connected patch is one drawing. The title is
 * the text line under it; a floor plan's is usually drawn in outline, not
 * text, so a floor is known by what is written on it instead: apartment
 * numbers and room names.
 */
export function splitStrip(strip: DwfGeometry): StripSheet[] {
  const cols = Math.ceil(strip.pageWidth / CELL) + 1;
  const rows = Math.ceil(strip.pageHeight / CELL) + 1;
  const grid = new Uint8Array(cols * rows);
  const frame = strip.pageWidth * 0.2;
  for (const s of [...strip.segments, ...strip.curves]) {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (length > frame) continue;
    const steps = Math.max(1, Math.ceil(length / CELL));
    for (let k = 0; k <= steps; k++) {
      const x = s.x1 + ((s.x2 - s.x1) * k) / steps;
      const y = s.y1 + ((s.y2 - s.y1) * k) / steps;
      grid[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] = 1;
    }
  }

  const seen = new Int32Array(cols * rows).fill(-1);
  const patches: Array<{ x0: number; y0: number; x1: number; y1: number; cells: number }> = [];
  for (let k = 0; k < grid.length; k++) {
    if (!grid[k] || seen[k]! >= 0) continue;
    const id = patches.length;
    const patch = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, cells: 0 };
    const stack = [k];
    seen[k] = id;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      patch.cells++;
      patch.x0 = Math.min(patch.x0, cx);
      patch.x1 = Math.max(patch.x1, cx);
      patch.y0 = Math.min(patch.y0, cy);
      patch.y1 = Math.max(patch.y1, cy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nk = ny * cols + nx;
          if (!grid[nk] || seen[nk]! >= 0) continue;
          seen[nk] = id;
          stack.push(nk);
        }
      }
    }
    patches.push(patch);
  }

  return patches
    .filter((patch) => patch.cells > 20)
    .sort((a, b) => a.x0 - b.x0)
    .map((patch) => {
      const box = {
        x: patch.x0 * CELL,
        y: patch.y0 * CELL,
        width: (patch.x1 - patch.x0 + 1) * CELL,
        height: (patch.y1 - patch.y0 + 1) * CELL,
      };
      const texts = strip.texts.filter(
        (t) => t.x >= box.x && t.x <= box.x + box.width && t.y >= box.y && t.y <= box.y + box.height + CELL * 4,
      );
      const found = titleOf(texts, box);
      const units = unitNumbers(texts);
      const kind = kindOf(found, texts, units);
      const title = kind === "form" ? null : kind === "floor" && found && !/קומ|תכנית|תוכנית/.test(found) ? null : found;
      return { box, kind, title, units };
    });
}

/** Words on one line, joined in reading order (right to left). */
function lines(texts: PlacedText[]): Array<{ y: number; height: number; text: string }> {
  const out: Array<{ y: number; height: number; words: PlacedText[] }> = [];
  for (const t of texts) {
    const line = out.find((l) => Math.abs(l.y - t.y) <= Math.max(1, t.height * 0.3) && Math.abs(l.height - t.height) < 1);
    if (line) line.words.push(t);
    else out.push({ y: t.y, height: t.height, words: [t] });
  }
  return out.map((l) => ({
    y: l.y,
    height: l.height,
    text: l.words
      .sort((a, b) => b.x - a.x)
      .map((w) => w.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
  }));
}

const TITLE = /חזית|חתך|תכנית|תוכנית|קומת|קומה|פיתוח|העמדה|מגרש|גג|מרתף|חניון/;

/** The largest line of text in the drawing's lower band that reads as a title. */
function titleOf(texts: PlacedText[], box: StripSheet["box"]): string | null {
  const band = texts.filter((t) => t.y >= box.y + box.height * 0.6);
  const candidates = lines(band)
    .filter((l) => TITLE.test(l.text) && l.text.length >= 4)
    .sort((a, b) => b.height - a.height || b.y - a.y);
  return candidates[0]?.text ?? null;
}

/**
 * The apartment numbers on a floor plan: the whole numbers set larger than
 * the room names round them. On the reference strip each typical floor
 * carries four (1–4, 5–8 … 29–32) and the top floor 33–35.
 */
function unitNumbers(texts: PlacedText[]): number[] {
  return [...new Set(unitMarks(texts).map((m) => m.unit))].sort((a, b) => a - b);
}

/**
 * Where each apartment number stands on a floor plan — the point in the flat
 * it is written in, for the floor reader to start the flat from.
 */
export function unitMarks(texts: PlacedText[]): Array<{ unit: number; x: number; y: number }> {
  const rooms = texts.filter((t) => ROOM.test(t.text));
  if (rooms.length === 0) return [];
  const roomHeight = Math.max(...rooms.map((t) => t.height));
  // Alone on its line: "דופלקס 5 חדרים" is set at the same size. A level
  // mark beside the number, "+14.75", is smaller and is not its line.
  const alone = (t: PlacedText) =>
    !texts.some(
      (o) =>
        o !== t &&
        o.text.trim() !== "" &&
        Math.abs(o.height - t.height) < t.height * 0.25 &&
        Math.abs(o.y - t.y) <= t.height * 0.3 &&
        Math.abs(o.x - t.x) < t.height * 4,
    );
  // A text's y is its baseline; the number's middle is half its height up.
  return texts
    .filter((t) => /^\d{1,3}$/.test(t.text.trim()) && t.height > roomHeight * 1.3 && t.height < roomHeight * 2.2 && alone(t))
    .map((t) => ({ unit: Number(t.text.trim()), x: t.x, y: t.y - t.height / 2 }));
}

const ROOM = /סלון|מטבח|שינה|מגורים|אוכל|רחצה|ממ"ד|ממד|מרפסת|לובי|מעלית|מדרגות/;

function kindOf(title: string | null, texts: PlacedText[], units: number[]): StripSheetKind {
  const all = texts.map((t) => t.text).join(" ");
  // A permit form carries the applicants' identity and phone numbers; it is
  // known by them, and nothing on it is used.
  if (/חוק התכנון|בקשה להיתר/.test(all) || /\b\d{9}\b|\b0\d{1,2}-\d{7}\b/.test(all)) return "form";
  if (title && /חזית/.test(title)) return "elevation";
  if (title && /חתך/.test(title)) return "section";
  if (title && /גג/.test(title)) return "roof";
  if (title && /פיתוח|העמדה/.test(title)) return "site";
  if (units.length >= 2 || texts.filter((t) => ROOM.test(t.text)).length >= 6) return "floor";
  if (/קו בניין|גבול מגרש/.test(all)) return "site";
  // The entrance floor: the building's ±0.00 and its entrances.
  if (/±0\.00/.test(all) && /כניסה/.test(all)) return "floor";
  return "other";
}
