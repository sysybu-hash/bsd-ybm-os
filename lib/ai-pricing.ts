import type { AiModelUsage, AiUsageLedger } from "@/lib/ai-usage";

/**
 * What a model costs, per the providers' own public price lists.
 *
 * Every figure here was read off the provider's pricing page on the date in
 * PRICES_CHECKED_AT, standard (paid, non-batch, global) tier, in USD. A model
 * that is not in this table is reported as unpriced rather than guessed at:
 * an estimate that looks like a bill is worse than a gap that says it is one.
 *
 * Sources:
 *   https://ai.google.dev/gemini-api/docs/pricing
 *   https://platform.claude.com/docs/en/about-claude/pricing
 *   https://developers.openai.com/api/docs/pricing  (Standard, short context)
 *   https://console.groq.com/docs/models
 * Mistral is not here: its price page would not yield a figure to cite, so
 * its calls are counted and shown unpriced.
 */
export const PRICES_CHECKED_AT = "2026-09-22";

type Rate = {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens (text and thinking). */
  output: number;
  /** USD per million image output tokens, where the provider bills them so. */
  imageOutputPerMTok?: number;
  /** USD per returned picture, where the provider quotes it that way. */
  perImage?: number;
};

type PriceEntry = {
  provider: "google" | "anthropic" | "openai" | "groq";
  /** Rates in force from each date (inclusive), oldest first. */
  schedule: Array<{ from: string; rate: Rate }>;
};

const FLASH_2026: Rate = { input: 0.75, output: 3.75 };
const FLASH_2027: Rate = { input: 1.5, output: 7.5 };
const flashSchedule = [
  { from: "2000-01-01", rate: FLASH_2026 },
  // Google's page: "$0.75 through December 31, 2026. $1.50 starting January 1, 2027."
  { from: "2027-01-01", rate: FLASH_2027 },
];

const PRICES: Record<string, PriceEntry> = {
  // --- Google: image ---
  "gemini-3-pro-image": {
    provider: "google",
    // $0.134 per 1K/2K image = 1,120 image tokens at $120 per million.
    schedule: [{ from: "2000-01-01", rate: { input: 2, output: 12, imageOutputPerMTok: 120, perImage: 0.134 } }],
  },
  "gemini-3.1-flash-image": {
    provider: "google",
    // $60 per million image tokens: 1,120 tokens = $0.067 for a 1K picture.
    schedule: [{ from: "2000-01-01", rate: { input: 0.5, output: 3, imageOutputPerMTok: 60, perImage: 0.067 } }],
  },
  "gemini-3.1-flash-lite-image": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 0.25, output: 1.5, imageOutputPerMTok: 30, perImage: 0.0336 } }],
  },
  "gemini-2.5-flash-image": {
    provider: "google",
    // Deprecated by Google; shuts down on 2 October 2026. Kept so a fallback
    // to it before then is still costed.
    schedule: [{ from: "2000-01-01", rate: { input: 0.3, output: 2.5, imageOutputPerMTok: 30, perImage: 0.039 } }],
  },
  // --- Google: text / vision ---
  "gemini-3.8-flash": { provider: "google", schedule: flashSchedule },
  "gemini-3.7-flash": { provider: "google", schedule: flashSchedule },
  "gemini-3.6-flash": { provider: "google", schedule: flashSchedule },
  "gemini-3.5-flash": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 1.5, output: 9 } }],
  },
  "gemini-3.5-flash-lite": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 0.3, output: 2.5 } }],
  },
  "gemini-3.1-pro-preview": {
    provider: "google",
    // Prompts up to 200k tokens; nothing in this pipeline sends more.
    schedule: [{ from: "2000-01-01", rate: { input: 2, output: 12 } }],
  },
  "gemini-embedding-2": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 0.2, output: 0 } }],
  },
  "gemini-3.1-flash-lite": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 0.25, output: 1.5 } }],
  },
  "gemini-3-flash-preview": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 0.5, output: 3 } }],
  },
  "gemini-2.5-flash": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 0.3, output: 2.5 } }],
  },
  "gemini-2.5-pro": {
    provider: "google",
    schedule: [{ from: "2000-01-01", rate: { input: 1.25, output: 10 } }],
  },
  // --- Anthropic ---
  "claude-sonnet-5": {
    provider: "anthropic",
    schedule: [{ from: "2000-01-01", rate: { input: 2, output: 10 } }],
  },
  "claude-opus-5": {
    provider: "anthropic",
    schedule: [{ from: "2000-01-01", rate: { input: 5, output: 25 } }],
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    schedule: [{ from: "2000-01-01", rate: { input: 3, output: 15 } }],
  },
  "claude-opus-4-7": {
    provider: "anthropic",
    schedule: [{ from: "2000-01-01", rate: { input: 5, output: 25 } }],
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    schedule: [{ from: "2000-01-01", rate: { input: 1, output: 5 } }],
  },
  // --- OpenAI ---
  "gpt-6-astra": { provider: "openai", schedule: [{ from: "2000-01-01", rate: { input: 10, output: 50 } }] },
  "gpt-5.6-sol": { provider: "openai", schedule: [{ from: "2000-01-01", rate: { input: 4, output: 20 } }] },
  "gpt-5.6-terra": { provider: "openai", schedule: [{ from: "2000-01-01", rate: { input: 2, output: 12 } }] },
  "gpt-5.6-luna": { provider: "openai", schedule: [{ from: "2000-01-01", rate: { input: 0.2, output: 1.2 } }] },
  // --- Groq (recorded as "groq:<model>") ---
  "groq:openai/gpt-oss-120b": { provider: "groq", schedule: [{ from: "2000-01-01", rate: { input: 0.15, output: 0.6 } }] },
  "groq:openai/gpt-oss-20b": { provider: "groq", schedule: [{ from: "2000-01-01", rate: { input: 0.075, output: 0.3 } }] },
};

/** "gemini-3-pro-image-preview" and dated ids price as their family. */
function entryFor(model: string): PriceEntry | null {
  const id = model.trim().toLowerCase();
  if (PRICES[id]) return PRICES[id]!;
  const base = id.replace(/-preview$/, "").replace(/-latest$/, "");
  if (PRICES[base]) return PRICES[base]!;
  // A dated snapshot id ("claude-haiku-4-5" asked for, "-20251001" billed).
  const dated = Object.keys(PRICES).find((key) => key.startsWith(`${base}-`));
  return dated ? PRICES[dated]! : null;
}

function rateOn(entry: PriceEntry, at: Date): Rate {
  const day = at.toISOString().slice(0, 10);
  let rate = entry.schedule[0]!.rate;
  for (const step of entry.schedule) if (step.from <= day) rate = step.rate;
  return rate;
}

export function priceModelUsage(model: string, usage: AiModelUsage, at: Date): number | null {
  const entry = entryFor(model);
  if (!entry) return null;
  const rate = rateOn(entry, at);
  let usd = (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000;
  if (usage.imageTokens > 0 && rate.imageOutputPerMTok != null) {
    usd += (usage.imageTokens * rate.imageOutputPerMTok) / 1_000_000;
  } else if (usage.outputImages > 0 && rate.perImage != null) {
    // The response carried the pictures but not their token count.
    usd += usage.outputImages * rate.perImage;
  }
  return usd;
}

export type CostLine = {
  model: string;
  provider: PriceEntry["provider"] | "unknown";
  usage: AiModelUsage;
  /** Null when the model is not on the price list. */
  usd: number | null;
};

export type CostReport = {
  /** Sum of the priced lines only. */
  usd: number;
  lines: CostLine[];
  /** Calls to models with no price here — present, counted, not costed. */
  unpricedCalls: number;
  pricesCheckedAt: string;
};

export function priceLedger(ledger: AiUsageLedger | undefined, at: Date): CostReport {
  const lines: CostLine[] = Object.entries(ledger ?? {})
    .map(([model, usage]) => ({
      model,
      provider: entryFor(model)?.provider ?? ("unknown" as const),
      usage,
      usd: priceModelUsage(model, usage, at),
    }))
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
  return {
    usd: lines.reduce((sum, line) => sum + (line.usd ?? 0), 0),
    lines,
    unpricedCalls: lines.filter((line) => line.usd == null).reduce((n, line) => n + line.usage.calls, 0),
    pricesCheckedAt: PRICES_CHECKED_AT,
  };
}
