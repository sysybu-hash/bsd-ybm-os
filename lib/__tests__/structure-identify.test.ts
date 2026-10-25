// The identify step must call no model: any paid client constructed fails the test.
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(() => {
    throw new Error("identify called Gemini");
  }),
}));
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(() => {
    throw new Error("identify called Gemini");
  }),
}));
jest.mock("@/lib/ai-usage", () => ({
  ...jest.requireActual("@/lib/ai-usage"),
  recordAiUsage: jest.fn(() => {
    throw new Error("identify recorded a paid call");
  }),
}));

import { identifyStructure } from "@/lib/projects/structure/identify";
import { structureReportSchema } from "@/lib/validation/schemas/floorplan-structure";

/** A DXF of AutoCAD 2018, whose text is UTF-8 (an older one is in its code page). */
function dxf(...entities: Array<Array<string | number>>): string {
  return [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1032", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...entities.flatMap((e) => e.map(String)),
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
}
const line = (layer: string, x1: number, y1: number, x2: number, y2: number) =>
  ["0", "LINE", "8", layer, "10", x1, "20", y1, "11", x2, "21", y2];
const text = (value: string, x: number, y: number) => ["0", "TEXT", "8", "ROOM-NAMES", "10", x, "20", y, "40", 0.2, "1", value];
const door = (cx: number, cy: number, r: number) => [
  "0", "ARC", "8", "A-DOOR", "10", cx, "20", cy, "40", r, "50", 0, "51", 90,
  ...line("A-DOOR", cx, cy, cx, cy + r),
];
/** A room's walls, both faces 0.2 m apart, with a doorway left in the south wall. */
function room(x: number, y: number, w: number, h: number): Array<Array<string | number>> {
  const t = 0.2;
  return [
    line("A-WALL", x, y, x + 1, y), line("A-WALL", x + 2, y, x + w, y),
    line("A-WALL", x, y - t, x + 1, y - t), line("A-WALL", x + 2, y - t, x + w, y - t),
    line("A-WALL", x + w, y, x + w, y + h), line("A-WALL", x + w + t, y, x + w + t, y + h),
    line("A-WALL", x + w, y + h, x, y + h), line("A-WALL", x + w, y + h + t, x, y + h + t),
    line("A-WALL", x, y + h, x, y), line("A-WALL", x - t, y + h, x - t, y),
  ];
}

describe("identifyStructure", () => {
  it("reads a flat from a DXF that names its bedrooms, with a preview, and calls no model", async () => {
    const source = dxf(
      ...room(0, 0, 4, 3),
      ...room(4.2, 0, 3, 3),
      door(1, 0, 0.9),
      door(5.2, 0, 0.9),
      text("חדר שינה", 1.5, 1.5),
      text("ממ\"ד", 5.5, 1.5),
    );
    const report = await identifyStructure([{ name: "flat.dxf", bytes: Buffer.from(source) }]);
    expect(structureReportSchema.safeParse(report).success).toBe(true);
    expect(report.file.kind).toBe("dxf");
    expect(report.structure).toBe("apartment");
    expect(report.plans.length).toBeGreaterThan(0);
    expect(report.plans[0]!.preview?.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("refuses a photograph before anything is read off it", async () => {
    const sharp = (await import("sharp")).default;
    // Noise reads as a photograph, not paper.
    const pixels = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 97) % 251));
    const jpeg = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).jpeg().toBuffer();
    const report = await identifyStructure([{ name: "photo.jpg", bytes: jpeg }]);
    expect(report.file.kind).toBe("image");
    expect(report.blockers.length).toBe(1);
  });

  it("leaves a DWG for the person to name, without converting it", async () => {
    const report = await identifyStructure([{ name: "plan.dwg", bytes: Buffer.from("AC1032" + "\0".repeat(64)) }]);
    expect(report.file.kind).toBe("dwg");
    expect(report.sure).toBe(false);
    expect(report.blockers).toEqual([]);
  });
});
