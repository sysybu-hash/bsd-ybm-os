import { collinearRuns } from "@/lib/projects/floorplan-segment";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const seg = (x1: number, y1: number, x2: number, y2: number, lineWidth = 4): VectorSegment => ({
  x1,
  y1,
  x2,
  y2,
  lineWidth,
});

describe("a dimension chain as the line its figures make", () => {
  it("joins figures that continue one another end to end", () => {
    // "364" and "263" of one chain, with a tick between them.
    const a = seg(593, 811, 788, 811);
    const tick = seg(785, 811, 808, 811);
    const b = seg(805, 811, 943, 811);
    const runs = collinearRuns([a, tick, b], 3);
    expect(runs.get(a)).toMatchObject({ x1: 593, x2: 943, y1: 811, y2: 811 });
    expect(runs.get(b)).toBe(runs.get(a));
  });

  it("keeps apart lines with a gap, another pen or another line between them", () => {
    const a = seg(0, 100, 100, 100);
    const far = seg(150, 100, 250, 100);
    const thin = seg(100, 100, 150, 100, 1);
    const below = seg(100, 110, 150, 110);
    const runs = collinearRuns([a, far, thin, below], 3);
    expect(runs.get(a)).toBe(a);
    expect(runs.get(far)).toBe(far);
  });

  it("joins vertical figures the same way", () => {
    const a = seg(741, 700, 741, 900);
    const b = seg(741, 901, 741, 1100);
    expect(collinearRuns([a, b], 3).get(a)).toMatchObject({ y1: 700, y2: 1100, x1: 741, x2: 741 });
  });
});
