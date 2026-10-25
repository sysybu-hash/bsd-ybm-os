import { GOTTLIEB_ARCHITECT_PROFILE, profileFor } from "@/lib/projects/building/cad-layers";
import { dxfFacades, dxfSheets, houseInventory, modelOf, POCHE_PEN, readDxfHouse, sheetGeometryFromDxf, storeyOf } from "@/lib/projects/building/dxf-house";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { cleanDxfText, fillTriangles, flattenDxf, readDxfDrawing, type Pt } from "@/lib/projects/dxf-drawing";

/** A record as DXF group-code pairs. */
const rec = (...pairs: Array<[number, string | number]>) => pairs.map(([c, v]) => `${c}\n${v}`).join("\n");
const rect = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const hatch = (layer: string, aci: number, pattern: string, solid: boolean, ring: Array<[number, number]>, lines: Array<[number, number]> = []) =>
  rec(
    [0, "HATCH"],
    [8, layer],
    [62, aci],
    [2, pattern],
    [70, solid ? 1 : 0],
    [91, 1],
    [92, 2],
    [72, 0],
    [73, 1],
    [93, ring.length],
    ...ring.flatMap(([x, y]): Array<[number, number]> => [
      [10, x],
      [20, y],
    ]),
    [97, 0],
    ...(solid
      ? []
      : ([[78, lines.length], ...lines.flatMap(([angle, spacing]) => {
          const a = (angle * Math.PI) / 180;
          return [[53, angle], [43, 0], [44, 0], [45, -Math.sin(a) * spacing], [46, Math.cos(a) * spacing], [79, 0]] as Array<[number, number]>;
        })] as Array<[number, number]>)),
  );

/** A Gottlieb-like ground floor: every layer flagged off, a wall's solid fill on 00-hatch, a lawn, a door in a group block, Hebrew in ANSI_1255 and in an SHX font, one layout tab. */
function sampleDxf(): Uint8Array {
  const layers = [
    ["0", 7],
    ["00-WL", 1],
    ["00-WL pnimi", 3],
    ["00-dor", 2],
    ["00-win", 4],
    ["00-madregot", 6],
    ["00-mabat", 30],
    ["00-hatch", 9],
    ["00-m-yarok", 3],
    ["00-text", 7],
  ] as const;
  const text = [
    rec([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1015"], [9, "$DWGCODEPAGE"], [3, "ANSI_1255"], [9, "$INSUNITS"], [70, 4]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "TABLES"]),
    ...layers.map(([name, aci]) => rec([0, "LAYER"], [2, name], [70, 0], [62, -aci])),
    rec([0, "STYLE"], [2, "HEB"], [3, "hebs.shx"], [4, ""]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "BLOCKS"]),
    rec([0, "BLOCK"], [2, "00-delet 80"], [10, 0], [20, 0], [330, "1A"]),
    rec([0, "ARC"], [8, "0"], [10, 0], [20, 0], [40, 80], [50, 0], [51, 90]),
    rec([0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 0], [21, 80]),
    rec([0, "ENDBLK"]),
    rec([0, "BLOCK"], [2, "add on"], [10, 0], [20, 0], [330, "1B"]),
    rec([0, "INSERT"], [8, "00-dor"], [2, "00-delet 80"], [10, 10], [20, 0], [50, 90]),
    rec([0, "ENDBLK"]),
    rec([0, "BLOCK"], [2, "*Paper_Space0"], [10, 0], [20, 0], [330, "1F"]),
    rec([0, "ENDBLK"]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "ENTITIES"]),
    hatch("00-hatch", 9, "SOLID", true, rect(0, 0, 400, 20)),
    hatch("00-m-yarok", 3, "GRASS", false, rect(0, 100, 100, 200), [[45, 10]]),
    rec([0, "INSERT"], [8, "0"], [2, "add on"], [10, 200], [20, 100]),
    rec([0, "TEXT"], [8, "00-text"], [10, 50], [20, 50], [40, 20], [1, "סלון"]),
    rec([0, "TEXT"], [8, "00-text"], [10, 50], [20, 20], [40, 15], [1, "4.95*4.95"]),
    rec([0, "TEXT"], [8, "00-text"], [7, "HEB"], [10, 300], [20, 50], [40, 20], [1, "nycj cz w"]),
    rec([0, "LINE"], [8, "00-WL"], [10, 0], [20, 0], [11, 400], [21, 0]),
    rec([0, "VIEWPORT"], [67, 1], [330, "1F"], [10, 148], [20, 105], [40, 297], [41, 210], [12, 200], [22, 100], [45, 300], [69, 2]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "OBJECTS"]),
    rec([0, "LAYOUT"], [100, "AcDbPlotSettings"], [1, "A3 setup"], [100, "AcDbLayout"], [1, "A_קומת קרקע"], [70, 1], [330, "1F"]),
    rec([0, "ENDSEC"]),
    rec([0, "EOF"]),
  ].join("\n");
  // The Hebrew block of Windows-1255: א..ת at 0xE0..0xFA.
  return ansi1255(text);
}

/** The Hebrew block of Windows-1255: א..ת at 0xE0..0xFA. */
const ansi1255 = (text: string) =>
  Uint8Array.from([...text].map((ch) => {
    const c = ch.charCodeAt(0);
    return c >= 0x5d0 && c <= 0x5ea ? c - 0x5d0 + 0xe0 : c;
  }));

/**
 * Two 16 m facades in model space, far out on a grid, no layout: each a box
 * over its title, the plot's line drawn up past its roof, and a level's
 * lettering beside it. The right one is written first.
 */
function facadesDxf(): Uint8Array {
  const X = 24_800_000;
  const facade = (x0: number, title: string) => [
    rec([0, "TEXT"], [8, "00-text"], [10, x0 + 800], [20, 0], [40, 30], [1, title]),
    ...[
      [x0, 100, x0 + 1600, 100],
      [x0 + 1600, 100, x0 + 1600, 800],
      [x0 + 1600, 800, x0, 800],
      [x0, 800, x0, 100],
    ].map(([x1, y1, x2, y2]) => rec([0, "LINE"], [8, "00-WL"], [10, x1!], [20, y1!], [11, x2!], [21, y2!])),
    rec([0, "INSERT"], [8, "00-m-cahol"], [2, "gvul migrash"], [10, x0 - 300], [20, -50]),
    rec([0, "TEXT"], [8, "00-text"], [10, x0 + 1700], [20, 400], [40, 15], [1, "+2.97"]),
  ];
  const text = [
    rec([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1015"], [9, "$DWGCODEPAGE"], [3, "ANSI_1255"], [9, "$INSUNITS"], [70, 5]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "TABLES"]),
    ...["0", "00-WL", "00-text", "00-m-cahol"].map((name) => rec([0, "LAYER"], [2, name], [70, 0], [62, 7])),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "BLOCKS"]),
    rec([0, "BLOCK"], [2, "gvul migrash"], [10, 0], [20, 0]),
    rec([0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 0], [21, 1100]),
    rec([0, "ENDBLK"]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "ENTITIES"]),
    ...facade(X + 4000, "חזית צפונית / 1:100"),
    ...facade(X, "חזית מזרחית / 1:100"),
    rec([0, "ENDSEC"]),
    rec([0, "EOF"]),
  ].join("\n");
  return ansi1255(text);
}

describe("dxf-drawing: the reader", () => {
  const drawing = readDxfDrawing(sampleDxf())!;
  const pieces = flattenDxf(drawing);

  it("reads the header, decodes ANSI_1255, and ignores an 'off' flag every layer carries", () => {
    expect(drawing.version).toBe("AC1015");
    expect(drawing.codepage).toBe("ANSI_1255");
    expect([...drawing.layers.values()].every((l) => !l.off)).toBe(true);
    expect(pieces.some((p) => p.text === "סלון")).toBe(true);
  });

  it("decodes an SHX-Hebrew label off its Latin keys, the W key as a geresh", () => {
    expect(pieces.some((p) => p.text === "מטבח בז '")).toBe(true);
    expect(cleanDxfText("{\\fArial|b0;\\C1;סלון}", "MTEXT", "")).toBe("סלון");
    expect(cleanDxfText("%%c50", "TEXT", "")).toBe("⌀50");
  });

  it("expands a block in a block, a layer-0 piece taking its reference's layer", () => {
    const arc = pieces.find((p) => p.arc)!;
    expect(arc.path).toEqual(["add on", "00-delet 80"]);
    expect(arc.layer).toBe("00-dor");
    expect(arc.arc!.r).toBeCloseTo(80);
    expect(arc.arc!.c.x).toBeCloseTo(210);
    expect(arc.arc!.c.y).toBeCloseTo(100);
  });

  it("fills a solid hatch exactly and strokes a pattern hatch inside its boundary", () => {
    const solid = pieces.find((p) => p.solid && p.layer === "00-hatch")!;
    const area = fillTriangles(solid.rings!).reduce((s, [a, b, c]) => s + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2, 0);
    expect(area).toBeCloseTo(400 * 20);
    const lawn = pieces.find((p) => p.pattern === "GRASS")!;
    expect(lawn.solid).toBe(false);
    expect(lawn.strokes!.length).toBeGreaterThan(10);
    const inside = (p: Pt) => p.x >= -1e-6 && p.x <= 100 + 1e-6 && p.y >= 100 - 1e-6 && p.y <= 200 + 1e-6;
    expect(lawn.strokes!.every(([a, b]) => inside(a) && inside(b))).toBe(true);
  });

  it("reads a layout tab's name and its viewport's window on model space", () => {
    expect(drawing.layouts).toHaveLength(1);
    const [layout] = drawing.layouts;
    expect(layout!.name).toBe("A_קומת קרקע");
    expect(layout!.viewports[0]!.centre).toEqual({ x: 200, y: 100 });
    expect(layout!.viewports[0]!.height).toBe(300);
    expect(layout!.viewports[0]!.width).toBeCloseTo((300 * 297) / 210);
  });
});

describe("dxf-house: sheets, inventory and plotted geometry", () => {
  const drawing = readDxfDrawing(sampleDxf())!;

  it("names a sheet's model and storey from its tab", () => {
    expect(storeyOf("A_קומת קרקע")).toBe(0);
    expect(storeyOf("B_קומה א")).toBe(1);
    expect(storeyOf("C - גג")).toBe("roof");
    expect(modelOf("A_קומת קרקע")).toBe("A");
    const sheets = dxfSheets(drawing);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ name: "A_קומת קרקע", model: "A", storey: 0 });
  });

  it("knows the office by its layers, and the units by its doors rather than a wrong header", () => {
    expect(profileFor(drawing.layers.keys()).id).toBe(GOTTLIEB_ARCHITECT_PROFILE.id);
    const inv = houseInventory(drawing, dxfSheets(drawing)[0]!);
    expect(drawing.headerUnitsM).toBe(0.001);
    expect(inv.unitsM).toBe(0.01);
    expect(inv.counts.doors).toBe(1);
    expect(inv.counts.doorWidths).toEqual({ "80": 1 });
    expect(inv.doors[0]!.group).toBe("add on");
    expect(inv.walls.some((w) => w.kind === "hatch" && Math.abs(w.areaM2 - 0.8) < 1e-6)).toBe(true);
    expect(inv.counts.lawnM2).toBe(1);
    expect(inv.rooms).toContainEqual(expect.objectContaining({ name: "סלון", dims: "4.95*4.95", statedM2: 24.5 }));
  });

  it("plots the sheet as a DWF would: poché grey for walls, heavy black wall faces, door swings as arcs", () => {
    const g = sheetGeometryFromDxf(drawing, dxfSheets(drawing)[0]!);
    const upm = DWF_FLOOR_UNITS_PER_METRE;
    expect(g.fillPens!.length).toBe(g.fills.length);
    expect(g.fillPens!.some((p) => p === POCHE_PEN)).toBe(true);
    const face = g.segments.find((s) => s.stroke === 0 && s.lineWidth >= 1 && Math.abs(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm - 4) < 1e-6);
    expect(face).toBeDefined();
    const swing = g.arcs.find((a) => Math.abs(a.r / upm - 0.8) < 1e-6)!;
    expect(swing.end - swing.start).toBeCloseTo(Math.PI / 2);
    expect(g.texts.some((t) => t.text === "סלון")).toBe(true);
  });

  it("reads a whole file and picks sheets", () => {
    const house = readDxfHouse(sampleDxf(), { pick: (s) => s.model === "A" })!;
    expect(house.profile.id).toBe(GOTTLIEB_ARCHITECT_PROFILE.id);
    expect(house.sheets.map((s) => s.name)).toEqual(["A_קומת קרקע"]);
    expect(readDxfHouse(sampleDxf(), { pick: (s) => s.model === "B" })!.sheets).toHaveLength(0);
    expect(readDxfHouse("not a drawing")).toBeNull();
  });
});

describe("dxf-house: a facades file's elevations", () => {
  const drawing = readDxfDrawing(facadesDxf())!;
  const facades = dxfFacades(drawing);
  const upm = DWF_FLOOR_UNITS_PER_METRE;

  it("finds each elevation by its title on the grid, left to right, though no sheet frames it", () => {
    expect(readDxfHouse(facadesDxf())!.sheets).toHaveLength(0);
    expect(facades.map((f) => f.title)).toEqual(["חזית מזרחית / 1:100", "חזית צפונית / 1:100"]);
  });

  it("reads the house's outline without the plot's line, and still shows that line", () => {
    for (const { geometry: g } of facades) {
      const xs = g.segments.flatMap((s) => [s.x1, s.x2]);
      expect((Math.max(...xs) - Math.min(...xs)) / upm).toBeCloseTo(16);
      const tall = (y1: number, y2: number) => Math.abs(y2 - y1) / upm > 10;
      expect(g.segments.some((s) => tall(s.y1, s.y2))).toBe(false);
      expect(g.display!.lines.some((l) => tall(l.y1, l.y2))).toBe(true);
    }
  });

  it("shows a level's lettering and does not read it as a mark", () => {
    for (const { geometry: g } of facades) {
      expect(g.texts.some((t) => t.text.includes("2.97"))).toBe(false);
      expect(g.display!.texts!.map((t) => t.text)).toEqual(["+2.97"]);
    }
  });
});
