import { blockKind, CAD_PROFILES, GENERIC_CAD_PROFILE, hatchKind, layerKind, profileFor, type CadKind } from "@/lib/projects/building/cad-layers";
import { flattenDxf, IDENTITY, type DxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";
import { decodeShxHebrew } from "@/lib/projects/floorplan-dwf";
import { scanDrawing, withLayersOn, type Holds, type ScanCount, type ScanKind } from "@/lib/vmb/scan";

/**
 * The second scan: only what the first one missed, with readers the first round does not use. A suggestion is never applied
 * by itself — the user sees each layer, how many pieces it holds and why it was matched, and approves; only then is it read.
 *
 * Ways a layer is matched:
 *   hidden_layer  — switched off or frozen in the file, and its name is one the readers know;
 *   other_office  — its name follows another office's convention than the one the drawing matched;
 *   decoded_name  — its name came through in the wrong code page (DOS or Windows Hebrew) and reads once decoded;
 *   typed_hebrew  — Hebrew typed with the keyboard on Latin ("ehr" is קיר);
 *   content       — what it holds says what it is: all texts, all dimensions, hatches or blocks of a known kind.
 * Blocks nested deeper than the reader's eight levels are followed without asking: that is reading the file further, not guessing.
 */

export const DEEP_DEPTH = 16;
export const SUGGEST_VIA = ["hidden_layer", "other_office", "decoded_name", "typed_hebrew", "content"] as const;
export type SuggestVia = (typeof SUGGEST_VIA)[number];

export type LayerSuggestion = {
  layer: string;
  kind: CadKind;
  via: SuggestVia;
  pieces: number;
  holds: Holds;
  /** The name as it reads after decoding, when that is how it was matched. */
  readsAs?: string;
};

export type RescanPreview = {
  suggestions: LayerSuggestion[];
  before: Record<ScanKind, ScanCount>;
  /** The counts if every suggestion is approved. */
  after: Record<ScanKind, ScanCount>;
  /** Entities found only by following blocks deeper. */
  deeper: number;
};

/** cp1252's characters for bytes 0x80–0x9F, back to their bytes. */
const CP1252_BACK: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a,
};

/**
 * A layer name whose Hebrew came through as Latin-1 junk, back into Hebrew. DOS Hebrew (cp862) puts א–ת on bytes 0x80–0x9A,
 * which arrive as raw C1 characters or as cp1252's punctuation; Windows Hebrew (cp1255) puts them on 0xE0–0xFA, which
 * arrive as à–ú. Null when the name holds neither.
 */
export function decodeLayerName(name: string): string | null {
  let changed = false;
  const out = [...name]
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      const byte = CP1252_BACK[ch] ?? (code >= 0x80 && code <= 0x9a ? code : null);
      if (byte != null) {
        changed = true;
        return String.fromCodePoint(0x5d0 + byte - 0x80);
      }
      if (code >= 0xe0 && code <= 0xfa) {
        changed = true;
        return String.fromCodePoint(0x5d0 + code - 0xe0);
      }
      return ch;
    })
    .join("");
  return changed ? out : null;
}

const PROFILES = [...CAD_PROFILES, GENERIC_CAD_PROFILE];
const useful = (k: CadKind | null): k is CadKind => k != null && k !== "ignore" && k !== "group";
const byNames = (name: string): CadKind | null => PROFILES.map((p) => layerKind(p, name)).find(useful) ?? null;

const holdsOf = (pieces: DxfPiece[]): Holds => {
  const h: Holds = { lines: 0, hatches: 0, texts: 0, arcs: 0, blocks: 0 };
  for (const p of pieces) {
    if (p.text != null) h.texts++;
    else if (p.rings) h.hatches++;
    else if (p.arc || p.circle) h.arcs++;
    else if (p.insert) h.blocks++;
    else if (p.pts) h.lines++;
  }
  return h;
};

/** What a layer holds says what it is, when nearly all of it agrees. */
function byContent(pieces: DxfPiece[]): CadKind | null {
  const n = pieces.length;
  if (!n) return null;
  const share = (f: (p: DxfPiece) => boolean) => pieces.filter(f).length / n;
  if (share((p) => !!p.dimension || p.path.some((b) => b.startsWith("*D"))) >= 0.9) return "dimension";
  if (share((p) => p.text != null) >= 0.9) return "text";
  const votes = new Map<CadKind, number>();
  for (const p of pieces) {
    const k = p.rings ? PROFILES.map((pr) => hatchKind(pr, p.pattern ?? "", "")).find(useful) : PROFILES.flatMap((pr) => p.path.map((b) => blockKind(pr, b, ""))).find(useful);
    if (k) votes.set(k, (votes.get(k) ?? 0) + 1);
  }
  const [best] = [...votes].sort((a, b) => b[1] - a[1]);
  return best && best[1] / n >= 0.6 ? best[0] : null;
}

/** Every layer the first round did not read, with the kind the second round's readers find for it. */
export function suggestLayers(drawing: DxfDrawing): LayerSuggestion[] {
  const profile = profileFor(drawing.layers.keys());
  const all = withLayersOn(drawing, () => true);
  const pieces = flattenDxf(all, all.entities, { m: IDENTITY, path: [], depth: 0, maxDepth: DEEP_DEPTH });
  const byLayer = new Map<string, DxfPiece[]>();
  for (const p of pieces) (byLayer.get(p.layer) ?? byLayer.set(p.layer, []).get(p.layer)!).push(p);

  const out: LayerSuggestion[] = [];
  for (const [layer, ps] of byLayer) {
    const own = layerKind(profile, layer);
    const def = drawing.layers.get(layer);
    const hidden = !!def && (def.off || def.frozen);
    if (own != null && !hidden) continue;
    const base = { layer, pieces: ps.length, holds: holdsOf(ps) };
    if (hidden && useful(own)) {
      out.push({ ...base, kind: own, via: "hidden_layer" });
      continue;
    }
    const other = byNames(layer);
    if (other) {
      out.push({ ...base, kind: other, via: "other_office" });
      continue;
    }
    const decoded = decodeLayerName(layer);
    const viaDecoded = decoded ? byNames(decoded) : null;
    if (decoded && viaDecoded) {
      out.push({ ...base, kind: viaDecoded, via: "decoded_name", readsAs: decoded });
      continue;
    }
    if (/^[a-z;,./ -]{2,}$/.test(layer)) {
      const typed = decodeShxHebrew(layer);
      const viaTyped = byNames(typed);
      if (viaTyped) {
        out.push({ ...base, kind: viaTyped, via: "typed_hebrew", readsAs: typed });
        continue;
      }
    }
    const content = byContent(ps);
    if (content) out.push({ ...base, kind: content, via: "content" });
  }
  return out.sort((a, b) => b.pieces - a.pieces);
}

/** What the second round would find: the suggestions, and the counts before and with all of them approved. */
export function previewRescan(drawing: DxfDrawing): RescanPreview {
  const before = scanDrawing(drawing).counts;
  const deep = scanDrawing(drawing, { maxDepth: DEEP_DEPTH }).counts;
  const suggestions = suggestLayers(drawing);
  const after = scanDrawing(drawing, { maxDepth: DEEP_DEPTH, layerMap: Object.fromEntries(suggestions.map((s) => [s.layer, s.kind])) }).counts;
  return { suggestions, before, after, deeper: Math.max(0, deep.entities.read - before.entities.read) };
}
