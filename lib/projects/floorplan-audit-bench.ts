import { z } from "zod";

import type { FloorplanVizAudit } from "@/lib/projects/floorplan-viz-audit";
import type { ClaudeModestyAudit } from "@/lib/projects/floorplan-viz-modesty-claude";

/**
 * How often each audit rule is right, measured on stills a person labelled.
 *
 * The auditor decides whether a paid frame ships and whether a booklet goes
 * out, and on דירה 14 it flagged a correctly oriented still as "turned 180
 * degrees" and a still with the sheet's six beds as wrong. A threshold or a
 * prompt change can only be judged against labels: per rule, how many of its
 * findings are real (precision), how many real defects it catches (recall),
 * and how often it changes its mind on the same frame (flip rate).
 *
 * A label left null is not counted either way — "a person has not decided"
 * is not "the defect is absent".
 */

/** Yes/no defects the auditor reports, read off its answer. */
export const AUDIT_BENCH_RULES = {
  rotated: (a: FloorplanVizAudit) => a.rotationVsPlanDegrees !== 0,
  mirrored: (a: FloorplanVizAudit) => a.mirroredVsPlan,
  stairsInside: (a: FloorplanVizAudit) => a.apartmentStairsNotInPlan > 0,
  terraceOmitted: (a: FloorplanVizAudit) => a.omittedOutdoorSpaces > 0,
  terraceInvented: (a: FloorplanVizAudit) => a.inventedOutdoorSpaces > 0,
  screens: (a: FloorplanVizAudit) => a.screenCount > 0,
  doubleBed: (a: FloorplanVizAudit) => a.hasDoubleBed,
  entranceMissing: (a: FloorplanVizAudit) => a.entranceDoorMissing,
  outsideOutline: (a: FloorplanVizAudit) => a.roomsOutsidePlanOutline > 0,
  doorsSealed: (a: FloorplanVizAudit) => (a.planDoorsSealed ?? 0) > 0,
} as const;

/** Things the auditor counts in the still, compared with the label's count. */
export const AUDIT_BENCH_COUNTS = {
  beds: (a: FloorplanVizAudit) => a.bedTotal,
  washers: (a: FloorplanVizAudit) => a.washerCount,
  bathtubs: (a: FloorplanVizAudit) => a.bathtubCount,
} as const;

export type AuditBenchRule = keyof typeof AUDIT_BENCH_RULES;
export type AuditBenchCount = keyof typeof AUDIT_BENCH_COUNTS;

const ruleKeys = Object.keys(AUDIT_BENCH_RULES) as [AuditBenchRule, ...AuditBenchRule[]];
const countKeys = Object.keys(AUDIT_BENCH_COUNTS) as [AuditBenchCount, ...AuditBenchCount[]];

const caseSchema = z.object({
  id: z.string().min(1),
  /** Which saved still: the run's title, the view and the attempt number. */
  still: z.object({
    /** Pins the run when several share a title (`floorplan:audit-bench list`). */
    runId: z.string().min(1).optional(),
    runTitle: z.string().min(1),
    viewId: z.enum(["overview", "isometric", "interior"]),
    roomName: z.string().optional(),
    attempt: z.number().int().min(1),
  }),
  status: z.enum(["draft", "approved"]),
  defects: z.record(z.enum(ruleKeys), z.boolean().nullable()),
  counts: z.record(z.enum(countKeys), z.number().int().min(0).nullable()),
  note: z.string().optional(),
});

export const auditBenchLabelsSchema = z.object({
  labelledBy: z.string().nullable(),
  cases: z.array(caseSchema).min(1),
});

export type AuditBenchLabels = z.infer<typeof auditBenchLabelsSchema>;
/** A labelled still; a rule or count it leaves out is simply undecided. */
export type AuditBenchCase = Omit<z.infer<typeof caseSchema>, "defects" | "counts"> & {
  defects: Partial<Record<AuditBenchRule, boolean | null>>;
  counts: Partial<Record<AuditBenchCount, number | null>>;
};

export type RuleScore = {
  /** Case × repeat judgements with a label. */
  judged: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** Null when the rule never fired: nothing to be right or wrong about. */
  precision: number | null;
  /** Null when no labelled case has the defect. */
  recall: number | null;
  /** Share of cases scanned more than once where the answers disagreed. */
  flipRate: number | null;
};

export type CountScore = {
  judged: number;
  exact: number;
  exactRate: number | null;
  meanAbsError: number | null;
  flipRate: number | null;
};

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

function flipRate(perCase: unknown[][]): number | null {
  const repeated = perCase.filter((answers) => answers.length > 1);
  const flipped = repeated.filter((answers) => new Set(answers.map(String)).size > 1);
  return ratio(flipped.length, repeated.length);
}

/** One scan's answer, as the bench reads it: which rules fired, what it counted. */
export type AuditBenchAnswer = {
  rules: Partial<Record<AuditBenchRule, boolean>>;
  counts: Partial<Record<AuditBenchCount, number>>;
};

/** A live audit, read rule by rule. */
export function answerFromAudit(audit: FloorplanVizAudit): AuditBenchAnswer {
  const rules: AuditBenchAnswer["rules"] = {};
  for (const rule of ruleKeys) rules[rule] = AUDIT_BENCH_RULES[rule](audit);
  const counts: AuditBenchAnswer["counts"] = {};
  for (const count of countKeys) counts[count] = AUDIT_BENCH_COUNTS[count](audit);
  return { rules, counts };
}

/** The Claude second judge's own answer, for the rules and counts it reports. */
export function answerFromClaude(audit: ClaudeModestyAudit): AuditBenchAnswer {
  return {
    rules: {
      rotated: audit.rotationVsPlanDegrees !== 0,
      mirrored: audit.mirroredVsPlan,
      stairsInside: audit.apartmentStairsNotInPlan > 0,
      terraceOmitted: audit.omittedOutdoorSpaces > 0,
      terraceInvented: audit.inventedOutdoorSpaces > 0,
      screens: audit.screenCount > 0,
      doubleBed: audit.hasDoubleBed,
      entranceMissing: audit.entranceDoorMissing,
      outsideOutline: audit.roomsOutsidePlanOutline > 0,
    },
    counts: { washers: audit.washerCount, bathtubs: audit.bathtubCount },
  };
}

/** What a rule would say if it fired only when both auditors fired. */
export function answerWhenBothAgree(a: AuditBenchAnswer, b: AuditBenchAnswer): AuditBenchAnswer {
  const rules: AuditBenchAnswer["rules"] = {};
  for (const rule of ruleKeys) {
    const x = a.rules[rule];
    const y = b.rules[rule];
    if (x != null && y != null) rules[rule] = x && y;
  }
  return { rules, counts: {} };
}

/**
 * A saved findings list, read rule by rule — the free way to score scans that
 * already happened. A rule not in the list did not fire. A count is known
 * only when a finding states it ("beds 6, plan has 4").
 */
export function answerFromFindings(findings: string[]): AuditBenchAnswer {
  const has = (re: RegExp) => findings.some((line) => re.test(line));
  const count = (re: RegExp) => {
    for (const line of findings) {
      const m = re.exec(line);
      if (m?.[1]) return Number(m[1]);
    }
    return undefined;
  };
  const counts: AuditBenchAnswer["counts"] = {};
  const beds = count(/^beds (\d+)/i);
  const washers = count(/^washers (\d+)/i);
  const bathtubs = count(/^bathtubs? (\d+)/i);
  if (beds != null) counts.beds = beds;
  if (washers != null) counts.washers = washers;
  if (bathtubs != null) counts.bathtubs = bathtubs;
  return {
    rules: {
      rotated: has(/turned \d+ degrees/i),
      mirrored: has(/mirrored/i),
      stairsInside: has(/stair flight/i),
      terraceOmitted: has(/printed terrace\(s\) missing/i),
      terraceInvented: has(/terrace\(s\) invented/i),
      screens: has(/screen\(s\)/i),
      doubleBed: has(/double bed/i),
      entranceMissing: has(/front door missing/i),
      outsideOutline: has(/invented outside the plan outline/i),
      doorsSealed: has(/door\(s\) the plan draws sealed/i),
    },
    counts,
  };
}

/**
 * Score every rule and count over the labelled cases. Each case carries the
 * answers of however many scans were made of it.
 */
export function scoreAuditBench(
  results: Array<{ label: AuditBenchCase; answers: AuditBenchAnswer[] }>,
): { rules: Record<AuditBenchRule, RuleScore>; counts: Record<AuditBenchCount, CountScore> } {
  const rules = {} as Record<AuditBenchRule, RuleScore>;
  for (const rule of ruleKeys) {
    const tally = { tp: 0, fp: 0, fn: 0, tn: 0 };
    const perCase: boolean[][] = [];
    for (const { label, answers } of results) {
      const truth = label.defects[rule];
      if (truth == null) continue;
      const said = answers.flatMap((answer) => {
        const fired = answer.rules[rule];
        return fired == null ? [] : [fired];
      });
      perCase.push(said);
      for (const fired of said) {
        if (fired && truth) tally.tp += 1;
        else if (fired) tally.fp += 1;
        else if (truth) tally.fn += 1;
        else tally.tn += 1;
      }
    }
    rules[rule] = {
      judged: tally.tp + tally.fp + tally.fn + tally.tn,
      ...tally,
      precision: ratio(tally.tp, tally.tp + tally.fp),
      recall: ratio(tally.tp, tally.tp + tally.fn),
      flipRate: flipRate(perCase),
    };
  }

  const counts = {} as Record<AuditBenchCount, CountScore>;
  for (const count of countKeys) {
    const tally = { judged: 0, exact: 0, absError: 0 };
    const perCase: number[][] = [];
    for (const { label, answers } of results) {
      const truth = label.counts[count];
      if (truth == null) continue;
      const said = answers.flatMap((answer) => {
        const value = answer.counts[count];
        return value == null ? [] : [value];
      });
      perCase.push(said);
      for (const value of said) {
        tally.judged += 1;
        if (value === truth) tally.exact += 1;
        tally.absError += Math.abs(value - truth);
      }
    }
    counts[count] = {
      judged: tally.judged,
      exact: tally.exact,
      exactRate: ratio(tally.exact, tally.judged),
      meanAbsError: ratio(tally.absError, tally.judged),
      flipRate: flipRate(perCase),
    };
  }
  return { rules, counts };
}

/** The scores as a Markdown table, for a PR or a report. */
export function formatAuditBench(score: ReturnType<typeof scoreAuditBench>): string {
  const pct = (value: number | null) => (value == null ? "—" : `${Math.round(value * 100)}%`);
  const lines = [
    "| rule | judged | TP | FP | FN | TN | precision | recall | flip rate |",
    "|---|---|---|---|---|---|---|---|---|",
    ...Object.entries(score.rules).map(
      ([rule, s]) =>
        `| ${rule} | ${s.judged} | ${s.tp} | ${s.fp} | ${s.fn} | ${s.tn} | ${pct(s.precision)} | ${pct(s.recall)} | ${pct(s.flipRate)} |`,
    ),
    "",
    "| count | judged | exact | mean abs error | flip rate |",
    "|---|---|---|---|---|",
    ...Object.entries(score.counts).map(
      ([count, s]) =>
        `| ${count} | ${s.judged} | ${pct(s.exactRate)} | ${s.meanAbsError == null ? "—" : s.meanAbsError.toFixed(2)} | ${pct(s.flipRate)} |`,
    ),
  ];
  return lines.join("\n");
}
