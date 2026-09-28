import { bookletBlockingIssues, checkBookletHero } from "@/lib/projects/floorplan-booklet-gate";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";
import { shipBlockingIssues } from "@/lib/projects/viz-generate/audit-gate";

const still = (over: Partial<FloorplanVizImage>): FloorplanVizImage => ({
  id: "s1",
  viewId: "overview",
  labelHe: "מבט על",
  mimeType: "image/jpeg",
  base64: "x",
  selected: true,
  ...over,
});

const meta = {
  v: 1 as const, at: "2026-09-27T00:00:00.000Z", ms: 0,
  gemini: null, claude: null, placement: [], dropped: [],
};

describe("which hero a booklet may carry", () => {
  it("audits a still the run does not store, or a run it was not given", () => {
    expect(checkBookletHero(null, "s1")).toEqual({ outcome: "audit", dismissed: [] });
    expect(checkBookletHero({ images: [still({})] }, undefined)).toEqual({ outcome: "audit", dismissed: [] });
  });

  it("refuses an id that is not one of the run's stills", () => {
    const check = checkBookletHero({ images: [still({})] }, "other");
    expect(check).toMatchObject({ outcome: "refuse", code: "viz_still_not_in_run" });
  });

  it("refuses a version that is not the chosen one", () => {
    expect(
      checkBookletHero({ images: [still({ auditStatus: "passed", auditMeta: meta, selected: false })] }, "s1"),
    ).toMatchObject({ outcome: "refuse", code: "viz_still_not_selected" });
  });

  it("lets a person ship a rejected attempt they chose, judged on its open findings", () => {
    const chosen = still({
      auditStatus: "rejected",
      auditMeta: meta,
      auditIssues: ["the still is turned 180 degrees from the plan", "beds 6, plan has 4"],
      auditDismissed: [{ issue: "beds 6, plan has 4", by: "יוחנן", at: "2026-09-27" }],
    });
    expect(checkBookletHero({ images: [chosen] }, "s1")).toEqual({
      outcome: "stored",
      issues: ["the still is turned 180 degrees from the plan"],
    });
  });

  it("trusts a verdict this code saved instead of scanning it again", () => {
    expect(checkBookletHero({ images: [still({ auditStatus: "passed", auditMeta: meta })] }, "s1")).toEqual({
      outcome: "stored",
      issues: [],
    });
  });

  it("audits again a list saved before verdicts were attributed, keeping the marks", () => {
    // דירה 14 attempt 4: a status and a list, but from the code that mixed in soft findings.
    const legacy = still({
      auditStatus: "needs_review",
      auditIssues: ["beds 6, plan has 4"],
      auditDismissed: [{ issue: "beds 6, plan has 4", by: "יוחנן", at: "2026-09-27" }],
    });
    expect(checkBookletHero({ images: [legacy] }, "s1")).toEqual({
      outcome: "audit",
      dismissed: ["beds 6, plan has 4"],
    });
  });

  it("does not hold the print crop, or a finding marked wrong, against the hero", () => {
    expect(
      bookletBlockingIssues(
        ["footprint does not match the plan outline", "mirrored plan", "1 stair flight(s) inside"],
        ["1 stair flight(s) inside"],
      ),
    ).toEqual(["mirrored plan"]);
  });
});

describe("the issues that count against a still", () => {
  const gemini = {
    hasDoubleBed: false,
    screenCount: 0,
    rotationVsPlanDegrees: 0,
    mirroredVsPlan: false,
    apartmentStairsNotInPlan: 0,
  } as unknown as FloorplanVizAudit;

  it("keeps hard failures and misplaced rooms, never the soft findings", () => {
    const scored = {
      gemini,
      grade: { hardFailures: ["1 room(s) invented outside the plan outline"], failures: ["1 room(s) invented outside the plan outline", "sofa faces wall"] },
    };
    expect(shipBlockingIssues(scored, ["room moved: kitchen"])).toEqual([
      "1 room(s) invented outside the plan outline",
      "room moved: kitchen",
    ]);
  });

  it("drops a double bed only Claude saw, and keeps a screen only Claude saw", () => {
    // דירה 20 shipped a haredi still with screens that Claude reported and
    // Gemini counted as none.
    const scored = { gemini, grade: { hardFailures: ["double bed in a bedroom", "screen visible"] } };
    expect(shipBlockingIssues(scored, null)).toEqual(["screen visible"]);
  });

  it("drops orientation and stairs only Claude reported, and keeps them when Gemini agrees", () => {
    const claudeOnly = {
      gemini,
      grade: {
        hardFailures: [
          "the still is turned 180 degrees from the plan",
          "the still is the plan mirrored left-to-right",
          "1 stair flight(s) inside a flat the plan draws on one level",
        ],
      },
    };
    expect(shipBlockingIssues(claudeOnly, null)).toEqual([]);
    const geminiSawIt = {
      ...claudeOnly,
      gemini: { ...gemini, rotationVsPlanDegrees: 180, mirroredVsPlan: true, apartmentStairsNotInPlan: 1 } as FloorplanVizAudit,
    };
    expect(shipBlockingIssues(geminiSawIt, null)).toHaveLength(3);
  });

  it("still reports misplaced rooms when the auditor is unavailable", () => {
    expect(shipBlockingIssues(null, ["room moved: kitchen"])).toEqual(["room moved: kitchen"]);
  });
});
