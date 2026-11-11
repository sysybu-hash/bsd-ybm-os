import { blockKind, hatchKind, layerKind, profileFor, type CadKind } from "@/lib/projects/building/cad-layers";
import { levelValue } from "@/lib/projects/building/cad-levels";
import { dropReport, resetDrops } from "@/lib/projects/drop-log";
import { flattenDxf, IDENTITY, readDxfDrawing, type DxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";

/**
 * How much of a sheet the system read, counted off the drawing itself: per kind (layers, blocks, entities, hatches) what
 * a reader takes against what is there, and every thing left out with its count and reason. Nothing is dropped silently
 * (rule 1): a layer no reader takes, an off or frozen layer, an entity type the reader does not draw — each is listed.
 */

export const SCAN_KINDS = ["layers", "blocks", "entities", "hatches"] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];
export type ScanCount = { read: number; total: number };

export const UNREAD_REASONS = ["no_reader", "off_layer", "frozen_layer", "unsupported", "invisible", "too_dense", "other"] as const;
export type UnreadReason = (typeof UNREAD_REASONS)[number];

/** What a left-out item holds, so the list can say "120 lines, 4 texts" in any language. */
export type Holds = { lines: number; hatches: number; texts: number; arcs: number; blocks: number };
export type UnreadItem = { name: string; count: number; reason: UnreadReason; holds?: Holds };

/** What the sheet itself states, so the questions form does not ask it. */
export type ScanFacts = {
  /** Metres per drawing unit from the header's $INSUNITS; null when the header does not say. */
  headerUnitsM: number | null;
  /** Distinct level marks written with a sign (+3.20, ±0.00, −0.45), ascending, in metres. */
  levels: number[];
};

export type ScanResult = {
  counts: Record<ScanKind, ScanCount>;
  unread: UnreadItem[];
  facts: ScanFacts;
  /** The office profile the layer names matched. */
  profile: string;
};

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

const SIGNED_LEVEL = /^s*[+-±−–]s*d{1,3}[.,]d{2}s*$/;

const REASON_BY_FILTER: Array<[RegExp, UnreadReason]> = [
  [/:off-layer$/, "off_layer"],
  [/:frozen-layer$/, "frozen_layer"],
  [/:unsupported-/, "unsupported"],
  [/:invisible-entity$/, "invisible"],
  [/:hatch-(line-family-too-dense|strokes-capped)$/, "too_dense"],
];

/** "dxf-drawing:unsupported-MTEXT" → MTEXT; other filters keep their own name after the colon. */
const dropName = (filter: string) => filter.replace(/^[^:]*:/, "").replace(/^unsupported-/, "");

export type ScanOptions = {
  /** Layers the user agreed to read as a part (second round); an off or frozen layer in it is read too. */
  layerMap?: Record<string, CadKind>;
  /** How deep block references are followed; the second round goes past the reader's 8. */
  maxDepth?: number;
};

/** Reads one DXF and counts what the readers take. Null when the bytes are not a DXF the reader opens. */
export function scanDxf(input: string | Uint8Array, opts: ScanOptions = {}): ScanResult | null {
  const drawing = readDxfDrawing(input);
  return drawing ? scanDrawing(drawing, opts) : null;
}

/** The drawing with the mapped layers switched on, so the flattener emits what the user asked to read. */
export function withLayersOn(drawing: DxfDrawing, names: (name: string) => boolean): DxfDrawing {
  const layers = new Map([...drawing.layers].map(([n, l]) => [n, names(n) ? { ...l, off: false, frozen: false } : l]));
  return { ...drawing, layers };
}

export function scanDrawing(source: DxfDrawing, opts: ScanOptions = {}): ScanResult {
  const map = opts.layerMap ?? {};
  const drawing = Object.keys(map).length ? withLayersOn(source, (n) => n in map) : source;
  const profile = profileFor(drawing.layers.keys());
  // The drop log is process-wide; flattening is synchronous, so nothing else writes to it between reset and read.
  resetDrops();
  const pieces = flattenDxf(drawing, drawing.entities, { m: IDENTITY, path: [], depth: 0, maxDepth: opts.maxDepth });
  const drops = dropReport();

  const readLayer = new Map<string, boolean>();
  const isReadLayer = (layer: string) => readLayer.get(layer) ?? readLayer.set(layer, layer in map || layerKind(profile, layer) != null).get(layer)!;
  const pieceRead = (p: DxfPiece) => {
    if (isReadLayer(p.layer)) return true;
    if (p.rings && hatchKind(profile, p.pattern ?? "", p.layer) != null) return true;
    return p.path.some((b) => blockKind(profile, b, p.layer) != null);
  };

  const byLayer = new Map<string, DxfPiece[]>();
  const blocks = new Map<string, boolean>();
  let entitiesRead = 0;
  let hatches = 0;
  let hatchesRead = 0;
  for (const p of pieces) {
    (byLayer.get(p.layer) ?? byLayer.set(p.layer, []).get(p.layer)!).push(p);
    const read = pieceRead(p);
    if (read) entitiesRead++;
    if (p.rings) {
      hatches++;
      if (read) hatchesRead++;
    }
    // A block counts as read when any reader takes it, by its name or its layer.
    for (const b of p.path) blocks.set(b, (blocks.get(b) ?? false) || blockKind(profile, b, p.layer) != null || isReadLayer(p.layer));
  }

  const layerNames = [...byLayer.keys()];
  const unread: UnreadItem[] = layerNames
    .filter((l) => !isReadLayer(l))
    .map((l) => {
      const ps = byLayer.get(l)!.filter((p) => !pieceRead(p));
      return { name: l, count: ps.length, reason: "no_reader" as const, holds: holdsOf(ps) };
    })
    .filter((u) => u.count > 0);
  for (const d of drops) {
    const reason = REASON_BY_FILTER.find(([re]) => re.test(d.filter))?.[1] ?? "other";
    // An off or frozen layer is named by the layers its samples came from ("LINE on NOTES").
    const layers = reason === "off_layer" || reason === "frozen_layer" ? [...new Set(d.samples.map((x) => x.split(" on ").at(-1) ?? ""))].filter(Boolean) : [];
    unread.push({ name: layers.length ? layers.join(", ") : dropName(d.filter), count: d.count, reason });
  }
  unread.sort((a, b) => b.count - a.count);

  // Off and frozen layers hold pieces the flattener never emitted; they still belong in the totals.
  const hidden = drops.filter((d) => /:(off|frozen)-layer$/.test(d.filter)).reduce((a, d) => a + d.count, 0);
  const hiddenLayers = [...drawing.layers.values()].filter((l) => (l.off || l.frozen) && !byLayer.has(l.name)).length;
  const otherDropped = drops.filter((d) => !/:(off|frozen)-layer$/.test(d.filter) && !/hatch-/.test(d.filter)).reduce((a, d) => a + d.count, 0);

  // A level mark carries its sign; a bare "3.20" is as likely a dimension.
  const levels = new Set<number>();
  for (const p of pieces) {
    if (p.text == null || !SIGNED_LEVEL.test(p.text)) continue;
    const v = levelValue(p.text);
    if (v != null) levels.add(Math.round(v * 100) / 100);
  }

  return {
    facts: { headerUnitsM: drawing.headerUnitsM ?? null, levels: [...levels].sort((a, b) => a - b).slice(0, 200) },
    profile: profile.id,
    counts: {
      layers: { read: layerNames.filter(isReadLayer).length, total: layerNames.length + hiddenLayers },
      blocks: { read: [...blocks.values()].filter(Boolean).length, total: blocks.size },
      entities: { read: entitiesRead, total: pieces.length + hidden + otherDropped },
      hatches: { read: hatchesRead, total: hatches },
    },
    unread,
  };
}

/** Read share over all kinds' entities, 0..1; null when the sheet had nothing. */
export function readShare(counts: Record<ScanKind, ScanCount>): number | null {
  return counts.entities.total ? counts.entities.read / counts.entities.total : null;
}
