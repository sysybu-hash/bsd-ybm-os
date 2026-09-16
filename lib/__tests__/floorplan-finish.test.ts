import { FINISH_GOOD_ENOUGH, pickBestFinish } from "@/lib/projects/floorplan-finish";

const grader = (scores: Record<string, number>) => async (image: string) => ({
  score: scores[image] ?? 99,
  failures: scores[image] === 0 ? [] : [`${image} failed`],
});

describe("picking between finishes of one flat", () => {
  it("keeps the best-scoring finish when none is clean", () => {
    return expect(
      pickBestFinish(
        3,
        async (n) => `f${n}`,
        grader({ f1: 40, f2: 12, f3: 30 }),
      ).then((r) => [r!.image, r!.score, r!.attempts]),
    ).resolves.toEqual(["f2", 12, 3]);
  });

  it("stops as soon as a finish is good enough, rather than buying the rest", async () => {
    const rendered: number[] = [];
    const result = await pickBestFinish(
      5,
      async (n) => {
        rendered.push(n);
        return `f${n}`;
      },
      grader({ f1: 40, f2: FINISH_GOOD_ENOUGH, f3: 0 }),
    );
    expect(result!.image).toBe("f2");
    expect(result!.stoppedEarly).toBe(true);
    // Three, four and five were never paid for.
    expect(rendered).toEqual([1, 2]);
  });

  it("skips an attempt that produced no image and carries on", async () => {
    const result = await pickBestFinish(
      3,
      async (n) => (n === 1 ? null : `f${n}`),
      grader({ f2: 20, f3: 8 }),
    );
    expect(result!.image).toBe("f3");
  });

  it("keeps an unaudited frame rather than returning nothing", async () => {
    // No auditor is a reason to say the choice was unaudited, not to ship
    // nothing.
    const result = await pickBestFinish(2, async (n) => `f${n}`, async () => null);
    expect(result!.image).toBe("f1");
    expect(result!.score).toBe(Number.POSITIVE_INFINITY);
  });

  it("prefers any audited frame over an unaudited one", async () => {
    const result = await pickBestFinish(
      2,
      async (n) => `f${n}`,
      async (image) => (image === "f1" ? null : { score: 50, failures: ["soft"] }),
    );
    expect(result!.image).toBe("f2");
    expect(result!.score).toBe(50);
  });

  it("returns nothing when nothing rendered at all", async () => {
    expect(await pickBestFinish(3, async () => null, grader({}))).toBeNull();
  });

  it("renders at least once even when asked for none", async () => {
    const result = await pickBestFinish(0, async (n) => `f${n}`, grader({ f1: 5 }));
    expect(result!.attempts).toBe(1);
  });
});
