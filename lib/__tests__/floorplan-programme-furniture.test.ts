import { deskFurnitureInOffices } from "@/lib/projects/floorplan-programme-furniture";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";

const page = { width: 595, height: 842 };
const piece = (x: number, y: number, widthCm: number, depthCm: number): FurniturePiece => ({
  x,
  y,
  w: 30,
  h: 20,
  kind: "storage",
  widthCm,
  depthCm,
});

const layout = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "חדר עבודה", bbox: { x: 0.2, y: 0.4, w: 0.15, h: 0.1 } },
      { name: "מטבח", bbox: { x: 0.6, y: 0.4, w: 0.15, h: 0.1 } },
    ],
  });

describe("what the sheet says a rectangle is", () => {
  it("calls a desk-sized piece in the work room a desk", () => {
    // 120 by 60 is a desk and a sideboard both; the room's label decides.
    const inStudy = piece(0.25 * page.width, 0.45 * page.height, 120, 60);
    const [out] = deskFurnitureInOffices([inStudy], layout(), page);
    expect(out!.kind).toBe("desk");
  });

  it("leaves the same rectangle alone in the kitchen", () => {
    const inKitchen = piece(0.65 * page.width, 0.45 * page.height, 120, 60);
    const [out] = deskFurnitureInOffices([inKitchen], layout(), page);
    expect(out!.kind).toBe("storage");
  });

  it("never renames a bed", () => {
    const bed = { ...piece(0.25 * page.width, 0.45 * page.height, 120, 200), kind: "bed" as const };
    const [out] = deskFurnitureInOffices([bed], layout(), page);
    expect(out!.kind).toBe("bed");
  });

  it("does nothing without a programme or a page", () => {
    const p = piece(0.25 * page.width, 0.45 * page.height, 120, 60);
    expect(deskFurnitureInOffices([p], undefined, page)[0]!.kind).toBe("storage");
    expect(deskFurnitureInOffices([p], layout(), undefined)[0]!.kind).toBe("storage");
  });
});

describe("a room the sheet draws empty", () => {
  it("clears what the geometry put in the shelter room", async () => {
    // The shelter room is an empty box with thick walls, and a rectangle
    // inside that hatch reads as a bed. Once it is on the plate the image
    // model photographs it, whatever the prompt says about ממ"ד staying empty.
    const { clearFurnitureFromEmptyRooms } = await import(
      "@/lib/projects/floorplan-programme-furniture"
    );
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "ממ\"ד", bbox: { x: 0.35, y: 0.4, w: 0.2, h: 0.15 }, contents: "empty" },
        { name: "חדר שינה", bbox: { x: 0.2, y: 0.7, w: 0.2, h: 0.15 }, contents: "1 twin bed" },
      ],
    });
    const inShelter = { ...piece(0.4 * page.width, 0.45 * page.height, 120, 200), kind: "bed" as const };
    const inBedroom = { ...piece(0.25 * page.width, 0.75 * page.height, 120, 200), kind: "bed" as const };
    const kept = clearFurnitureFromEmptyRooms([inShelter, inBedroom], layout, page);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(inBedroom);
  });
});
