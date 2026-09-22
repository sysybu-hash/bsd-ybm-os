/**
 * The first round draws several frames at once and keeps the best.
 *
 * Measured over eleven reference sheets, one frame came back structurally
 * right about half the time, and which half changed between runs on the same
 * sheet and the same code. These tests pin the two things that matter: three
 * frames are drawn in the first round, and a clean one is shipped without
 * paying for a correction.
 */
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

const generateOneImage = jest.fn();
const auditStill = jest.fn();
const checkRoomPlacement = jest.fn();
const collectShipIssues = jest.fn();
const gradeFloorplanStill = jest.fn();

jest.mock("@/lib/projects/viz-generate/gemini", () => ({
  generateOneImage: (...args: unknown[]) => generateOneImage(...args),
}));
jest.mock("@/lib/projects/viz-generate/audit-gate", () => ({
  auditStill: (...args: unknown[]) => auditStill(...args),
  collectShipIssues: (...args: unknown[]) => collectShipIssues(...args),
  blockingHardFailures: () => [],
  gradeStillForShip: () => ({ failures: [], hardFailures: [] }),
}));
jest.mock("@/lib/projects/floorplan-viz-placement", () => ({
  checkRoomPlacement: (...args: unknown[]) => checkRoomPlacement(...args),
}));
jest.mock("@/lib/projects/floorplan-viz-audit", () => ({
  ...jest.requireActual("@/lib/projects/floorplan-viz-audit"),
  gradeFloorplanStill: (...args: unknown[]) => gradeFloorplanStill(...args),
}));

const ctx = () => ({
  layout: parseFloorplanLayout({ rooms: [{ name: "סלון" }, { name: "מטבח" }, { name: "חדר שינה" }] }),
  plan: { base64: "plan", mimeType: "application/pdf" },
  haredi: false,
  deadlineMs: Date.now() + 10 * 60_000,
});

const job = { viewId: "overview", labelHe: "מבט על", prompt: "draw it" } as never;

beforeEach(() => {
  jest.clearAllMocks();
  auditStill.mockResolvedValue({ rooms: [] });
  checkRoomPlacement.mockResolvedValue([]);
  collectShipIssues.mockResolvedValue([]);
});

describe("the first round", () => {
  it("draws three frames at once and ships the clean one without a correction", async () => {
    const { generateAuditedImage } = await import("@/lib/projects/viz-generate/attempts");
    let n = 0;
    generateOneImage.mockImplementation(async () => ({ mimeType: "image/jpeg", base64: `f${++n}` }));
    // The first two frames lost a bedroom; the third is right.
    gradeFloorplanStill
      .mockReturnValueOnce({ score: 10, failures: ["1 bedroom(s) missing"], hardFailures: ["1 bedroom(s) missing"] })
      .mockReturnValueOnce({ score: 10, failures: ["1 bedroom(s) missing"], hardFailures: ["1 bedroom(s) missing"] })
      .mockReturnValueOnce({ score: 0, failures: [], hardFailures: [] });

    const out = await generateAuditedImage(job, [], "3:4", ctx());
    expect(generateOneImage).toHaveBeenCalledTimes(3);
    expect(out.base64).toBe("f3");
    expect(out.auditIssues).toBeUndefined();
  });

  it("corrects the best of the three when none of them is clean", async () => {
    const { generateAuditedImage } = await import("@/lib/projects/viz-generate/attempts");
    let n = 0;
    generateOneImage.mockImplementation(async () => ({ mimeType: "image/jpeg", base64: `f${++n}` }));
    gradeFloorplanStill
      .mockReturnValueOnce({ score: 30, failures: ["a"], hardFailures: ["a"] })
      .mockReturnValueOnce({ score: 12, failures: ["b"], hardFailures: ["b"] })
      .mockReturnValueOnce({ score: 40, failures: ["c"], hardFailures: ["c"] })
      // The correction, told what the best frame got wrong, comes back clean.
      .mockReturnValueOnce({ score: 0, failures: [], hardFailures: [] });

    const out = await generateAuditedImage(job, [], "3:4", ctx());
    expect(generateOneImage).toHaveBeenCalledTimes(4);
    // The fourth call is a correction, and it carries the best frame's failure.
    const correction = String(generateOneImage.mock.calls[3]![0]);
    expect(correction).toContain("PREVIOUS ATTEMPT REJECTED");
    expect(correction).toContain("- b");
    expect(out.base64).toBe("f4");
  });

  it("does not spend three frames on a view that is never audited", async () => {
    const { generateAuditedImage } = await import("@/lib/projects/viz-generate/attempts");
    generateOneImage.mockResolvedValue({ mimeType: "image/jpeg", base64: "only" });
    const out = await generateAuditedImage({ ...(job as object), viewId: "kitchen" } as never, [], "3:4", ctx());
    expect(generateOneImage).toHaveBeenCalledTimes(1);
    expect(out.base64).toBe("only");
  });
});
