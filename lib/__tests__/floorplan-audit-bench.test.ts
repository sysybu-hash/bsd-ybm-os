import fs from "node:fs";

import {
  answerFromFindings,
  auditBenchLabelsSchema,
  formatAuditBench,
  scoreAuditBench,
  type AuditBenchCase,
} from "@/lib/projects/floorplan-audit-bench";

const labels = () =>
  auditBenchLabelsSchema.parse(
    JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-audit-bench/labels.json", "utf8")),
  );

const label = (defects: AuditBenchCase["defects"], counts: AuditBenchCase["counts"] = {}): AuditBenchCase => ({
  id: "c",
  still: { runTitle: "t", viewId: "overview", attempt: 1 },
  status: "draft",
  defects,
  counts,
});

describe("reading a saved findings list", () => {
  it("maps each finding to its rule, and states a count only when the finding does", () => {
    const answer = answerFromFindings([
      "the still is turned 180 degrees from the plan",
      "beds 6, plan has 4",
      "1 stair flight(s) inside a flat the plan draws on one level",
    ]);
    expect(answer.rules).toMatchObject({ rotated: true, stairsInside: true, mirrored: false, screens: false });
    expect(answer.counts).toEqual({ beds: 6 });
  });
});

describe("scoring the auditor against labels", () => {
  it("counts true and false findings per rule, and leaves undecided labels out", () => {
    const score = scoreAuditBench([
      { label: label({ rotated: false, screens: null }), answers: [{ rules: { rotated: true, screens: true }, counts: {} }] },
      { label: label({ rotated: true }), answers: [{ rules: { rotated: true }, counts: {} }] },
      { label: label({ rotated: true }), answers: [{ rules: { rotated: false }, counts: {} }] },
    ]);
    expect(score.rules.rotated).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 0, precision: 0.5, recall: 0.5 });
    expect(score.rules.screens.judged).toBe(0);
    expect(score.rules.screens.precision).toBeNull();
  });

  it("measures how often repeat scans of one frame disagree", () => {
    const score = scoreAuditBench([
      {
        label: label({ rotated: false }, { beds: 6 }),
        answers: [
          { rules: { rotated: true }, counts: { beds: 6 } },
          { rules: { rotated: false }, counts: { beds: 4 } },
        ],
      },
      { label: label({ rotated: false }, { beds: 6 }), answers: [{ rules: { rotated: false }, counts: { beds: 6 } }] },
    ]);
    // Only the case scanned twice can flip, and it did.
    expect(score.rules.rotated.flipRate).toBe(1);
    expect(score.counts.beds).toMatchObject({ judged: 3, exact: 2, meanAbsError: 2 / 3, flipRate: 1 });
  });

  it("reads the דירה 14 labels and renders a table", () => {
    const parsed = labels();
    expect(parsed.cases).toHaveLength(5);
    const table = formatAuditBench(
      scoreAuditBench(parsed.cases.map((c) => ({ label: c, answers: [] }))),
    );
    expect(table).toMatch(/\| rotated \| 0 \|/);
  });
});
