/**
 * Whether there is time left for another paid round trip.
 *
 * A run that overruns the platform's function limit returns nothing and
 * throws away every image call it already paid for — 28-8-23-2 died that way
 * twice, at around nine minutes. Past the deadline the loops stop re-rolling
 * and ship the best frame they have, which is always worth more than a 504.
 */
export function timeLeft(deadlineMs: number | undefined, needMs: number, now = Date.now()): boolean {
  return deadlineMs == null || now + needMs <= deadlineMs;
}

/** One image call plus its audit, measured on the runs that did finish. */
export const ATTEMPT_MS = 55_000;
