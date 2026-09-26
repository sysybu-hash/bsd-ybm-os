import fs from "node:fs";

import {
  applyPlanManifest,
  manifestProgress,
  parseFloorplanManifest,
  type FloorplanManifest,
} from "@/lib/projects/floorplan-manifest";
import type { FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";

const apt14 = () =>
  parseFloorplanManifest(
    JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-manifest/apt-14.json", "utf8")),
  );

/**
 * Shaped after attempt 2 of דירה 14 on 25/09 (six beds in the still, four on
 * the plan by the auditor's read); the other plan counts are illustrative.
 */
const attempt2 = {
  bedTotal: 6,
  planBedTotal: 4,
  planBedroomCount: 4,
  planIslandStoolCount: 4,
  planKitchenSinkBasins: 2,
  planWasherCount: 0,
  planBathtubCount: 1,
  planSeatingGroupCount: 1,
} as unknown as FloorplanVizAudit;

/** The same manifest with every item back in draft, as it was before approval. */
const asDraft = (manifest: FloorplanManifest): FloorplanManifest => ({
  ...manifest,
  approvedBy: null,
  items: manifest.items.map((item) => ({ ...item, status: "draft" as const })),
});

describe("the דירה 14 manifest", () => {
  it("parses, and every audit field it maps is mapped once", () => {
    const manifest = apt14();
    expect(manifest.unit).toBe("דירה 14");
    const mapped = manifest.items.flatMap((item) => (item.auditField ? [item.auditField] : []));
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("agrees with the truth table the bench grades against", () => {
    const truth = JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-truth.json", "utf8")) as {
      plans: Array<{ file: string; bedrooms: number; mmd: number; bathrooms: number; levelM: number; terraces: Array<{ levelM: number }> }>;
    };
    const row = truth.plans.find((plan) => plan.file === "דירה 14 .pdf")!;
    const value = (id: string) => apt14().items.find((item) => item.id === id)?.value;
    expect(value("rooms.bedroom")).toBe(row.bedrooms);
    expect(value("rooms.mmd")).toBe(row.mmd);
    expect(value("rooms.bathroom")).toBe(row.bathrooms);
    expect(value("rooms.balcony")).toBe(row.terraces.filter((t) => t.levelM === row.levelM).length);
  });

  it("was approved by the owner, with six beds", () => {
    const manifest = apt14();
    expect(manifest.approvedBy).toBeTruthy();
    expect(manifest.items.find((item) => item.id === "beds.total")?.value).toBe(6);
    // Settled with no value: the sheet does not say, and neither did the owner.
    expect(manifestProgress(manifest).unresolved.sort()).toEqual(["kitchen.fridge", "orientation.north"]);
  });

  it("changes nothing while it is a draft", () => {
    const { audit, disputes } = applyPlanManifest(attempt2, asDraft(apt14()));
    expect(audit).toEqual(attempt2);
    expect(disputes).toEqual([]);
  });

  it("grades against the approved counts, and keeps the scan's disagreement as a dispute", () => {
    const { audit, disputes } = applyPlanManifest(attempt2, apt14());
    expect(audit.planBedTotal).toBe(6);
    expect(audit.planWasherCount).toBe(1);
    // The still side is the auditor's and stays as it read it.
    expect(audit.bedTotal).toBe(6);
    expect(disputes).toEqual([
      { itemId: "beds.total", field: "planBedTotal", auditPlan: 4, manifest: 6 },
      { itemId: "laundry.washers", field: "planWasherCount", auditPlan: 0, manifest: 1 },
    ]);
  });

  it("refuses a manifest that maps one field twice", () => {
    const raw = JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-manifest/apt-14.json", "utf8"));
    raw.items.push({ id: "beds.again", label: "x", value: 5, status: "draft", auditField: "planBedTotal" });
    expect(() => parseFloorplanManifest(raw)).toThrow(/planBedTotal/);
  });
});
