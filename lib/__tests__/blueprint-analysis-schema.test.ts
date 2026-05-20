import { blueprintAnalysisSchema } from "@/lib/projects/blueprint-analysis-schema";

describe("blueprintAnalysisSchema", () => {
  it("accepts minimal valid payload", () => {
    const result = blueprintAnalysisSchema.safeParse({
      tasks: [{ name: "עבודות שלד", startDate: "2026-01-01", endDate: "2026-02-01" }],
      milestones: [{ name: "שלב 1", amount: 10000 }],
    });
    expect(result.success).toBe(true);
  });

  it("allows empty arrays via defaults", () => {
    const result = blueprintAnalysisSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tasks).toEqual([]);
      expect(result.data.milestones).toEqual([]);
    }
  });

  it("rejects task without name", () => {
    const result = blueprintAnalysisSchema.safeParse({
      tasks: [{ name: "" }],
      milestones: [{ name: "m", amount: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
