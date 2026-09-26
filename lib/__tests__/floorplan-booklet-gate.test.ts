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

describe("which hero a booklet may carry", () => {
  it("audits a still the run does not store, or a run it was not given", () => {
    expect(checkBookletHero(null, "s1")).toEqual({ outcome: "audit" });
    expect(checkBookletHero({ images: [still({})] }, undefined)).toEqual({ outcome: "audit" });
  });

  it("refuses an id that is not one of the run's stills", () => {
    const check = checkBookletHero({ images: [still({})] }, "other");
    expect(check).toMatchObject({ outcome: "refuse", code: "viz_still_not_in_run" });
  });

  it("refuses a rejected attempt or one that is not the chosen version", () => {
    expect(
      checkBookletHero({ images: [still({ auditStatus: "rejected", selected: false })] }, "s1"),
    ).toMatchObject({ outcome: "refuse", code: "viz_still_not_selected" });
    expect(
      checkBookletHero({ images: [still({ auditStatus: "passed", selected: false })] }, "s1"),
    ).toMatchObject({ outcome: "refuse", code: "viz_still_not_selected" });
  });

  it("trusts the verdict a still was saved with instead of scanning it again", () => {
    expect(checkBookletHero({ images: [still({ auditStatus: "passed" })] }, "s1")).toEqual({
      outcome: "stored",
      issues: [],
    });
    expect(
      checkBookletHero(
        { images: [still({ auditStatus: "needs_review", auditIssues: ["screen visible"] })] },
        "s1",
      ),
    ).toEqual({ outcome: "stored", issues: ["screen visible"] });
  });

  it("audits a still saved before verdicts were stored", () => {
    expect(checkBookletHero({ images: [still({})] }, "s1")).toEqual({ outcome: "audit" });
  });

  it("does not hold the print crop against the hero", () => {
    expect(
      bookletBlockingIssues(["footprint does not match the plan outline", "mirrored plan"]),
    ).toEqual(["mirrored plan"]);
  });
});

describe("the issues that count against a still", () => {
  const gemini = { hasDoubleBed: false, screenCount: 0 } as unknown as FloorplanVizAudit;

  it("keeps hard failures and misplaced rooms, never the soft findings", () => {
    const scored = {
      gemini,
      grade: { hardFailures: ["mirrored plan"], failures: ["mirrored plan", "sofa faces wall"] },
    };
    expect(shipBlockingIssues(scored, ["room moved: kitchen"])).toEqual([
      "mirrored plan",
      "room moved: kitchen",
    ]);
  });

  it("drops a double bed or a screen only Claude saw", () => {
    const scored = { gemini, grade: { hardFailures: ["double bed in a bedroom", "screen visible"] } };
    expect(shipBlockingIssues(scored, null)).toEqual([]);
  });

  it("still reports misplaced rooms when the auditor is unavailable", () => {
    expect(shipBlockingIssues(null, ["room moved: kitchen"])).toEqual(["room moved: kitchen"]);
  });
});
