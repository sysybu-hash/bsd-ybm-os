/** @jest-environment node */
jest.mock("server-only", () => ({}));

const mockDb = { vmbProject: { findFirst: jest.fn(), update: jest.fn() } };
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import sharp from "sharp";
import { clientViews, footprint, sheetOverlay, studioCameras, wallPoints } from "@/lib/projects/pipeline/flat-studio";
import type { FlatScene, SceneBox } from "@/lib/projects/scene3d/types";
import { projectBooklet, projectCameras } from "@/lib/vmb/outcome";
import { setCameras, studioPart } from "@/lib/vmb/studio-store";

const wall = (x: number, z: number, w: number, d: number, rotY?: number): SceneBox =>
  ({ kind: "wall", material: "wall", centre: { x, y: 1.4, z }, size: { x: w, y: 2.8, z: d }, sourceId: "w", ...(rotY ? { rotY } : {}) }) as SceneBox;

/** A 4 × 3 m room of 0.2 m walls. */
const room: FlatScene = {
  version: 1,
  unitsPerMetre: 100,
  extent: { x: 0, z: 0, width: 4, depth: 3 },
  meshes: [wall(2, 0.1, 4, 0.2), wall(2, 2.9, 4, 0.2), wall(0.1, 1.5, 0.2, 3), wall(3.9, 1.5, 0.2, 3)],
  rooms: [],
  openings: [],
  lights: [],
};

const cam = (id: string, x: number, z: number) => ({ id, title: id, position: { x, y: 1.5, z }, target: { x: 2, y: 1, z: 1.5 }, fovDeg: 55 });

describe("flat studio", () => {
  it("turns a box's footprint as three.js turns it", () => {
    const c = footprint({ centre: { x: 0, y: 0, z: 0 }, size: { x: 2, y: 1, z: 0 }, rotY: Math.PI / 2 });
    // +x end turned a quarter about +y lands on −z
    expect(c[1]![0]).toBeCloseTo(0);
    expect(c[1]![1]).toBeCloseTo(-1);
  });

  it("samples both faces of every wall and nothing else", () => {
    const pts = wallPoints({ ...room, meshes: [...room.meshes, { ...wall(1, 1, 1, 1), kind: "furniture" } as SceneBox] });
    expect(pts.every((p) => p.kind === "wall")).toBe(true);
    // each wall's outline at 0.1 m: two long faces and two 0.2 m ends (2·40+2·2, 2·30+2·2)
    expect(pts.length).toBe(2 * 84 + 2 * 64);
  });

  it("keeps client cameras that stand in the flat, eight at most", () => {
    const many = Array.from({ length: 10 }, (_, i) => cam(`c${i}`, 1 + i * 0.1, 1));
    const views = clientViews([cam("cout", 30, 30), ...many], room);
    expect(views).toHaveLength(8);
    expect(views.some((v) => v.id === "cout")).toBe(false);
    expect(views[0]!.payload.camera.interior).toBe(true);
    expect(studioCameras(views, new Set(["c0"]))[0]).toMatchObject({ id: "c0", client: true });
  });

  it("registers the model on a sheet that draws it, within a few centimetres", async () => {
    const pxPerM = 100;
    const W = 600;
    const H = 500;
    // the room drawn at 100 px/m, its outer corner at (100, 80)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>
      <rect x="100" y="80" width="400" height="300" fill="none" stroke="#000" stroke-width="2"/>
      <rect x="120" y="100" width="360" height="260" fill="none" stroke="#000" stroke-width="2"/></svg>`;
    const jpeg = await sharp(Buffer.from(svg)).jpeg().toBuffer();
    const out = await sheetOverlay(room, jpeg, pxPerM);
    expect(out.width).toBe(1200);
    expect(out.overlay).not.toBeNull();
    expect(out.overlay!.all.median).toBeLessThan(0.03);
    expect(out.overlay!.all.withinClose).toBeGreaterThan(0.95);
  }, 60_000);
});

describe("studio on the project", () => {
  beforeEach(() => jest.resetAllMocks());

  it("reads only cameras that parse", () => {
    expect(projectCameras({ cameras: [cam("cok", 1, 1), { id: "bad id" }, cam("x!", 1, 1)] }).map((c) => c.id)).toEqual(["cok"]);
    expect(projectCameras({})).toEqual([]);
  });

  it("keeps the studio's files on the booklet", () => {
    const b = projectBooklet({
      booklet: { url: "https://x.public.blob.vercel-storage.com/b.pdf", jobId: "j", picturesPainted: 0, picturesFree: 3, creditsUsed: 0, at: "2026-11-12", studio: { dataUrl: "https://x.public.blob.vercel-storage.com/s.json", sheetUrl: null } },
    });
    expect(b?.studio?.dataUrl).toContain("s.json");
  });

  it("serves a part only from project storage", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue({
      manifest: { booklet: { url: "https://x.public.blob.vercel-storage.com/b.pdf", jobId: "j", picturesPainted: 0, picturesFree: 1, creditsUsed: 0, at: "t", studio: { dataUrl: "https://evil.example.com/s.json", sheetUrl: null } } },
    });
    expect(await studioPart("u", "p", "data")).toBeNull();
    expect(await studioPart("u", "p", "sheet")).toBeNull();
  });

  it("saves cameras, never while a run is going", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValueOnce({ id: "p", status: "running", manifest: {} });
    expect(await setCameras("u", "p", [])).toEqual({ ok: false, code: "running" });
    mockDb.vmbProject.findFirst.mockResolvedValueOnce({ id: "p", status: "done", manifest: { unit: 14 } });
    expect(await setCameras("u", "p", [cam("ca", 1, 1)])).toEqual({ ok: true });
    expect(mockDb.vmbProject.update).toHaveBeenCalledWith({ where: { id: "p" }, data: { manifest: { unit: 14, cameras: [cam("ca", 1, 1)] } } });
  });
});
