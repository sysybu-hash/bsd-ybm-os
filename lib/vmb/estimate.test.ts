import { estimateBooklet, runBlock } from "@/lib/vmb/estimate";

describe("estimateBooklet", () => {
  it("holds every picture painted, and expects some to go out as the free render", () => {
    const e = estimateBooklet("house", ["exterior_day", "aerial", "interior"]);
    expect(e.lines.map((l) => [l.view, l.pictures])).toEqual([
      ["exterior_day", 4],
      ["aerial", 2],
      ["interior", 6],
    ]);
    expect(e.base).toBe(4);
    expect(e.cap).toBe(16);
    expect(e.expected).toBeLessThanOrEqual(e.cap);
    expect(e.expected).toBeGreaterThan(e.base);
  });

  it("drops views a kind has no pictures of", () => {
    const e = estimateBooklet("flat", ["exterior_day", "interior"]);
    expect(e.lines.map((l) => l.view)).toEqual(["interior"]);
  });

  it("charges the base alone when no view yields a picture", () => {
    const e = estimateBooklet("flat", ["aerial"]);
    expect(e).toMatchObject({ pictures: 0, cap: 2, expected: 2 });
  });
});

describe("runBlock", () => {
  const ok = { confirmed: true, files: 3, active: true, balance: 100, cap: 20, liveJob: false, runnerReady: true };
  it("lets a ready project start", () => expect(runBlock(ok)).toBeNull());
  it("names the first thing in the way", () => {
    expect(runBlock({ ...ok, liveJob: true, confirmed: false })).toBe("already_running");
    expect(runBlock({ ...ok, files: 0 })).toBe("no_files");
    expect(runBlock({ ...ok, confirmed: false })).toBe("questions_pending");
    expect(runBlock({ ...ok, active: false })).toBe("no_subscription");
    expect(runBlock({ ...ok, balance: 19 })).toBe("insufficient_credits");
    expect(runBlock({ ...ok, runnerReady: false })).toBe("runner_not_ready");
  });
});
