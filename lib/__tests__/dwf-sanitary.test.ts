import type { DwfArc, DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { readDwfSanitary } from "@/lib/projects/dwf-sanitary";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = (72 / 25.4) * 10;
const m = (v: number) => v * UPM;
const sheet = (segments: VectorSegment[], arcs: DwfArc[]): DwfGeometry => ({
  pageWidth: m(10),
  pageHeight: m(10),
  segments,
  curves: [],
  walls: [],
  texts: [],
  fills: [],
  arcs,
});
const arc = (cx: number, cy: number, rCm: number, start: number, end: number): DwfArc => ({ cx: m(cx), cy: m(cy), r: m(rCm / 100), start, end });
/** A pan as the permit set draws it: the bowl's front end, its two long sides, the seat inside. */
const pan = (x: number, y: number): DwfArc[] => [
  arc(x, y + 0.35, 18, 0, Math.PI),
  arc(x + 0.38, y + 0.2, 56, 2.6, 3.4),
  arc(x - 0.38, y + 0.2, 56, -0.4, 0.4),
  arc(x, y + 0.3, 13, 0, 2 * Math.PI),
];
/** An ellipse in short straight strokes, as a basin is drawn. */
function ring(cx: number, cy: number, rx: number, ry: number, n = 40): VectorSegment[] {
  const out: VectorSegment[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    const b = ((i + 1) * 2 * Math.PI) / n;
    out.push({ x1: m(cx + rx * Math.cos(a)), y1: m(cy + ry * Math.sin(a)), x2: m(cx + rx * Math.cos(b)), y2: m(cy + ry * Math.sin(b)), lineWidth: 0.2 });
  }
  return out;
}
const everywhere = () => true;

describe("pans and basins as a permit plan draws them", () => {
  it("reads a cluster of arcs in a bathroom as a pan", () => {
    const f = readDwfSanitary(sheet([], pan(2, 2)), UPM, () => "bathroom", everywhere);
    expect(f).toHaveLength(1);
    expect(f[0]!.fixture).toBe("toilet");
    expect(Math.min(f[0]!.widthCm, f[0]!.depthCm)).toBeGreaterThanOrEqual(30);
  });

  it("does not read a door's swing or a lone circle as a pan", () => {
    const door = arc(2, 2, 80, 0, Math.PI / 2);
    const drum = arc(4, 4, 24, 0, 2 * Math.PI);
    expect(readDwfSanitary(sheet([], [door, drum]), UPM, () => "bathroom", everywhere)).toEqual([]);
  });

  it("reads a ring of strokes as a basin, standing in its vanity", () => {
    const vanity = { x: m(1.7), y: m(1.7), w: m(0.6), h: m(0.5) };
    const f = readDwfSanitary(sheet(ring(2, 1.95, 0.21, 0.15), []), UPM, () => "bathroom", everywhere, [vanity]);
    expect(f).toHaveLength(1);
    expect(f[0]!.fixture).toBe("basin");
    expect(Math.round(f[0]!.widthCm)).toBe(60);
  });

  it("takes the same ring in a kitchen for the sink, and a digit's small ring for nothing", () => {
    expect(readDwfSanitary(sheet(ring(2, 2, 0.21, 0.15), []), UPM, () => "kitchen", everywhere).map((p) => p.kind)).toEqual(["sink"]);
    expect(readDwfSanitary(sheet(ring(2, 2, 0.05, 0.1, 12), []), UPM, () => "bathroom", everywhere)).toEqual([]);
  });

  it("does not take a pan's own outline for a basin", () => {
    const f = readDwfSanitary(sheet(ring(2, 2.3, 0.17, 0.2), pan(2, 2)), UPM, () => "bathroom", everywhere);
    expect(f.map((p) => p.fixture)).toEqual(["toilet"]);
  });
});
