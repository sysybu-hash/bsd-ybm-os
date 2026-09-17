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
