import { AsyncLocalStorage } from "node:async_hooks";

import { emptyModelUsage, mergeLedgers, runWithAiUsage, type AiUsageLedger } from "@/lib/ai-usage";
import { priceLedger, priceModelUsage } from "@/lib/ai-pricing";
import { GEMINI_IMAGE_LITE_MODEL, GEMINI_IMAGE_NANO_BANANA_21_MODEL, GEMINI_STABLE_TEXT_MODEL } from "@/lib/gemini-model";
import type { FinishImageSize } from "@/lib/projects/building/finish";
import { houseKnob } from "@/lib/projects/building/house-knobs";

/**
 * What a private-house booklet spends on the models, and where it stops.
 *
 * ESTIMATES, not the bill. Per-model prices are the ones in lib/ai-pricing.ts
 * (the providers' price lists on the date it gives); the shekel figure is the
 * dollar figure times a fixed rate; a call not yet made is costed from the
 * model's per-picture price and the images it is sent, before Google says
 * what it used.
 */
export const HOUSE_USD_TO_ILS_ESTIMATE = 3.7;
/** Input tokens Gemini counts for one image sent to it, about; the prompt adds a few hundred. */
export const HOUSE_INPUT_TOKENS_PER_IMAGE_ESTIMATE = 1_300;
export const HOUSE_PROMPT_TOKENS_ESTIMATE = 600;
/**
 * A 1K picture's output: 1,120 image tokens, the per-picture price; Flash
 * image added some 600 of thinking to each (9/10/2026).
 */
export const HOUSE_IMAGE_TOKENS_ESTIMATE = 1_120;
export const HOUSE_THINKING_TOKENS_ESTIMATE = 600;
export type HouseImageSize = FinishImageSize;
/**
 * A picture's output tokens by its size, as Google bills them: on Nano Banana
 * 2.1 at $30 a million, $0.0336 at 1K, $0.0504 at 2K, $0.113 at 4K (15/10/2026).
 */
export const HOUSE_IMAGE_TOKENS_BY_SIZE: Record<HouseImageSize, number> = { "1K": HOUSE_IMAGE_TOKENS_ESTIMATE, "2K": 1_680, "4K": 3_780 };
/**
 * Thinking a picture of each size adds: Gottlieb C floor 1 whole at 4K
 * (15/10/2026) thought 1,840 tokens, three times the 1K estimate, and
 * cost ₪0.50 against ₪0.48 held for it.
 */
export const HOUSE_THINKING_TOKENS_BY_SIZE: Record<HouseImageSize, number> = { "1K": HOUSE_THINKING_TOKENS_ESTIMATE, "2K": HOUSE_THINKING_TOKENS_ESTIMATE, "4K": 2_000 };
/**
 * The size every photoreal picture is asked for (finishPass). 1K, the
 * regular size: on Nano Banana 2.1 a 2K picture costs half as much again.
 */
export const HOUSE_IMAGE_SIZE: HouseImageSize = "1K";

/**
 * A storey's plan painted whole, in one call, instead of in six parts
 * (plan-tiles.ts): HOUSE_PLAN_WHOLE=1. One painter's light and materials over
 * both homes and the yard, no seams — at 4K, where the parts were 1K each.
 */
export function housePlanWhole(): boolean {
  return houseKnob("HOUSE_PLAN_WHOLE") === "1";
}

/** The size a whole storey is painted at: HOUSE_PLAN_SIZE (1K, 2K or 4K), else 4K. */
export function housePlanImageSize(): HouseImageSize {
  const v = houseKnob("HOUSE_PLAN_SIZE")?.toUpperCase();
  return v === "1K" || v === "2K" || v === "4K" ? v : "4K";
}
/**
 * The image models a booklet paints with, in order: Nano Banana 2.1 ($0.0336
 * a 1K picture), then Nano Banana 2 Lite at the same price. Never Pro or
 * Flash, at two to four times as much a picture.
 */
export const HOUSE_IMAGE_MODELS: readonly string[] = [GEMINI_IMAGE_NANO_BANANA_21_MODEL, GEMINI_IMAGE_LITE_MODEL];

/**
 * Image calls a picture, repairs included: HOUSE_PAINT_ATTEMPTS (1–5), else 3.
 * The painter and the estimate the user approves both read it.
 */
export function houseAttemptsPerPicture(): number {
  const cap = Number(houseKnob("HOUSE_PAINT_ATTEMPTS"));
  return cap >= 1 && cap <= 5 ? Math.floor(cap) : 3;
}

/** The ceiling of the measuring run's vision reading: HOUSE_MEASURE_BUDGET_ILS, else ₪3. */
export function houseMeasureBudgetIls(): number {
  const v = Number(houseKnob("HOUSE_MEASURE_BUDGET_ILS"));
  return Number.isFinite(v) && v > 0 ? v : 3;
}

/** Text out of one vision check of a painting or a sheet, about. */
export const HOUSE_TEXT_OUTPUT_TOKENS_ESTIMATE = 400;

export type HouseCost = { calls: number; images: number; usd: number; ils: number };

/** One picture's painting: what it cost, and how it ended. */
export type PictureCost = HouseCost & {
  /** The house model it belongs to ("דגם A"). */
  group: string;
  name: string;
  outcome: "painted" | "reused" | "kept-render" | "budget";
};

/**
 * Whether this process may call a paid model: the app's own server, or a
 * script started with ALLOW_PAID_AI=1. A script that checks code calls
 * nothing it was not told to; tests hand the painter a mock instead.
 */
export function paidAiAllowed(): boolean {
  return Boolean(houseKnob("NEXT_RUNTIME")) || houseKnob("ALLOW_PAID_AI") === "1";
}

/** The ceiling a run paints within when none is given: HOUSE_BOOKLET_BUDGET_ILS, else ₪50. */
export function defaultHouseBudgetIls(): number {
  const v = Number(houseKnob("HOUSE_BOOKLET_BUDGET_ILS"));
  return Number.isFinite(v) && v > 0 ? v : 50;
}

export type HouseSpend = {
  /** Every call the job made, once each picture's own ledger is folded in. */
  ledger: AiUsageLedger;
  /** The ledgers of pictures being painted now, counted towards the budget before they are folded in. */
  open: Set<AiUsageLedger>;
  usdToIls: number;
  budgetIls: number | null;
  /** Set when a call was not made for the budget: nothing more is painted. */
  stopped: boolean;
  /** Shekels held for calls in flight, which Google has not yet billed: four pictures paint at once. */
  reservedIls: number;
  /** Pictures not painted at all for the budget, each model's in turn. */
  skipped: string[];
  /** Every picture's painting, in the order they finished. */
  pictures: PictureCost[];
};

export function houseSpend(options?: { budgetIls?: number | null; usdToIls?: number }): HouseSpend {
  const budget = options?.budgetIls;
  return {
    ledger: {},
    open: new Set(),
    usdToIls: options?.usdToIls ?? HOUSE_USD_TO_ILS_ESTIMATE,
    budgetIls: budget != null && Number.isFinite(budget) && budget > 0 ? budget : null,
    stopped: false,
    reservedIls: 0,
    skipped: [],
    pictures: [],
  };
}

export function costOf(ledger: AiUsageLedger, usdToIls: number, at = new Date()): HouseCost {
  const usd = priceLedger(ledger, at).usd;
  const rows = Object.values(ledger);
  return {
    calls: rows.reduce((n, r) => n + r.calls, 0),
    images: rows.reduce((n, r) => n + r.outputImages, 0),
    usd,
    ils: usd * usdToIls,
  };
}

/** The job so far, the pictures being painted included. */
export function spentSoFar(spend: HouseSpend, at = new Date()): HouseCost {
  const all = mergeLedgers({}, spend.ledger);
  for (const open of spend.open) mergeLedgers(all, open);
  return costOf(all, spend.usdToIls, at);
}

/** One image call to `model` sent `images` pictures, asked for a `size` picture, before it is made. */
export function imageCallEstimateUsd(model: string, images: number, at = new Date(), size: HouseImageSize = HOUSE_IMAGE_SIZE): number {
  const usage = {
    ...emptyModelUsage(),
    calls: 1,
    inputTokens: HOUSE_PROMPT_TOKENS_ESTIMATE + images * HOUSE_INPUT_TOKENS_PER_IMAGE_ESTIMATE,
    outputTokens: HOUSE_THINKING_TOKENS_BY_SIZE[size],
    imageTokens: HOUSE_IMAGE_TOKENS_BY_SIZE[size],
    outputImages: 1,
  };
  return priceModelUsage(model, usage, at) ?? 0;
}

/** One vision check sent `images` pictures, answered in a few hundred tokens of JSON. */
export function textCallEstimateUsd(images: number, at = new Date(), model = GEMINI_STABLE_TEXT_MODEL): number {
  const usage = {
    ...emptyModelUsage(),
    calls: 1,
    inputTokens: HOUSE_PROMPT_TOKENS_ESTIMATE + images * HOUSE_INPUT_TOKENS_PER_IMAGE_ESTIMATE,
    outputTokens: HOUSE_TEXT_OUTPUT_TOKENS_ESTIMATE,
  };
  return priceModelUsage(model, usage, at) ?? 0;
}

/** One painting attempt at most: the image call, and the vision check of what came back. */
export function attemptEstimateUsd(model: string, images: number, at = new Date(), size: HouseImageSize = HOUSE_IMAGE_SIZE): number {
  return imageCallEstimateUsd(model, images, at, size) + textCallEstimateUsd(2, at);
}

/**
 * Whether the next image call fits the budget. A call that would not is never
 * made, and the spend is stopped so no later picture tries: the budget is
 * the user's ceiling, not a target.
 */
export function affords(spend: HouseSpend, model: string, images: number, at = new Date(), size: HouseImageSize = HOUSE_IMAGE_SIZE): boolean {
  const release = reserve(spend, model, images, at, size);
  release?.();
  return release != null;
}

/**
 * The next attempt's most, held against the budget until it is billed —
 * with the calls in flight held too, the pictures painting at once cannot
 * pass the ceiling between them. Null where it would not fit; the spend is
 * then stopped. Release once the attempt's calls are in the ledger.
 */
export function reserve(spend: HouseSpend, model: string, images: number, at = new Date(), size: HouseImageSize = HOUSE_IMAGE_SIZE): (() => void) | null {
  if (spend.stopped) return null;
  const next = attemptEstimateUsd(model, images, at, size) * spend.usdToIls;
  if (spend.budgetIls != null && spentSoFar(spend, at).ils + spend.reservedIls + next > spend.budgetIls) {
    spend.stopped = true;
    return null;
  }
  spend.reservedIls += next;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    spend.reservedIls = Math.max(0, spend.reservedIls - next);
  };
}

const textBudget = new AsyncLocalStorage<HouseSpend>();

/** fn's vision calls held to `spend`'s ceiling (the measuring run's): past it they are not made. */
export function runWithTextBudget<T>(spend: HouseSpend, fn: () => Promise<T>): Promise<T> {
  return textBudget.run(spend, fn);
}

/** Whether a vision call sent `images` pictures fits the enclosing text budget, if any. */
export function textCallAffordable(images: number, at = new Date()): boolean {
  const spend = textBudget.getStore();
  if (!spend || spend.budgetIls == null) return true;
  return spentSoFar(spend, at).ils + textCallEstimateUsd(images, at) * spend.usdToIls <= spend.budgetIls;
}

/** fn's calls on a ledger of their own, folded into the job's when it ends; the picture's cost. */
export async function withPictureLedger<T>(spend: HouseSpend, fn: () => Promise<T>): Promise<{ result: T; cost: HouseCost }> {
  const ledger: AiUsageLedger = {};
  spend.open.add(ledger);
  try {
    const result = await runWithAiUsage(ledger, fn);
    return { result, cost: costOf(ledger, spend.usdToIls) };
  } finally {
    spend.open.delete(ledger);
    mergeLedgers(spend.ledger, ledger);
  }
}

/**
 * What painting `pictures` pictures with `model` will cost, before a call is
 * made: each picture's first painting, and the most it can come to — every
 * attempt the painter makes (houseAttemptsPerPicture), the repairs sent the
 * painting and the render, each with its vision check.
 */
export function estimateHousePainting(
  input: { pictures: number; model: string; attempts?: number; usdToIls?: number; reused?: number; size?: HouseImageSize; /** Pictures sent beside each one on every pass (floor swatches): each costed as an image. */ references?: number },
  at = new Date(),
) {
  const rate = input.usdToIls ?? HOUSE_USD_TO_ILS_ESTIMATE;
  const attempts = Math.max(1, input.attempts ?? houseAttemptsPerPicture());
  const toPaint = Math.max(0, input.pictures - (input.reused ?? 0));
  const refs = Math.max(0, input.references ?? 0);
  const first = attemptEstimateUsd(input.model, 1 + refs, at, input.size) * rate;
  const repair = attemptEstimateUsd(input.model, 2 + refs, at, input.size) * rate;
  const perPictureMost = first + (attempts - 1) * repair;
  return {
    model: input.model,
    pictures: input.pictures,
    toPaint,
    reused: input.pictures - toPaint,
    attempts,
    perPictureIls: first,
    likelyIls: toPaint * Math.min(perPictureMost, first * 1.5),
    mostIls: toPaint * perPictureMost,
  };
}

export type HouseCostReport = {
  pictures: PictureCost[];
  byGroup: Array<{ group: string } & HouseCost & { painted: number; reused: number; kept: number }>;
  total: HouseCost;
};

/** The run's cost, picture by picture, model by model, and in all (the text calls included in the total). */
export function costReport(spend: HouseSpend, at = new Date()): HouseCostReport {
  const groups = [...new Set(spend.pictures.map((p) => p.group))];
  const byGroup = groups.map((group) => {
    const mine = spend.pictures.filter((p) => p.group === group);
    const sum = (k: keyof HouseCost) => mine.reduce((s, p) => s + p[k], 0);
    return {
      group,
      calls: sum("calls"),
      images: sum("images"),
      usd: sum("usd"),
      ils: sum("ils"),
      painted: mine.filter((p) => p.outcome === "painted").length,
      reused: mine.filter((p) => p.outcome === "reused").length,
      kept: mine.filter((p) => p.outcome === "kept-render" || p.outcome === "budget").length,
    };
  });
  return { pictures: [...spend.pictures], byGroup, total: costOf(spend.ledger, spend.usdToIls, at) };
}

export function formatCost(cost: HouseCost): string {
  return `${cost.calls} calls, ${cost.images} images, $${cost.usd.toFixed(3)} ≈ ₪${cost.ils.toFixed(2)} (estimate)`;
}

/** A line per model, image calls apart from text calls, and the total. */
export function costLines(spend: HouseSpend, at = new Date()): string[] {
  const report = priceLedger(spend.ledger, at);
  const lines = report.lines.map((line) => {
    const u = line.usage;
    const what = u.outputImages > 0 ? `${u.outputImages} images ${HOUSE_IMAGE_SIZE}` : "text";
    const price = line.usd == null ? "unpriced" : `$${line.usd.toFixed(3)} ≈ ₪${(line.usd * spend.usdToIls).toFixed(2)}`;
    return `cost ${line.model}: ${u.calls} calls (${what}; ${u.inputTokens} in / ${u.outputTokens + u.imageTokens} out tokens) ${price}`;
  });
  const groups = costReport(spend, at).byGroup.map(
    (g) => `cost ${g.group}: ${g.painted} painted, ${g.reused} reused, ${g.kept} kept as renders — ${g.images} images ≈ ₪${g.ils.toFixed(2)}`,
  );
  return [...lines, ...groups, `cost total: ${formatCost(costOf(spend.ledger, spend.usdToIls, at))}`];
}
