import { timeLeft } from "@/lib/projects/viz-generate/budget";

describe("floorplan viz time budget", () => {
  it("allows a round trip that fits, and stops one that would overrun", () => {
    // 28-8-23-2 died twice at the platform's 300s limit, throwing away every
    // image call it had already paid for.
    const now = 1_000_000;
    const deadline = now + 60_000;
    expect(timeLeft(deadline, 55_000, now)).toBe(true);
    expect(timeLeft(deadline, 61_000, now)).toBe(false);
    expect(timeLeft(deadline, 0, deadline + 1)).toBe(false);
  });

  it("never blocks a run that was given no deadline", () => {
    expect(timeLeft(undefined, 10 * 60_000)).toBe(true);
  });
});

describe("the measured route's clock", () => {
  it("stops re-rolling a finish once the budget is spent", async () => {
    // The measured path had no clock: a run that read the sheet, read its
    // scale, measured the flat and then re-rolled its finish went past ten
    // minutes, and the platform returned nothing for any of it.
    const { pickBestFinish } = await import("@/lib/projects/floorplan-finish");
    let rendered = 0;
    const result = await pickBestFinish(
      5,
      async () => {
        rendered += 1;
        return { frame: rendered };
      },
      async () => ({ score: 99, failures: ["never good enough"], hardFailures: [] }),
      { deadlineMs: Date.now() - 1 },
    );
    expect(rendered).toBe(1);
    expect(result?.image).toEqual({ frame: 1 });
  });

  it("runs every attempt when there is time", async () => {
    const { pickBestFinish } = await import("@/lib/projects/floorplan-finish");
    let rendered = 0;
    await pickBestFinish(
      3,
      async () => {
        rendered += 1;
        return { frame: rendered };
      },
      async () => ({ score: 99, failures: ["never good enough"], hardFailures: [] }),
      { deadlineMs: Date.now() + 10 * 60_000 },
    );
    expect(rendered).toBe(3);
  });
});
