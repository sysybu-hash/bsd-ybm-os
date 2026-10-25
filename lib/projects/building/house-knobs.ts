/**
 * Run-time knobs for the house booklet and the scripts that drive it, read
 * live from the process environment.
 *
 * Not lib/env.ts: env parses once per process, and these are flipped while a
 * run is under way (flux-plan-package sets HOUSE_PLAN_GOLDEN before a batch,
 * a script sets ALLOW_PAID_AI for itself). None is a secret: keys and tokens
 * are read through env. scripts/audit-process-env.mjs allows this file.
 */
export type HouseKnob =
  | "ALLOW_PAID_AI"
  | "NEXT_RUNTIME"
  | "HOUSE_PLAN_WHOLE"
  | "HOUSE_PLAN_SIZE"
  | "HOUSE_PLAN_EVEN"
  | "HOUSE_PLAN_WIDE"
  | "HOUSE_PLAN_GOLDEN"
  | "HOUSE_PAINT_ATTEMPTS"
  | "HOUSE_PAINT_ONLY"
  | "HOUSE_MEASURE_BUDGET_ILS"
  | "HOUSE_BOOKLET_BUDGET_ILS"
  | "HOUSE_BOOKLET_IMAGE_MODEL"
  | "HOUSE_BOOKLET_TIMEOUT_MIN"
  | "HOUSE_BOOKLET_MAX_RSS_MB"
  | "HOUSE_BOOKLET_DIR"
  | "ANTHROPIC_MODEL"
  | "OPENAI_VISION_MODEL"
  | "AERIAL_VIEW"
  | "DBG_UNIT"
  | "NO_MIRROR";

export function houseKnob(name: HouseKnob): string | undefined {
  return process.env[name];
}

/** Set or clear a knob for the rest of this process. */
export function setHouseKnob(name: HouseKnob, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
