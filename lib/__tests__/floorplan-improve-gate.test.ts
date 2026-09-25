import { isNetImprovement } from "@/lib/projects/floorplan-improve-gate";

describe("isNetImprovement", () => {
  it("accepts a strict reduction that introduces no new audit issue", () => {
    expect(isNetImprovement(["missing door", "extra bed"], ["extra bed"])).toBe(true);
    expect(isNetImprovement(["missing door"], [])).toBe(true);
  });

  it("rejects unchanged, worse, and issue-swapping revisions", () => {
    expect(isNetImprovement(["missing door"], ["missing door"])).toBe(false);
    expect(isNetImprovement(["missing door"], ["missing door", "extra bed"])).toBe(false);
    expect(isNetImprovement(["missing door", "extra bed"], ["new rotation issue"])).toBe(false);
  });
});
