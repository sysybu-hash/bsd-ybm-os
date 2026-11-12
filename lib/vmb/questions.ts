import type { VmbProjectKind } from "@/lib/validation/schemas/vmb-projects";
import type { ScanFacts } from "@/lib/vmb/scan";

/**
 * The one questions form (rule 13.5): asked once, before any charge, every question with a default, and none whose answer
 * the files already give. Each value keeps where it came from (rule 13.2): `sheet` (written in a file), `inferred` (worked
 * out from what is written, by a named rule), `user`, or `default` — and every `default` lands on the booklet's
 * assumptions page. Nothing here stops the pipeline: an unanswered form runs on its defaults.
 */

export const QUESTION_IDS = ["units", "floorHeight", "facade", "north", "surroundings", "furniture", "views"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];
export type AnswerSource = "sheet" | "inferred" | "user" | "default";
export type AnswerValue = string | number | string[];
export type Answer = { value: AnswerValue; source: AnswerSource; /** The rule or fact a sheet/inferred value came from. */ from?: string };

export type Question =
  | { id: QuestionId; type: "choice"; options: readonly string[]; default: string; known?: Answer }
  | { id: QuestionId; type: "multi"; options: readonly string[]; default: string[]; known?: Answer }
  | { id: QuestionId; type: "number"; min: number; max: number; step: number; default: number; known?: Answer };

export const UNIT_OPTIONS = ["mm", "cm", "m"] as const;
const UNIT_M: Record<(typeof UNIT_OPTIONS)[number], number> = { mm: 0.001, cm: 0.01, m: 1 };
const FACADES = ["stone", "plaster", "concrete", "metal", "glass", "mixed"] as const;
const NORTH = ["unknown", "up", "right", "down", "left"] as const;
const SURROUNDINGS = ["none", "simple", "full"] as const;
const FURNITURE = ["none", "basic", "full"] as const;
const VIEWS = ["exterior_day", "exterior_dusk", "aerial", "interior"] as const;

/** Defaults by building kind: what an Israeli office of that kind most often has. */
const DEFAULTS: Record<VmbProjectKind, { floorHeight: number; facade: string; furniture: string; views: string[] }> = {
  flat: { floorHeight: 3.0, facade: "plaster", furniture: "full", views: ["interior"] },
  house: { floorHeight: 3.0, facade: "stone", furniture: "full", views: ["exterior_day", "aerial", "interior"] },
  building: { floorHeight: 3.1, facade: "stone", furniture: "basic", views: ["exterior_day", "exterior_dusk", "aerial"] },
  industrial: { floorHeight: 5.0, facade: "metal", furniture: "none", views: ["exterior_day", "aerial"] },
  public: { floorHeight: 4.0, facade: "stone", furniture: "basic", views: ["exterior_day", "aerial", "interior"] },
};

/** The unit every sheet that says one agrees on; null when none says or they disagree. */
export function unitsFromSheets(facts: ScanFacts[]): (typeof UNIT_OPTIONS)[number] | null {
  const said = new Set(facts.map((f) => f.headerUnitsM).filter((v): v is number => v != null));
  if (said.size !== 1) return null;
  const [m] = [...said];
  return UNIT_OPTIONS.find((u) => Math.abs(UNIT_M[u] - m!) < 1e-9) ?? null;
}

/**
 * Floor-to-floor height from the signed level marks of all sheets together: the most common step between neighbouring
 * levels that is a storey (2.5–6 m). Null when no two marks are a storey apart.
 */
export function floorHeightFromLevels(facts: ScanFacts[]): number | null {
  const levels = [...new Set(facts.flatMap((f) => f.levels))].sort((a, b) => a - b);
  const steps = new Map<number, number>();
  for (let i = 1; i < levels.length; i++) {
    const d = Math.round((levels[i]! - levels[i - 1]!) * 20) / 20;
    if (d >= 2.5 && d <= 6) steps.set(d, (steps.get(d) ?? 0) + 1);
  }
  const [best] = [...steps].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return best ? best[0] : null;
}

/** The questions for one project, with what the files already answer filled in as `known`. */
export function projectQuestions(kind: VmbProjectKind, facts: ScanFacts[]): Question[] {
  const d = DEFAULTS[kind];
  const units = unitsFromSheets(facts);
  const storey = floorHeightFromLevels(facts);
  const qs: Question[] = [
    { id: "units", type: "choice", options: UNIT_OPTIONS, default: "cm", known: units ? { value: units, source: "sheet", from: "header_units" } : undefined },
    { id: "floorHeight", type: "number", min: 2.4, max: 12, step: 0.05, default: d.floorHeight, known: storey ? { value: storey, source: "inferred", from: "level_marks" } : undefined },
  ];
  // A flat is drawn from inside: its facade, north light and street are not in its pictures.
  if (kind !== "flat") {
    qs.push(
      { id: "facade", type: "choice", options: FACADES, default: d.facade },
      { id: "north", type: "choice", options: NORTH, default: "unknown" },
      { id: "surroundings", type: "choice", options: SURROUNDINGS, default: "simple" },
    );
  }
  qs.push({ id: "furniture", type: "choice", options: FURNITURE, default: d.furniture }, { id: "views", type: "multi", options: VIEWS, default: d.views });
  return qs;
}

/** Keeps only answers that fit their question; anything else is dropped, so the default (or the file) stands. */
export function cleanAnswers(questions: Question[], input: Record<string, unknown>): Partial<Record<QuestionId, AnswerValue>> {
  const out: Partial<Record<QuestionId, AnswerValue>> = {};
  for (const q of questions) {
    const v = input[q.id];
    if (v == null) continue;
    if (q.type === "choice" && typeof v === "string" && q.options.includes(v)) out[q.id] = v;
    else if (q.type === "multi" && Array.isArray(v)) {
      const picked = q.options.filter((o) => v.includes(o));
      if (picked.length) out[q.id] = picked;
    } else if (q.type === "number" && typeof v === "number" && Number.isFinite(v) && v >= q.min && v <= q.max) out[q.id] = Number((Math.round(v / q.step) * q.step).toFixed(2));
  }
  return out;
}

/** The value each question runs with: the user's answer, else what the files say, else the default — with its source. */
export function resolveAnswers(questions: Question[], user: Partial<Record<QuestionId, AnswerValue>>): Record<QuestionId, Answer> {
  const out = {} as Record<QuestionId, Answer>;
  for (const q of questions) {
    const mine = user[q.id];
    out[q.id] = mine !== undefined ? { value: mine, source: "user" } : (q.known ?? { value: q.default, source: "default" });
  }
  return out;
}

/** The answers that rest on a default only: these go on the booklet's assumptions page. */
export function assumed(resolved: Record<QuestionId, Answer>): QuestionId[] {
  return (Object.keys(resolved) as QuestionId[]).filter((id) => resolved[id].source === "default");
}
