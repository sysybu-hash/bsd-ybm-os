/**
 * The first round draws several frames at once and keeps the best.
 *
 * Measured over eleven reference sheets, one frame came back structurally
 * right about half the time, and which half changed between runs on the same
 * sheet and the same code. These tests pin the two things that matter: the
 * first round draws its frames at once, and a clean one is shipped without
 * paying for a correction.
 */
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";

/** Kept in step with the constant in attempts.ts. */
const FIRST_ROUND_FRAMES = 5;

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
  // The audit carries which frame it looked at, so a grade can be per frame.
  auditStill.mockImplementation(async (img: { base64: string }) => ({ frame: img.base64 }));
  checkRoomPlacement.mockResolvedValue([]);
  collectShipIssues.mockResolvedValue([]);
});

describe("the first round", () => {
  it("draws the whole round at once and ships the clean one without a correction", async () => {
    const { generateAuditedImage } = await import("@/lib/projects/viz-generate/attempts");
    let n = 0;
    generateOneImage.mockImplementation(async () => ({ mimeType: "image/jpeg", base64: `f${++n}` }));
    // Every frame but the third lost a bedroom.
    gradeFloorplanStill.mockImplementation((audit: { frame: string }) =>
      audit.frame === "f3"
        ? { score: 0, failures: [], hardFailures: [] }
        : { score: 10, failures: ["1 bedroom(s) missing"], hardFailures: ["1 bedroom(s) missing"] },
    );

    const out = await generateAuditedImage(job, [], "3:4", ctx());
    expect(generateOneImage).toHaveBeenCalledTimes(FIRST_ROUND_FRAMES);
    expect(out.base64).toBe("f3");
    expect(out.auditIssues).toBeUndefined();
  });

  it("corrects the best of the round when none of them is clean", async () => {
    const { generateAuditedImage } = await import("@/lib/projects/viz-generate/attempts");
    let n = 0;
    generateOneImage.mockImplementation(async () => ({ mimeType: "image/jpeg", base64: `f${++n}` }));
    // The second frame is the least bad of the round; the correction that
    // follows it, told what it got wrong, comes back clean.
    gradeFloorplanStill.mockImplementation((audit: { frame: string }) => {
      const i = Number(audit.frame.slice(1));
      if (i === 2) return { score: 12, failures: ["b"], hardFailures: ["b"] };
      if (i > FIRST_ROUND_FRAMES) return { score: 0, failures: [], hardFailures: [] };
      return { score: 30 + i, failures: [`f${i}`], hardFailures: [`f${i}`] };
    });

    const out = await generateAuditedImage(job, [], "3:4", ctx());
    expect(generateOneImage).toHaveBeenCalledTimes(FIRST_ROUND_FRAMES + 1);
    // The call after the round is a correction, carrying the best frame's failure.
    const correction = String(generateOneImage.mock.calls[FIRST_ROUND_FRAMES]![0]);
    expect(correction).toContain("PREVIOUS ATTEMPT REJECTED");
    expect(correction).toContain("- b");
    expect(out.base64).toBe(`f${FIRST_ROUND_FRAMES + 1}`);
  });

  it("does not spend a whole round on a view that is never audited", async () => {
    const { generateAuditedImage } = await import("@/lib/projects/viz-generate/attempts");
    generateOneImage.mockResolvedValue({ mimeType: "image/jpeg", base64: "only" });
    const out = await generateAuditedImage({ ...(job as object), viewId: "kitchen" } as never, [], "3:4", ctx());
    expect(generateOneImage).toHaveBeenCalledTimes(1);
    expect(out.base64).toBe("only");
  });
});
