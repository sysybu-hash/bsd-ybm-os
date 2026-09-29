import { decodeShxHebrew, geometryFromDwf, geometryFromW2d, sheetGeometry } from "@/lib/projects/floorplan-dwf";
import { readZipEntries } from "@/lib/projects/floorplan-zip";

/** A W2D stream: the header AutoCAD writes, then binary opcodes. */
function w2d(ops: Buffer[]): Buffer {
  // 1 logical unit = 1 mm of paper.
  const header = Buffer.from("(W2D V06.00)(PlotInfo show 0 mm 100 100 0 0 100 100 ((1 0 0)(0 1 0)(0 0 1)))", "latin1");
  return Buffer.concat([header, ...ops]);
}
const i16 = (...v: number[]) => {
  const b = Buffer.alloc(v.length * 2);
  v.forEach((n, k) => b.writeInt16LE(n, k * 2));
  return b;
};
const i32 = (...v: number[]) => {
  const b = Buffer.alloc(v.length * 4);
  v.forEach((n, k) => b.writeInt32LE(n, k * 4));
  return b;
};
const u16 = (...v: number[]) => {
  const b = Buffer.alloc(v.length * 2);
  v.forEach((n, k) => b.writeUInt16LE(n, k * 2));
  return b;
};
const op = (code: number, ...parts: Buffer[]) => Buffer.concat([Buffer.from([code]), ...parts]);

/** A ZIP of stored entries, with a preamble ahead of it as a DWF has. */
function dwf(files: Record<string, Buffer>): Buffer {
  const preamble = Buffer.from("(DWF V06.00)", "latin1");
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([preamble, ...locals, cd, end]);
}

const stream = w2d([
  // A 32-bit line from (0,0) to (1000,0), then a 16-bit line on from there.
  op(0x6c, i32(0, 0, 1000, 0)),
  op(0x0c, i16(0, 0, 0, 500)),
  // A polyline of three points, 16-bit relative.
  op(0x10, Buffer.from([3]), i16(-1000, 0, 0, -500, 200, 0)),
  // A quarter arc, radius 100, about the current point.
  op(0x92, i32(0, 0), Buffer.from([100, 0, 0, 0]), u16(0, 16384)),
  // A Hebrew SHX font, 25 units high, and the text "ra," set in it.
  op(0x06, u16(0x21), Buffer.from("'Revit_HEB_SHX'", "latin1"), i32(25)),
  op(0x78, i32(0, 0), Buffer.from("'ra,'", "latin1")),
]);

describe("reading a W2D stream", () => {
  it("draws its lines, polylines and arcs, y down, in points", () => {
    const g = geometryFromW2d(stream)!;
    expect(g.segments.length).toBe(1 + 1 + 2);
    expect(g.curves.length).toBe(1);
    // 1000 mm of paper is 2834.6 points.
    const first = g.segments[0]!;
    expect(Math.abs(first.x2 - first.x1)).toBeCloseTo(2834.6, 0);
  });

  it("reads Hebrew set in an SHX font back into Hebrew", () => {
    const g = geometryFromW2d(stream)!;
    expect(g.texts.map((t) => t.text)).toEqual(["רשת"]);
  });

  it("is not a W2D stream without its header", () => {
    expect(geometryFromW2d(Buffer.from("hello"))).toBeNull();
  });
});

describe("reading a DWF package", () => {
  it("finds the W2D stream inside the ZIP, past the DWF preamble", () => {
    const pack = dwf({ "manifest.xml": Buffer.from("<m/>"), "sheet/page.w2d": stream });
    expect(readZipEntries(pack).map((e) => e.name)).toEqual(["manifest.xml", "sheet/page.w2d"]);
    const g = geometryFromDwf(pack)!;
    expect(g.texts[0]!.text).toBe("רשת");
  });

  it("cuts one drawing out of the strip, in its own coordinates", () => {
    const g = geometryFromW2d(stream)!;
    const sheet = sheetGeometry(g, { x: -1, y: -1, width: 3000, height: 3000 });
    expect(sheet.segments.length).toBe(g.segments.length);
    expect(Math.min(...sheet.segments.map((s) => Math.min(s.x1, s.x2)))).toBeGreaterThanOrEqual(0);
  });
});

describe("Hebrew typed on a Latin layout", () => {
  it("reads the sheet's note on the kitchen door", () => {
    expect(decodeShxHebrew("ra, zcucho")).toBe("רשת זבובים");
  });
});
