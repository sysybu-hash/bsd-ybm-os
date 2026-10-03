/**
 * @jest-environment node
 */
import { deflateRawSync } from "node:zlib";
import { extractW2dFromDwf, findW2dEntry } from "@/components/os/widgets/floorplan-viz/dwf-extract";

/** A zip as a DWF packs one: its own header first, then local entries, the directory, the end record. */
function dwf(entries: Array<{ name: string; data: Buffer; deflate: boolean }>): Buffer {
  const head = Buffer.from("(DWF V06.00)", "latin1");
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const packed = e.deflate ? deflateRawSync(e.data) : e.data;
    const name = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(e.deflate ? 8 : 0, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.deflate ? 8 : 0, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([head, ...locals, cd, end]);
}

const drawing = Buffer.from("(W2D V06.00)" + "x".repeat(5000), "latin1");
const font = Buffer.from("font".repeat(20_000), "latin1");

describe("the drawing cut out of a permit strip", () => {
  it("finds the W2D stream past the DWF's own header, and inflates it", async () => {
    const bytes = dwf([
      { name: "fonts/heb.ttf", data: font, deflate: true },
      { name: "com.autodesk.dwf.ePlot_1/sheet.w2d", data: drawing, deflate: true },
    ]);
    const out = await extractW2dFromDwf(new File([new Uint8Array(bytes)], "גרמושקה.dwf"));
    expect(out).not.toBeNull();
    expect(out!.name).toBe("גרמושקה.w2d");
    expect(out!.type).toBe("model/vnd.dwf");
    expect(Buffer.from(await out!.arrayBuffer()).equals(drawing)).toBe(true);
  });

  it("takes the biggest stream where a strip carries several", () => {
    const small = Buffer.from("(W2D V06.00)yy", "latin1");
    const entry = findW2dEntry(
      dwf([
        { name: "a.w2d", data: small, deflate: false },
        { name: "b.w2d", data: drawing, deflate: false },
      ]),
    );
    expect(entry?.name).toBe("b.w2d");
  });

  it("answers null for a file that is not a strip", async () => {
    expect(await extractW2dFromDwf(new File([new Uint8Array(Buffer.from("%PDF-1.7 not a zip"))], "plan.dwf"))).toBeNull();
    expect(await extractW2dFromDwf(new File([new Uint8Array(dwf([{ name: "fonts/a.ttf", data: font, deflate: true }]))], "x.dwf"))).toBeNull();
  });
});
