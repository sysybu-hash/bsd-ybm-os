import { advance, currentStage, etaSeconds, jobPercent, type JobProgress } from "@/lib/vmb/progress";

const base = (): JobProgress => ({
  startedAt: 0,
  stages: [
    { key: "read", weight: 1, done: 0, total: 4 },
    { key: "build", weight: 2, done: 0, total: 1 },
    { key: "render", weight: 7, done: 0, total: 10 },
  ],
});

describe("job progress", () => {
  it("adds up to exactly 100 only when every stage is done", () => {
    let p = base();
    expect(jobPercent(p.stages)).toBe(0);
    p = advance(p, "read", 4);
    p = advance(p, "build", 1);
    p = advance(p, "render", 9);
    expect(jobPercent(p.stages)).toBe(93);
    p = advance(p, "render", 10);
    expect(jobPercent(p.stages)).toBe(100);
    expect(currentStage(p.stages)).toBeNull();
  });

  it("never shows 100 while a stage is unfinished, and never goes backwards past the clamp", () => {
    const p = advance(advance(advance(base(), "read", 4), "build", 1), "render", 9999);
    expect(jobPercent(p.stages)).toBe(100);
    const q = advance(advance(base(), "read", 4), "render", 10);
    expect(jobPercent(q.stages)).toBe(80);
    expect(currentStage(q.stages)?.key).toBe("build");
  });

  it("counts an empty stage as done, so a job with nothing to read cannot get stuck", () => {
    const p = advance(advance(base(), "read", 0, 0), "build", 1);
    expect(currentStage(p.stages)?.key).toBe("render");
  });

  it("estimates time left from history, else from its own pace", () => {
    const p = advance(base(), "read", 4);
    expect(etaSeconds(p, 10_000, 3)).toBe(27);
    expect(etaSeconds(p, 10_000)).toBe(90);
    expect(etaSeconds(base(), 10_000)).toBeNull();
  });

  it("ignores unknown stage keys", () => {
    expect(advance(base(), "nope", 3)).toEqual(base());
  });
});
