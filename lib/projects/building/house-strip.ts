import { sheetLevel } from "@/lib/projects/building/from-dwf-sheet";
import { sheetGeometry, type DwfGeometry, type PlacedText } from "@/lib/projects/floorplan-dwf";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/** Paper left between two drawings so the strip reader keeps them apart. */
const GAP = 1400;

function shiftSeg(s: VectorSegment, dx: number, dy: number): VectorSegment {
  return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
}

function shiftGeometry(g: DwfGeometry, dx: number, dy: number): DwfGeometry {
  return {
    ...g,
    segments: g.segments.map((s) => shiftSeg(s, dx, dy)),
    curves: g.curves.map((s) => shiftSeg(s, dx, dy)),
    walls: g.walls.map((s) => shiftSeg(s, dx, dy)),
    texts: g.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })),
    fills: g.fills.map((poly) => poly.map(([x, y]) => [x + dx, y + dy] as [number, number])),
    arcs: g.arcs.map((a) => ({ ...a, cx: a.cx + dx, cy: a.cy + dy })),
    ...(g.furniture ? { furniture: g.furniture.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) } : {}),
    ...(g.wallPen != null ? { wallPen: g.wallPen } : {}),
    ...(g.doorsDrawn ? { doorsDrawn: g.doorsDrawn.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })) } : {}),
    ...(g.stairLines ? { stairLines: g.stairLines.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })) } : {}),
    ...(g.walkLines ? { walkLines: g.walkLines.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })) } : {}),
    ...(g.plotDrawn ? { plotDrawn: { x0: g.plotDrawn.x0 + dx, y0: g.plotDrawn.y0 + dy, x1: g.plotDrawn.x1 + dx, y1: g.plotDrawn.y1 + dy } } : {}),
    ...(g.parkingDrawn ? { parkingDrawn: g.parkingDrawn.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) } : {}),
    ...(g.wallLines ? { wallLines: g.wallLines.map((s) => ({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy })) } : {}),
    ...(g.windowsDrawn ? { windowsDrawn: g.windowsDrawn.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) } : {}),
    ...(g.roomsDrawn ? { roomsDrawn: g.roomsDrawn.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })) } : {}),
    ...(g.zones ? { zones: g.zones.map((z) => ({ ...z, ring: z.ring.map(([x, y]) => [x + dx, y + dy] as [number, number]) })) } : {}),
    ...(g.display
      ? {
          display: {
            lines: g.display.lines.map((l) => ({ ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy })),
            fills: g.display.fills.map((f) => ({ ...f, pts: f.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) })),
            ...(g.display.texts ? { texts: g.display.texts.map((t) => ({ ...t, x: t.x + dx, y: t.y + dy })) } : {}),
          },
        }
      : {}),
  };
}

function blank(): DwfGeometry {
  return { pageWidth: 0, pageHeight: 0, segments: [], curves: [], walls: [], texts: [], fills: [], arcs: [] };
}

/**
 * A sheet of drawings stacked one above another, cut apart at the blank
 * bands between them, top to bottom.
 */
export function splitDrawings(g: DwfGeometry, minGap = 15): DwfGeometry[] {
  const step = 5;
  const rows = Math.ceil(g.pageHeight / step) + 1;
  const used = new Uint8Array(rows);
  for (const s of g.segments) {
    const a = Math.max(0, Math.floor(Math.min(s.y1, s.y2) / step));
    const b = Math.min(rows - 1, Math.floor(Math.max(s.y1, s.y2) / step));
    for (let r = a; r <= b; r++) used[r] = 1;
  }
  const bands: Array<[number, number]> = [];
  let start = -1;
  let blank = 0;
  for (let r = 0; r <= rows; r++) {
    const on = r < rows && used[r] === 1;
    if (on) {
      if (start < 0) start = r;
      blank = 0;
    } else if (start >= 0 && ++blank * step >= minGap) {
      bands.push([start * step, (r - blank + 1) * step]);
      start = -1;
      blank = 0;
    }
  }
  if (start >= 0) bands.push([start * step, g.pageHeight]);
  return bands.map(([y0, y1]) => sheetGeometry(g, { x: 0, y: Math.max(0, y0 - 4), width: g.pageWidth, height: y1 - y0 + 8 }));
}

/**
 * One house's floors, side by side, with its elevations after them.
 *
 * A private house arrives as a file a floor, not as one permit strip. Laid
 * out here they are one strip: each floor keeps the level it was given when
 * the sheet itself marks none, and the elevations stay drawings the facade
 * reader can find.
 */
export function stackHouseGeometries(
  floors: Array<{ geometry: DwfGeometry; levelM: number }>,
  facades?: DwfGeometry | Array<{ geometry: DwfGeometry; title: string }>,
): DwfGeometry {
  const placed: DwfGeometry[] = [];
  const forced: NonNullable<DwfGeometry["forcedSheets"]> = [];
  let x = 0;
  let height = 0;
  for (const floor of floors) {
    const shifted = shiftGeometry(floor.geometry, x, 0);
    if (sheetLevel(shifted) == null) {
      const mark: PlacedText = { x: x + 80, y: 80, text: `+${floor.levelM.toFixed(2)}`, height: 14 };
      shifted.texts = [...shifted.texts, mark];
    }
    placed.push(shifted);
    if (floor.geometry.singleSheet) forced.push({ x, y: 0, width: floor.geometry.pageWidth, height: floor.geometry.pageHeight, kind: "floor", level: floor.levelM });
    x += floor.geometry.pageWidth + GAP;
    height = Math.max(height, floor.geometry.pageHeight);
  }
  if (Array.isArray(facades)) {
    // Each elevation on its own, titled as a strip titles it, so the strip
    // reader knows which face it draws.
    for (const { geometry, title } of facades) {
      const shifted = shiftGeometry(geometry, x, 0);
      shifted.texts = [...shifted.texts, { x: x + geometry.pageWidth / 2, y: geometry.pageHeight - 6, text: title, height: 20 }];
      placed.push(shifted);
      x += geometry.pageWidth + GAP;
      height = Math.max(height, geometry.pageHeight);
    }
  } else if (facades) {
    placed.push(shiftGeometry(facades, x, 0));
    x += facades.pageWidth;
    height = Math.max(height, facades.pageHeight);
  }
  // A sheet carries hundreds of thousands of segments: spreading them into
  // push() overflows the stack.
  const out: DwfGeometry = {
    ...blank(),
    pageWidth: Math.max(x, 1),
    pageHeight: Math.max(height, 1),
    segments: placed.flatMap((g) => g.segments),
    curves: placed.flatMap((g) => g.curves),
    walls: placed.flatMap((g) => g.walls),
    texts: placed.flatMap((g) => g.texts),
    fills: placed.flatMap((g) => g.fills),
    arcs: placed.flatMap((g) => g.arcs),
  };
  if (forced.length) out.forcedSheets = forced;
  if (placed.some((g) => g.furniture)) out.furniture = placed.flatMap((g) => g.furniture ?? []);
  // Stacked with a DWF's sheets (the facades), the CAD floors keep their walls' pen: dropped for the
  // whole strip, Gottlieb C's floors fell back to the strip reader and lost a bedroom's walls (13/10/2026).
  const pens = [...new Set(placed.flatMap((g) => (g.wallPen != null ? [g.wallPen] : [])))];
  if (pens.length === 1) out.wallPen = pens[0];
  if (placed.some((g) => g.doorsDrawn)) out.doorsDrawn = placed.flatMap((g) => g.doorsDrawn ?? []);
  if (placed.some((g) => g.stairLines)) out.stairLines = placed.flatMap((g) => g.stairLines ?? []);
  if (placed.some((g) => g.walkLines)) out.walkLines = placed.flatMap((g) => g.walkLines ?? []);
  const plotted = placed.find((g) => g.plotDrawn);
  if (plotted) out.plotDrawn = plotted.plotDrawn;
  if (placed.some((g) => g.parkingDrawn)) out.parkingDrawn = placed.flatMap((g) => g.parkingDrawn ?? []);
  if (placed.some((g) => g.wallLines)) out.wallLines = placed.flatMap((g) => g.wallLines ?? []);
  if (placed.some((g) => g.windowsDrawn)) out.windowsDrawn = placed.flatMap((g) => g.windowsDrawn ?? []);
  if (placed.some((g) => g.roomsDrawn)) out.roomsDrawn = placed.flatMap((g) => g.roomsDrawn ?? []);
  if (placed.some((g) => g.zones)) out.zones = placed.flatMap((g) => g.zones ?? []);
  if (placed.some((g) => g.display)) {
    out.display = { lines: placed.flatMap((g) => g.display?.lines ?? []), fills: placed.flatMap((g) => g.display?.fills ?? []) };
    if (placed.some((g) => g.display?.texts)) out.display.texts = placed.flatMap((g) => g.display?.texts ?? []);
  }
  if (placed.every((g) => g.fillPens && g.fillPens.length === g.fills.length)) {
    out.fillPens = placed.flatMap((g) => g.fillPens!);
  }
  return out;
}
