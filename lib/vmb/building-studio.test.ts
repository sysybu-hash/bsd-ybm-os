/** @jest-environment node */
import sharp from "sharp";
import type { Primitive } from "@/lib/projects/building/model";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { chamferDistance, inkMask } from "@/lib/projects/accuracy/distance-map";
import { agreement, buildingStudioModel, lineMask, storeyWallPoints } from "@/lib/projects/pipeline/building-studio";

const wall = (x: number, z: number, w: number, d: number, y0 = 0, h = 2.8, tag?: string): Primitive => ({
  type: "box",
  centre: { x, y: y0 + h / 2, z },
  size: { x: w, y: h, z: d },
  material: "plaster",
  ...(tag ? { tag } : {}),
});

/** A 4 × 3 m storey of 0.2 m walls, on the ground and again one storey up. */
const room = (y0: number): Primitive[] => [wall(2, 0.1, 4, 0.2, y0), wall(2, 2.9, 4, 0.2, y0), wall(0.1, 1.5, 0.2, 3, y0), wall(3.9, 1.5, 0.2, 3, y0)];

describe("building studio", () => {
  it("samples only the walls standing on the storey: not the one above, not lintels, not furniture or the yard", () => {
    const prims = [...room(0), ...room(3), wall(2, 1.5, 1, 0.2, 2.1, 0.6), wall(1, 1, 1, 1, 0, 1.2, "g:inside:furniture"), wall(9, 9, 5, 0.2, 0, 2, "yard:fence")];
    const pts = storeyWallPoints(prims, { level: 0, height: 3 });
    // the two long faces of each ground wall at 0.1 m: 2·(40+1) for the 4 m walls, 2·(30+1) for the 3 m ones, both kept twice
    expect(pts.length).toBe(2 * 2 * 41 + 2 * 2 * 31);
  });

  it("agrees with the lines in the reader's own frame, and not in a frame half a metre off", async () => {
    // a sheet 5 m wide in page units, its corner at (−0.5, −0.25) m in plan, drawn at 300 px: Jest's transform makes
    // pixel loops slow, so the full storeyOverlay at the studio's 1200 px is checked on a real house, not here
    const W = 300;
    const sheetWidth = 5 * DWF_FLOOR_UNITS_PER_METRE;
    const k = W / 5;
    const at = (xm: number, zm: number) => [(xm + 0.5) * k, (zm + 0.25) * k];
    const [ax, ay] = at(0, 0);
    const [bx, by] = at(4, 3);
    const [cx, cy] = at(0.2, 0.2);
    const [dx, dy] = at(3.8, 2.8);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}"><rect width="100%" height="100%" fill="#fff"/>
      <rect x="${ax}" y="${ay}" width="${bx! - ax!}" height="${by! - ay!}" fill="none" stroke="#000" stroke-width="1"/>
      <rect x="${cx}" y="${cy}" width="${dx! - cx!}" height="${dy! - cy!}" fill="none" stroke="#000" stroke-width="1"/></svg>`;
    const g = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
    const lines = chamferDistance(lineMask(inkMask(g.data, W, W, g.info.channels), W, W, 2), W, W);
    const pts = storeyWallPoints(room(0), { level: 0, height: 3 });
    const frame = (shift: { x: number; y: number }) => {
      const sc = (DWF_FLOOR_UNITS_PER_METRE * W) / sheetWidth;
      return { s: sc, th: 0, tx: -shift.x * sc, ty: -shift.y * sc, cx: 0, cz: 0 };
    };
    expect(agreement(pts, frame({ x: -0.5, y: -0.25 }), lines)).toBeGreaterThan(0.5);
    expect(agreement(pts, frame({ x: 0, y: 0.25 }), lines)).toBeLessThan(0.5);
  }, 60_000);

  it("leaves a terrain's photograph out of the studio, and keeps each storey's sheet by its key", async () => {
    const terrain: Primitive = { type: "terrain", x0: 0, z0: 0, dx: 1, nx: 2, nz: 2, heights: [0, 0, 0, 0], material: "grass", photo: { src: "data:image/jpeg;base64,AAAA", pw: 1, ph: 1, s: 1, cu: 0, cv: 0, cx: 0, cz: 0, rot: 0 } };
    const model = { name: "m", primitives: [...room(0), terrain], extent: { x: 0, z: 0, width: 4, depth: 3, yMin: 0, yMax: 3 }, north: { x: 0, z: -1 } };
    const sheet = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const artefacts = new Map<string, Buffer>([["model.json", Buffer.from(JSON.stringify(model))], ["sheet-g.jpg", sheet]]);
    const state = {
      artefacts: { "model.json": "model.json", "sheet-g.jpg": "sheet-g.jpg" },
      floors: [{ id: "g", level: 0, height: 3, units: [], shift: { x: 0, y: 0 }, outline: [], roof: false, registration: 1, sheetWidth: 100, sheetHeight: 100 }],
    };
    const made = await buildingStudioModel("בית", state as never, artefacts, "m0-");
    expect(made!.model.primitives.find((p) => p.type === "terrain")).not.toHaveProperty("photo.src");
    expect([...made!.sheets.keys()]).toEqual(["m0-g"]);
    expect(made!.model.storeys[0]!.title).toBe("קומת קרקע");
  });
});
