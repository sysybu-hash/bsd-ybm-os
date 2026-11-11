import { apartmentMarks, apartmentSvg, extractApartment } from "@/lib/projects/dxf-apartment";
import { readDxfDrawing } from "@/lib/projects/dxf-drawing";

/** A centimetre DXF: two flats, each an App_Nom and a wall, one of them labelled in SHX Hebrew. */
function salesDxf(): string {
  const insert = (n: number, x: number) => [
    "0", "INSERT", "8", "A-TX2", "2", "App_Nom", "10", x, "20", 0, "66", "1",
    "0", "ATTRIB", "8", "A-TX2", "2", "Nom", "1", String(n), "10", x, "20", 0,
    "0", "SEQEND",
  ];
  const wall = (x0: number, y0: number, x1: number, y1: number) =>
    ["0", "LINE", "8", "a-wl", "10", x0, "20", y0, "11", x1, "21", y1];
  return [
    "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "5", "0", "ENDSEC",
    "0", "SECTION", "2", "BLOCKS",
    "0", "BLOCK", "8", "0", "2", "App_Nom", "10", "0", "20", "0",
    "0", "ENDBLK",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...insert(14, 0),
    ...insert(15, 800),
    ...wall(-200, -150, 200, -150),
    ...wall(700, -150, 900, -150),
    // A stair continuing past the wall. Its far end is not a wall point, and
    // the frame used to close on the wall and cut it off.
    ...wall(0, -150, 0, -320).map((value, i) => (i === 3 ? "A-STR" : value)),
    "0", "TEXT", "8", "A-TX2", "10", "0", "20", "40", "40", "0.2", "1", "nycj",
    "0", "ENDSEC",
    "0", "EOF",
  ].join("\n");
}

describe("apartment reader", () => {
  const drawing = readDxfDrawing(salesDxf())!;

  it("reads the numbers off App_Nom, not off any other 14 in the file", () => {
    expect(drawing).not.toBeNull();
    expect(apartmentMarks(drawing).map((mark) => mark.number).sort((a, b) => a - b)).toEqual([14, 15]);
  });

  it("lifts apartment 14, its wall and its room, and leaves 15 outside", () => {
    const plan = extractApartment(drawing, 14);
    expect(plan).not.toBeNull();
    expect(plan!.unitsM).toBe(0.01);
    expect(plan!.numbersInFile).toEqual([14, 15]);
    expect(plan!.rooms.map((room) => room.text)).toContain("מטבח");
    expect(plan!.counts.walls).toBeGreaterThan(0);
    expect(plan!.bounds.x1).toBeLessThan(400);
    expect(plan!.bounds.x0).toBeGreaterThan(-400);
    // The stair ends at y = -320, past the wall at y = -150. The frame has to
    // reach it, or the sheet is cut off at the bottom.
    expect(plan!.bounds.y0).toBeLessThan(-320);
    expect(apartmentSvg(plan!)).toContain("מטבח");
    expect(extractApartment(drawing, 99)).toBeNull();
  });

  it("keeps the bathroom on this flat when the next number is drawn inside it, and does not call it a kitchen", () => {
    const bath = readDxfDrawing([
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "5", "0", "ENDSEC",
      "0", "SECTION", "2", "BLOCKS",
      "0", "BLOCK", "8", "0", "2", "App_Nom", "10", "0", "20", "0", "0", "ENDBLK",
      "0", "BLOCK", "8", "0", "2", "bath 150", "10", "0", "20", "0",
      "0", "LINE", "8", "0", "10", "-40", "20", "0", "11", "40", "21", "0",
      "0", "ENDBLK",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "INSERT", "8", "A-TX2", "2", "App_Nom", "10", "0", "20", "0", "66", "1",
      "0", "ATTRIB", "8", "A-TX2", "2", "Nom", "1", "14", "10", "0", "20", "0", "0", "SEQEND",
      "0", "INSERT", "8", "A-TX2", "2", "App_Nom", "10", "0", "20", "-500", "66", "1",
      "0", "ATTRIB", "8", "A-TX2", "2", "Nom", "1", "11", "10", "0", "20", "-500", "0", "SEQEND",
      "0", "LINE", "8", "a-wl", "10", "-200", "20", "-150", "11", "200", "21", "-150",
      "0", "INSERT", "8", "A-SN", "2", "bath 150", "10", "0", "20", "-280",
      "0", "TEXT", "8", "A-TX2", "10", "30", "20", "-260", "40", "12", "1", "nycj",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n"))!;
    const plan = extractApartment(bath, 14);
    expect(plan).not.toBeNull();
    expect(plan!.rooms.map((room) => room.text)).toContain("אמבטיה");
    expect(plan!.rooms.map((room) => room.text)).not.toContain("מטבח");
    expect(plan!.bounds.y0).toBeLessThan(-280);
    expect(apartmentSvg(plan!)).toContain("אמבטיה");
  });
});
