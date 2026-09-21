import { AsyncLocalStorage } from "node:async_hooks";

/**
 * What each model call actually consumed, in the units the provider bills.
 *
 * The floorplan pipeline has counted its calls for a while — "4 image, 5
 * audit, 4 extract" — and a count is not a cost. A call to a flash model that
 * reads one sheet and a call to the image model that paints one differ by two
 * orders of magnitude, and one "extract" call fans out to as many as seven
 * engines. Providers bill tokens (and, for the image models, pictures), and
 * every response already says how many it used. This keeps that number.
 *
 * Recorded at the shared helpers every feature calls through, and only inside
 * a scope that asked for it, so code that never opens one pays nothing.
 */

export type AiModelUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Output tokens that were image rather than text, where the provider says. */
  imageTokens: number;
  /** Pictures returned, for models priced per picture. */
  outputImages: number;
};

/** Keyed by the provider's own model id, which is what the price list uses. */
export type AiUsageLedger = Record<string, AiModelUsage>;

const scope = new AsyncLocalStorage<AiUsageLedger>();

export function runWithAiUsage<T>(ledger: AiUsageLedger, fn: () => Promise<T>): Promise<T> {
  return scope.run(ledger, fn);
}

export function emptyModelUsage(): AiModelUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, imageTokens: 0, outputImages: 0 };
}

export function addToLedger(
  ledger: AiUsageLedger,
  model: string,
  usage: Partial<AiModelUsage>,
): void {
  const row = ledger[model] ?? emptyModelUsage();
  row.calls += usage.calls ?? 1;
  row.inputTokens += usage.inputTokens ?? 0;
  row.outputTokens += usage.outputTokens ?? 0;
  row.imageTokens += usage.imageTokens ?? 0;
  row.outputImages += usage.outputImages ?? 0;
  ledger[model] = row;
}

export function recordAiUsage(model: string, usage: Omit<Partial<AiModelUsage>, "calls">): void {
  const ledger = scope.getStore();
  if (ledger) addToLedger(ledger, model, { ...usage, calls: 1 });
}

export function mergeLedgers(into: AiUsageLedger, from: AiUsageLedger | undefined): AiUsageLedger {
  for (const [model, usage] of Object.entries(from ?? {})) addToLedger(into, model, usage);
  return into;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Gemini's usageMetadata, from either SDK. Image tokens come in the modality
 * breakdown; they are billed at a different rate from text, so they are kept
 * apart from the rest of the output.
 */
export function usageFromGemini(response: unknown): Omit<AiModelUsage, "calls"> {
  const root = response as {
    usageMetadata?: unknown;
    response?: { usageMetadata?: unknown };
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: unknown }> } }>;
  };
  const meta = (root?.usageMetadata ?? root?.response?.usageMetadata ?? {}) as {
    promptTokenCount?: unknown;
    candidatesTokenCount?: unknown;
    thoughtsTokenCount?: unknown;
    candidatesTokensDetails?: Array<{ modality?: unknown; tokenCount?: unknown }>;
  };
  const imageTokens = (meta.candidatesTokensDetails ?? [])
    .filter((row) => String(row.modality ?? "").toUpperCase() === "IMAGE")
    .reduce((sum, row) => sum + num(row.tokenCount), 0);
  const candidates = num(meta.candidatesTokenCount);
  const outputImages = (root?.candidates?.[0]?.content?.parts ?? []).filter(
    (part) => part.inlineData != null,
  ).length;
  return {
    inputTokens: num(meta.promptTokenCount),
    // Thinking is billed as output on every Gemini model that thinks.
    outputTokens: Math.max(0, candidates - imageTokens) + num(meta.thoughtsTokenCount),
    imageTokens,
    outputImages,
  };
}

/** Anthropic's Messages API usage block. Cache reads are counted as input. */
export function usageFromAnthropic(json: unknown): Omit<AiModelUsage, "calls"> {
  const usage = ((json as { usage?: unknown })?.usage ?? {}) as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_read_input_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
  };
  return {
    inputTokens:
      num(usage.input_tokens) +
      num(usage.cache_read_input_tokens) +
      num(usage.cache_creation_input_tokens),
    outputTokens: num(usage.output_tokens),
    imageTokens: 0,
    outputImages: 0,
  };
}

/** OpenAI's chat/responses usage block, either shape. */
export function usageFromOpenAi(json: unknown): Omit<AiModelUsage, "calls"> {
  const usage = ((json as { usage?: unknown })?.usage ?? {}) as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  return {
    inputTokens: num(usage.prompt_tokens) || num(usage.input_tokens),
    outputTokens: num(usage.completion_tokens) || num(usage.output_tokens),
    imageTokens: 0,
    outputImages: 0,
  };
}
