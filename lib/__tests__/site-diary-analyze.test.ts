import { parseSiteDiaryAnalysis } from "@/lib/field-copilot/site-diary-analyze";

describe("parseSiteDiaryAnalysis", () => {
  it("parses a full analysis object", () => {
    const result = parseSiteDiaryAnalysis({
      summary: "הברזל הגיע לאתר ומוכן לייצוק.",
      progressPercent: 40,
      materialsDetected: ["ברזל 12"],
      issues: [],
      suggestedTaskStatus: "in-progress",
      weather: "שמש",
    });

    expect(result.summary).toContain("ברזל");
    expect(result.materialsDetected).toEqual(["ברזל 12"]);
    expect(result.suggestedTaskStatus).toBe("in-progress");
  });

  it("falls back to summary-only payloads", () => {
    const result = parseSiteDiaryAnalysis({
      summary: "אין נזקים נראים לעין.",
    });

    expect(result.summary).toBe("אין נזקים נראים לעין.");
    expect(result.materialsDetected).toEqual([]);
  });
});
