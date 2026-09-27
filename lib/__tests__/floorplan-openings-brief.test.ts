import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { openingGenerationBrief, openingPlaces } from "@/lib/projects/viz-generate/openings-brief";

/** דירה 14's middle bedroom and the two measured gaps out to its west terrace. */
const layout = () =>
  parseFloorplanLayout({
    rooms: [
      { name: "חדר שינה", kind: "bedroom", bbox: { x: 0.24, y: 0.49, w: 0.2, h: 0.1 } },
      { name: "מטבח", kind: "kitchen", bbox: { x: 0.42, y: 0.3, w: 0.15, h: 0.25 } },
      { name: 'ממ"ד', kind: "mmd", bbox: { x: 0.1, y: 0.31, w: 0.16, h: 0.15 } },
    ],
    openings: [
      { kind: "opening", widthM: 0.64, box: { x: 0.235, y: 0.5, w: 0.005, h: 0.02 } },
      { kind: "opening", widthM: 0.64, box: { x: 0.235, y: 0.531, w: 0.005, h: 0.02 } },
      { kind: "door", widthM: 0.97, box: { x: 0.235, y: 0.752, w: 0.02, h: 0.005 } },
      { kind: "window", widthM: 1.73 },
    ],
  });

describe("the sheet's openings, said to the model", () => {
  it("names doorways with no leaf drawn, not only doors and windows", () => {
    const lines = openingPlaces(layout());
    expect(lines.join(" ")).toMatch(/2 open doorways \(0\.64 m at .*; 0\.64 m at .*\)/);
    expect(lines.join(" ")).toMatch(/1 door \(0\.97 m/);
    // The window has no place on the page, so it cannot be said where it is.
    expect(lines.join(" ")).not.toMatch(/window/);
  });

  it("tells a generated still to keep every way through open", () => {
    const brief = openingGenerationBrief(layout());
    expect(brief).toMatch(/Never close one with wall/);
    expect(brief).toMatch(/dresser/);
  });

  it("says nothing when no opening has a place on the page", () => {
    expect(openingGenerationBrief(parseFloorplanLayout({ rooms: [{ name: "סלון" }] }))).toBe("");
  });
});
