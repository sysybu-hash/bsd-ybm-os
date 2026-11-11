import sharp from "sharp";
import { chamferDistance } from "@/lib/projects/accuracy/distance-map";
import { fitModelToSheet, samplePolyline, type P2 } from "@/lib/projects/accuracy/sheet-fit";
import { paintingDrift } from "@/lib/projects/accuracy/painting-drift";
import { buildCertificate, gradeSheet } from "@/lib/projects/accuracy/certificate";
import { deviationStats, SHEET_BOUNDS_M } from "@/lib/projects/accuracy/stats";

/** Draws polylines (in metres) as 1 px ink on a w×h sheet at a given px/m, offset and rotation. */
function drawSheet(w: number, h: number, polys: P2[][], pxPerM: number, ox: number, oy: number, th = 0): Uint8Array {
  const on = new Uint8Array(w * h);
  const co = Math.cos(th);
  const si = Math.sin(th);
  for (const poly of polys) {
    for (const q of samplePolyline(poly, "x", 0.01)) {
      const x = Math.round(pxPerM * (co * q.p[0] - si * q.p[1]) + ox);
      const y = Math.round(pxPerM * (si * q.p[0] + co * q.p[1]) + oy);
      if (x >= 0 && y >= 0 && x < w && y < h) on[y * w + x] = 1;
    }
  }
  return on;
}

const rect = (x0: number, z0: number, x1: number, z1: number): P2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// an L-ish plan with inner walls, so the fit is unambiguous
const PLAN: P2[][] = [rect(0, 0, 20, 12), rect(0, 0, 8, 6), rect(8, 0, 20, 4), rect(12, 4, 20, 12)];

describe("chamferDistance", () => {
  it("measures distance to the nearest on pixel", () => {
    const on = new Uint8Array(25);
    on[12] = 1; // centre of 5×5
    const m = chamferDistance(on, 5, 5);
    expect(m.d[12]).toBe(0);
    expect(m.d[13]).toBe(1);
    expect(m.d[14]).toBe(2);
    expect(m.d[18]).toBeCloseTo(Math.SQRT2, 5);
  });
});

describe("fitModelToSheet", () => {
  const pxPerM = 1000 / 200 / 25.4 * 100; // 1:200 at 100 dpi ≈ 19.7 px/m
  const w = 520;
  const h = 360;
  const sheet = chamferDistance(drawSheet(w, h, PLAN, pxPerM, 60, 50, 0.002), w, h);

  it("finds the scale, place and a small rotation of an exact model", () => {
    const pts = PLAN.flatMap((r) => samplePolyline(r, "walls"));
    // the given scale is off by 10 %: the search must still land on 1:200
    const acc = fitModelToSheet(pts, sheet, { pxPerM: pxPerM * 1.1 });
    expect(acc.scaleDenominator(100)).toBeGreaterThan(196);
    expect(acc.scaleDenominator(100)).toBeLessThan(204);
    expect(acc.all.withinClose).toBeGreaterThan(0.97);
    expect(gradeSheet(acc.all)).toBe("pass");
  });

  it("reports a wall the model put in the wrong place, by kind", () => {
    const good = PLAN.flatMap((r) => samplePolyline(r, "shell"));
    // an inner wall 1 m off where the sheet draws it (sheet: x = 8)
    const moved = samplePolyline([[9, 6], [9, 12]], "moved wall", 0.2, false);
    const acc = fitModelToSheet([...good, ...moved], sheet, { pxPerM });
    const bad = acc.byKind.find((k) => k.kind === "moved wall")!;
    expect(bad.median).toBeGreaterThan(0.6);
    expect(bad.beyondFar).toBeGreaterThan(0.9);
    const shell = acc.byKind.find((k) => k.kind === "shell")!;
    expect(shell.withinClose).toBeGreaterThan(0.95);
  });
});

describe("paintingDrift", () => {
  async function picture(shift: number, extra = false): Promise<Buffer> {
    const lines = [
      `<rect x="${100 + shift}" y="${80 + shift}" width="300" height="200" fill="none" stroke="black" stroke-width="6"/>`,
      `<line x1="${250 + shift}" y1="${80 + shift}" x2="${250 + shift}" y2="${280 + shift}" stroke="black" stroke-width="6"/>`,
      extra ? `<line x1="415" y1="100" x2="415" y2="260" stroke="black" stroke-width="6"/><line x1="100" y1="300" x2="400" y2="300" stroke="black" stroke-width="6"/>` : "",
    ].join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="white"/>${lines}</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  it("a painting identical to its render keeps every edge", async () => {
    const r = await picture(0);
    const d = await paintingDrift(r, r);
    expect(d.kept.withinClose).toBe(1);
    expect(d.invented.beyondFar).toBe(0);
  });

  it("a painting that moved the walls is measured in pixels and in metres", async () => {
    const d = await paintingDrift(await picture(0), await picture(20), 0.05);
    // moved 20 px right and down at 640 wide = 30 px at 960
    // the nearest edge of a 6 px stroke moved 20 px is 14 px away: 21 px at 960
    expect(d.kept.median).toBeGreaterThan(15);
    expect(d.keptM!.median).toBeGreaterThan(0.6); // about 14 px × 0.05 m
    expect(d.keptM!.median).toBeLessThan(1.2);
    // the whole frame moved: undone, the geometry itself is intact
    expect(d.frameMovePx).toBeGreaterThan(30);
    expect(d.keptAligned.withinClose).toBeGreaterThan(0.9);
  });

  it("a painting that adds a structure shows it as invented, not lost", async () => {
    const d = await paintingDrift(await picture(0), await picture(0, true));
    expect(d.kept.withinClose).toBeGreaterThan(0.95);
    expect(d.inventedNear).toBeGreaterThan(0.1);
    expect(d.frameMovePx).toBeLessThan(3);
    const cert = buildCertificate([], [{ view: "x", drift: d }]);
    expect(cert.grade).not.toBe("pass");
  });
});

describe("deviationStats", () => {
  it("summarises against the bounds", () => {
    const s = deviationStats([0, 0.1, 0.2, 0.5], SHEET_BOUNDS_M);
    expect(s.n).toBe(4);
    expect(s.withinClose).toBe(0.5);
    expect(s.beyondFar).toBe(0.25);
  });
});
