import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-finish");

/**
 * Choosing between finishes of one flat, which is a different problem from
 * choosing between guesses at a flat.
 *
 * Re-rolling used to be a lottery. Every attempt was a fresh invention of the
 * apartment, so the run could return a mirrored plan, a rotated one, or one with
 * a wing that does not exist, and picking the least bad of five bad draws is
 * still a bad draw — which is exactly what shipped, repeatedly.
 *
 * Now the walls, the outline, the openings and the furniture come from the CAD
 * and are identical in every attempt. What varies is only the finish. So the
 * same best-of-N that was papering over invented geometry is now doing the thing
 * it is actually good at: picking the best rendering of one correct plan.
 *
 * The audit's geometric fields carry that: footprint, rotation, mirroring,
 * rooms outside the outline. They were unusable while every frame failed them;
 * against a fixed geometry they separate a good finish from a careless one.
 */

export type FinishGrade = {
  score: number;
  failures: string[];
  /** The subset that disqualifies the frame outright, carried to the caller. */
  hardFailures?: string[];
};

export type FinishResult<T> = {
  image: T;
  score: number;
  failures: string[];
  hardFailures: string[];
  /** How many finishes were rendered in all — what the run actually cost. */
  attempts: number;
  /** True when it stopped early because a finish was clean enough. */
  stoppedEarly: boolean;
};

/**
 * Good enough to stop paying for another finish: nothing disqualifying and at
 * most a couple of soft complaints. A perfect audit effectively never happens,
 * so waiting for one would always burn the whole budget.
 */
export const FINISH_GOOD_ENOUGH = 2;

export async function pickBestFinish<T>(
  attempts: number,
  render: (attempt: number) => Promise<T | null>,
  grade: (image: T) => Promise<FinishGrade | null>,
  options?: { goodEnough?: number; label?: string },
): Promise<FinishResult<T> | null> {
  const goodEnough = options?.goodEnough ?? FINISH_GOOD_ENOUGH;
  let best: FinishResult<T> | null = null;
  let rendered = 0;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    const image = await render(attempt);
    if (!image) continue;
    rendered += 1;

    const graded = await grade(image);
    // No auditor is not a reason to throw the frame away — it is a reason to
    // keep it and say the choice was unaudited.
    if (!graded) {
      best ??= { image, score: Number.POSITIVE_INFINITY, failures: [], hardFailures: [], attempts: rendered, stoppedEarly: false };
      continue;
    }

    if (!best || graded.score < best.score) {
      best = {
        image,
        score: graded.score,
        failures: graded.failures,
        hardFailures: graded.hardFailures ?? [],
        attempts: rendered,
        stoppedEarly: false,
      };
    }
    if (graded.score <= goodEnough) {
      log.info("finish good enough, stopping", {
        label: options?.label,
        attempt,
        score: graded.score,
      });
      return {
        image,
        score: graded.score,
        failures: graded.failures,
        hardFailures: graded.hardFailures ?? [],
        attempts: rendered,
        stoppedEarly: true,
      };
    }
  }

  if (best) {
    best.attempts = rendered;
    log.info("settled on the best finish rendered", {
      label: options?.label,
      attempts: best.attempts,
      score: best.score,
      failures: best.failures,
    });
  }
  return best;
}
