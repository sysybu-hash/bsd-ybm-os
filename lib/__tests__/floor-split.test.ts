import type { PlacedText } from "@/lib/projects/floorplan-dwf";
import { roomLabels, terraceAreas, textLines } from "@/lib/projects/floor-split";
import { labelledKind, roomLabelKind } from "@/lib/projects/floorplan-segment";

const word = (x: number, y: number, text: string, height = 8): PlacedText => ({ x, y, text, height });

describe("room names written on a floor plan", () => {
  it("rebuilds a label from its words, right to left", () => {
    expect(textLines([word(100, 50, "הורים"), word(130, 50, ".יח")]).map((l) => l.text)).toEqual([".יח הורים"]);
  });

  it("reads each name as the kind of room it names", () => {
    expect(roomLabelKind('ממ"ד 2')).toBe("mmd");
    expect(roomLabelKind("ח. שינה")).toBe("bedroom");
    expect(roomLabelKind("יח. הורים")).toBe("bedroom");
    expect(roomLabelKind("פ. אוכל")).toBe("living");
    expect(roomLabelKind("רחצה")).toBe("bathroom");
    expect(roomLabelKind("כביסה")).toBe("utility");
    expect(roomLabelKind("מעלית")).toBe("circulation");
    expect(roomLabelKind("778.45")).toBeNull();
  });

  it("calls an open-plan room by its main use", () => {
    expect(labelledKind(["kitchen", "living"])).toBe("living");
    expect(labelledKind(["utility", "bathroom"])).toBe("bathroom");
    expect(labelledKind([])).toBeNull();
  });

  it("keeps the room names and drops the rest", () => {
    const labels = roomLabels([word(100, 50, "סלון"), word(300, 50, "2.95+"), word(500, 50, "מטבח")]);
    expect(labels.map((l) => l.kind)).toEqual(["living", "kitchen"]);
  });
});

describe("the terrace areas a floor plan prints", () => {
  it("takes this floor's terrace and not the floor above's drawn over it", () => {
    const texts = [
      word(200, 100, "מרפסת"),
      word(170, 100, "מקורה"),
      word(210, 112, "בשטח"),
      word(180, 112, "של"),
      word(160, 112, "19.15"),
      // "היטל מרפסת קומה ב בשטח של כ-4.30": the terrace of the floor above.
      word(600, 100, "היטל"),
      word(570, 100, "מרפסת"),
      word(600, 112, "בשטח"),
      word(570, 112, "4.30"),
    ];
    expect(terraceAreas(texts).map((a) => a.value)).toEqual([19.15]);
  });
});
