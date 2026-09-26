import {
  openAuditIssues,
  parseFloorplanVizDismissals,
  setDismissal,
} from "@/lib/projects/floorplan-viz-review";

describe("a person's marks on audit findings", () => {
  it("leaves out the findings marked wrong", () => {
    const marks = [{ issue: "beds 6, plan has 4", by: "יוחנן", at: "2026-09-27" }];
    expect(openAuditIssues(["beds 6, plan has 4", "mirrored plan"], marks)).toEqual(["mirrored plan"]);
    expect(openAuditIssues(undefined, marks)).toEqual([]);
  });

  it("keeps one mark per finding, and takes it back", () => {
    let marks = setDismissal([], "mirrored plan", true, "א", "t1");
    marks = setDismissal(marks, "mirrored plan", true, "ב", "t2");
    expect(marks).toEqual([{ issue: "mirrored plan", by: "ב", at: "t2" }]);
    expect(setDismissal(marks, "mirrored plan", false, "ב", "t3")).toEqual([]);
  });

  it("reads a stored column, and treats anything malformed as no marks", () => {
    expect(parseFloorplanVizDismissals([{ issue: "x", by: "y", at: "z" }])).toHaveLength(1);
    expect(parseFloorplanVizDismissals([{ issue: "" }])).toEqual([]);
    expect(parseFloorplanVizDismissals(null)).toEqual([]);
  });
});
