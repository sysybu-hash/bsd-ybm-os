import type { VmbProjectKind } from "@/lib/validation/schemas/vmb-projects";
import { VMB_BOOKLET_PRICING } from "@/lib/vmb/plans";

/**
 * The cost step (rule 13.8): an estimate and a ceiling in credits, before anything runs. The ceiling is held when the run
 * starts; what was not delivered painted is released when it ends.
 */

export type ViewKey = keyof (typeof VMB_BOOKLET_PRICING.picturesPerView)["house"];
export type CostLine = { view: ViewKey; pictures: number; credits: number };
export type BookletEstimate = {
  lines: CostLine[];
  base: number;
  pictures: number;
  /** Every picture painted: what is held. */
  cap: number;
  /** The likely bill, with some pictures going out as the free render. */
  expected: number;
};

const VIEW_ORDER: ViewKey[] = ["exterior_day", "exterior_dusk", "aerial", "interior"];

export function estimateBooklet(kind: VmbProjectKind, views: readonly string[]): BookletEstimate {
  const per = VMB_BOOKLET_PRICING.picturesPerView[kind];
  const lines: CostLine[] = VIEW_ORDER.filter((v) => views.includes(v) && per[v] > 0).map((view) => ({
    view,
    pictures: per[view],
    credits: per[view] * VMB_BOOKLET_PRICING.creditsPerPicture,
  }));
  const base = VMB_BOOKLET_PRICING.base[kind];
  const pictures = lines.reduce((a, l) => a + l.pictures, 0);
  const paint = lines.reduce((a, l) => a + l.credits, 0);
  return {
    lines,
    base,
    pictures,
    cap: base + paint,
    expected: base + Math.ceil(paint * VMB_BOOKLET_PRICING.expectedPaintedShare),
  };
}

export type RunBlock = "questions_pending" | "no_files" | "no_subscription" | "insufficient_credits" | "already_running" | "runner_not_ready";

/** Why the start button is off, first reason first; null when it may be pressed. */
export function runBlock(s: { confirmed: boolean; files: number; active: boolean; balance: number; cap: number; liveJob: boolean; runnerReady: boolean }): RunBlock | null {
  if (s.liveJob) return "already_running";
  if (!s.files) return "no_files";
  if (!s.confirmed) return "questions_pending";
  if (!s.active) return "no_subscription";
  if (s.balance < s.cap) return "insufficient_credits";
  if (!s.runnerReady) return "runner_not_ready";
  return null;
}
