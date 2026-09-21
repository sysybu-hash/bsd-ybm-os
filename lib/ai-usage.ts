import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai-usage");

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

/**
 * Who a call was made for, set once per request by the API wrappers.
 *
 * The per-run ledger above answers "what did this booklet cost". This answers
 * the question the provider's bill actually poses: every call the site made,
 * for which customer and from which screen — the chat, the CRM, the scans, the
 * visualisations — so the admin page can add up to the same figure Google and
 * Anthropic charge, instead of one feature's corner of it.
 */
export type AiRequestContext = {
  organizationId?: string;
  feature: string;
};

type PendingEvent = {
  organizationId: string | null;
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageTokens: number;
  outputImages: number;
  environment: string;
  createdAt: Date;
};

type RequestState = AiRequestContext & { events: PendingEvent[] };

const request = new AsyncLocalStorage<RequestState>();

function environmentName(): string {
  return env.VERCEL_ENV ?? (env.NODE_ENV === "production" ? "production" : "development");
}

export function providerOf(model: string): string {
  const id = model.toLowerCase();
  // First: Groq serves other vendors' open models ("groq:openai/gpt-oss-120b").
  if (id.startsWith("groq:")) return "groq";
  if (id.startsWith("gemini") || id.startsWith("veo") || id.startsWith("imagen") || id.startsWith("lyria")) return "google";
  if (id.startsWith("claude")) return "anthropic";
  if (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4") || id.includes("openai")) return "openai";
  if (id.includes("mistral") || id.startsWith("pixtral")) return "mistral";
  if (id.includes("llama") || id.includes("groq") || id.includes("qwen") || id.includes("kimi")) return "groq";
  return "other";
}

async function persistEvents(events: PendingEvent[]): Promise<void> {
  if (events.length === 0 || env.NODE_ENV === "test") return;
  try {
    // Imported here, not at the top: this module is loaded by code paths
    // (tests, scripts) that never open a database connection.
    const { prisma } = await import("@/lib/prisma");
    await prisma.aiUsageEvent.createMany({ data: events });
  } catch (err: unknown) {
    // A lost usage row is an under-report; a failed model call because the
    // ledger was down would be an outage. Never the second.
    log.warn("ai usage not persisted", {
      events: events.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Runs after the response has gone, streams included — or right now, if there is no response. */
async function scheduleAfterResponse(job: () => Promise<void>): Promise<boolean> {
  try {
    const { after } = await import("next/server");
    after(job);
    return true;
  } catch {
    return false;
  }
}

/**
 * Everything fn causes is recorded against this organisation and feature.
 * Rows are written once the response has finished, so a streamed answer's
 * tokens — known only at the end of the stream — are on the same bill.
 */
/** The route a request came in on, without its query — the "feature" a call is billed to. */
export function featureFromRequest(req: Request): string {
  try {
    return new URL(req.url).pathname.replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, "/:id");
  } catch {
    return "unknown";
  }
}

export async function runWithAiRequest<T>(context: AiRequestContext, fn: () => Promise<T>): Promise<T> {
  const state: RequestState = { ...context, events: [] };
  return request.run(state, async () => {
    const deferred = await scheduleAfterResponse(() => persistEvents(state.events.splice(0)));
    try {
      return await fn();
    } finally {
      if (!deferred) await persistEvents(state.events.splice(0));
    }
  });
}

/** The calls recorded so far in the current request — for tests and diagnostics. */
export function pendingAiUsageEvents(): ReadonlyArray<Omit<PendingEvent, "createdAt">> {
  return request.getStore()?.events ?? [];
}

export function recordAiUsage(
  rawModel: string | null | undefined,
  usage: Omit<Partial<AiModelUsage>, "calls">,
): void {
  // Recording is bookkeeping around a call that already succeeded. Nothing in
  // here may ever turn that success into a failure — a mocked SDK with no model
  // name on its response proved it could.
  try {
    recordAiUsageUnsafe(rawModel, usage);
  } catch (err: unknown) {
    log.warn("ai usage not recorded", { error: err instanceof Error ? err.message : String(err) });
  }
}

function recordAiUsageUnsafe(
  rawModel: string | null | undefined,
  usage: Omit<Partial<AiModelUsage>, "calls">,
): void {
  // The older Gemini SDK reports "models/gemini-3.7-flash"; the price list does not.
  const model = String(rawModel || "unknown").replace(/^models\//, "");
  const ledger = scope.getStore();
  if (ledger) addToLedger(ledger, model, { ...usage, calls: 1 });

  const event: PendingEvent = {
    organizationId: request.getStore()?.organizationId ?? null,
    feature: request.getStore()?.feature ?? "unscoped",
    provider: providerOf(model),
    model,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    imageTokens: usage.imageTokens ?? 0,
    outputImages: usage.outputImages ?? 0,
    environment: environmentName(),
    createdAt: new Date(),
  };
  const state = request.getStore();
  if (state) {
    state.events.push(event);
    return;
  }
  // A call from outside any wrapped route — a server action, a cron, a
  // script. Still on the bill, just without a customer against it.
  void scheduleAfterResponse(() => persistEvents([event])).then((deferred) => {
    if (!deferred) void persistEvents([event]);
  });
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
