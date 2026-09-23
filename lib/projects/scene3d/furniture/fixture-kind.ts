/**
 * Which sanitary fixture a measured block is.
 *
 * The rule is the one the oblique SVG plate already draws by: a block much
 * longer than it is wide is a bath, anything else is a basin or a pan. Shared
 * so the plate and the render can never disagree about what a room contains —
 * the fidelity checks compare them.
 */

export type FixtureKind = "bath" | "basin";

/** A bath is long and narrow; the plate's own threshold is 1.6. */
export const BATH_RATIO = 1.6;

export function fixtureKind(widthM: number, depthM: number): FixtureKind {
  const long = Math.max(widthM, depthM);
  const short = Math.min(widthM, depthM);
  return long > short * BATH_RATIO ? "bath" : "basin";
}
