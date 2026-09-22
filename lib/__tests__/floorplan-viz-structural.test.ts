import {
  isStructuralAuditFailure,
  structuralAuditFailures,
  withStructuralVerdict,
} from "@/lib/projects/floorplan-viz-structural";
import { hebrewFloorplanAuditIssue } from "@/lib/projects/floorplan-viz-ids";

// The issues the auditor recorded on דירה 14's shipped still, 22 September.
const DIRA_14 = [
  "the still is turned 180 degrees from the plan",
  "2 screen(s) in a haredi still",
  "washers 2, plan draws 1",
  "bedrooms 3, plan has 4",
];

describe("a still of a different flat", () => {
  it("picks out the missing bedroom and leaves the touch-ups", () => {
    expect(structuralAuditFailures(DIRA_14)).toEqual(["bedrooms 3, plan has 4"]);
  });

  it("does not trust the auditor's orientation verdict", () => {
    // It said "turned 180 degrees" of a frame that was not turned.
    expect(isStructuralAuditFailure("the still is turned 180 degrees from the plan")).toBe(false);
    expect(isStructuralAuditFailure("the still is the plan mirrored left-to-right")).toBe(false);
  });

  it("counts invented rooms, lost terraces and a missing front door as structural", () => {
    for (const issue of [
      "1 room(s) invented outside the plan outline",
      "1 printed terrace(s) missing from the still",
      "front door missing where the plan draws the entrance",
      "1 bedroom(s) left without a bed",
    ]) {
      expect(isStructuralAuditFailure(issue)).toBe(true);
    }
  });
});

describe("the run's verdict", () => {
  const green = { tier: "cad", hard: [] as string[], soft: ["1 מתוך 2 מרפסות זוהו"], ok: true };

  it("is no longer ok when the shipped overview is a different flat", () => {
    const verdict = withStructuralVerdict(green, [
      { viewId: "overview", auditIssues: DIRA_14 },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.hard).toEqual(["ההדמיה לא תואמת את התוכנית: bedrooms 3, plan has 4"]);
    expect(verdict.soft).toEqual(green.soft);
  });

  it("stays ok for cosmetic findings, and for interiors", () => {
    expect(
      withStructuralVerdict(green, [
        { viewId: "overview", auditIssues: ["2 screen(s) in a haredi still"] },
        { viewId: "interior", roomName: "סלון", auditIssues: ["bedrooms 0, plan has 1"] },
      ]).ok,
    ).toBe(true);
  });

  it("tells the user the numbers in Hebrew", () => {
    expect(hebrewFloorplanAuditIssue("bedrooms 3, plan has 4")).toBe("בהדמיה 3 חדרי שינה, בתוכנית 4");
    expect(hebrewFloorplanAuditIssue("beds 6, plan has 4")).toBe("בהדמיה 6 מיטות, בתוכנית 4");
  });
});
