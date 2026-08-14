import { env } from "@/lib/env";
/** ׳׳•׳’׳•׳¡׳˜ 2026 ג€” GPT-5.6 Sol (alias gpt-5.6) */
export const OPENAI_FLAGSHIP_MODEL = "gpt-5.6-sol";

export const OPENAI_VISION_FALLBACK_CHAIN: readonly string[] = [
  "gpt-5.6-sol",
  "gpt-5.6",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
] as const;

const OPENAI_MODEL_ALIASES: Record<string, string> = {
  "gpt-4o": OPENAI_FLAGSHIP_MODEL,
  "gpt-4o-mini": "gpt-5.6-luna",
  "gpt-4-turbo": OPENAI_FLAGSHIP_MODEL,
  "gpt-5.4": "gpt-5.6-terra",
  "gpt-5.4-mini": "gpt-5.6-luna",
  "gpt-5.4-turbo": OPENAI_FLAGSHIP_MODEL,
};

export const ANTHROPIC_FLAGSHIP_MODEL = "claude-sonnet-5";

export const ANTHROPIC_FALLBACK_CHAIN: readonly string[] = [
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
] as const;

const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  "claude-3-5-sonnet-20241022": ANTHROPIC_FLAGSHIP_MODEL,
  "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  "claude-3-opus-20240229": "claude-opus-5",
};

export const GROQ_FLAGSHIP_MODEL = "openai/gpt-oss-120b";

const GROQ_MODEL_ALIASES: Record<string, string> = {
  "llama-3.3-70b-versatile": GROQ_FLAGSHIP_MODEL,
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
};

function resolveOpenAiModelId(raw: string): string {
  const id = raw.trim();
  return OPENAI_MODEL_ALIASES[id] ?? id;
}

function resolveAnthropicModelId(raw: string): string {
  const id = raw.trim();
  return ANTHROPIC_MODEL_ALIASES[id] ?? id;
}

function resolveGroqModelId(raw: string): string {
  const id = raw.trim();
  return GROQ_MODEL_ALIASES[id] ?? id;
}

function resolveMistralModelId(raw: string): string {
  const id = raw.trim();
  return MISTRAL_MODEL_ALIASES[id] ?? id;
}

function dedupeStrings(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const resolved = p?.trim() ? resolveOpenAiModelId(p.trim()) : "";
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export function getOpenAiVisionModel(): string {
  return resolveOpenAiModelId(env.OPENAI_VISION_MODEL?.trim() || OPENAI_FLAGSHIP_MODEL);
}

/** ׳¡׳“׳¨ ׳ ׳™׳¡׳™׳•׳ ׳•׳× ׳ײ¾Chat Completions (׳×׳׳•׳ ׳” / ׳§׳•׳‘׳¥ ׳©׳׳™׳ ׳• PDF ׳‘׳ ׳×׳™׳‘ ׳”׳™׳©׳) */
export function getOpenAiChatVisionModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    env.OPENAI_VISION_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

/** ׳¡׳“׳¨ ׳ ׳™׳¡׳™׳•׳ ׳•׳× ׳ײ¾Responses API (PDF) */
export function getOpenAiResponsesModelCandidates(uiOverride?: string): string[] {
  return dedupeStrings([
    uiOverride,
    env.OPENAI_RESPONSES_MODEL?.trim(),
    env.OPENAI_VISION_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

export function isOpenAiModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const b = body.toLowerCase();
  return (
    b.includes("model_not_found") ||
    b.includes("does not exist") ||
    b.includes("invalid_model") ||
    (b.includes("the model") && b.includes("not found"))
  );
}

/** 404 / ׳“׳’׳ ׳׳ ׳§׳™׳™׳ / ׳׳’׳‘׳׳× ׳§׳¦׳‘ ג€” ׳׳¢׳‘׳¨ ׳׳׳•׳“׳ ׳”׳‘׳ */
export function isOpenAiEligibleForModelFallback(status: number, body: string): boolean {
  if (isOpenAiModelNotFound(status, body)) return true;
  if (status === 429) return true;
  const b = body.toLowerCase();
  return b.includes("rate_limit") || b.includes("too many requests");
}

/** ׳¦'׳׳˜ ׳˜׳§׳¡׳˜ ׳‘׳׳‘׳“ (׳׳׳ vision) ג€” fallback ׳“׳•׳׳” ׳׳¡׳¨׳™׳§׳” */
export function getOpenAiChatTextModelCandidates(): string[] {
  return dedupeStrings([
    env.OPENAI_CHAT_MODEL?.trim(),
    OPENAI_FLAGSHIP_MODEL,
    ...OPENAI_VISION_FALLBACK_CHAIN.filter((m) => m !== OPENAI_FLAGSHIP_MODEL),
  ]);
}

export function getAnthropicModel(): string {
  return resolveAnthropicModelId(env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_FLAGSHIP_MODEL);
}

export function getAnthropicModelCandidates(uiOverride?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [uiOverride, env.ANTHROPIC_MODEL?.trim(), ...ANTHROPIC_FALLBACK_CHAIN]) {
    const s = p?.trim() ? resolveAnthropicModelId(p.trim()) : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function isAnthropicModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const b = body.toLowerCase();
  return (
    (b.includes("invalid_request_error") && b.includes("model")) ||
    b.includes("model_not_found") ||
    (b.includes("model") && b.includes("not found"))
  );
}

export function isAnthropicEligibleForModelFallback(status: number, body: string): boolean {
  if (isAnthropicModelNotFound(status, body)) return true;
  if (status === 429) return true;
  const b = body.toLowerCase();
  return b.includes("rate_limit") || b.includes("too many requests");
}

export function getGroqModel(): string {
  return resolveGroqModelId(env.GROQ_MODEL?.trim() || GROQ_FLAGSHIP_MODEL);
}

/** Mistral Medium 3.5 ג€” ׳׳—׳׳™׳£ ׳׳× Pixtral Large (retired) */
export const MISTRAL_VISION_FLAGSHIP = "mistral-medium-3-5";
export const MISTRAL_TEXT_FLAGSHIP = "mistral-small-latest";

const MISTRAL_MODEL_ALIASES: Record<string, string> = {
  "pixtral-large-latest": MISTRAL_VISION_FLAGSHIP,
  "pixtral-large-2411": MISTRAL_VISION_FLAGSHIP,
  "pixtral-12b-2409": MISTRAL_TEXT_FLAGSHIP,
  "mistral-large-latest": MISTRAL_VISION_FLAGSHIP,
  "mistral-medium-latest": MISTRAL_VISION_FLAGSHIP,
};

/** ׳׳•׳“׳ ׳-vision / ׳¡׳¨׳™׳§׳× ׳׳¡׳׳›׳™׳ */
export function getMistralVisionModel(): string {
  return resolveMistralModelId(env.MISTRAL_VISION_MODEL?.trim() || MISTRAL_VISION_FLAGSHIP);
}

/** ׳׳•׳“׳ ׳׳¦'׳׳˜ ׳˜׳§׳¡׳˜ */
export function getMistralModel(): string {
  return resolveMistralModelId(env.MISTRAL_MODEL?.trim() || MISTRAL_TEXT_FLAGSHIP);
}

export function getMistralVisionModelCandidates(uiOverride?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [
    uiOverride,
    env.MISTRAL_VISION_MODEL?.trim(),
    MISTRAL_VISION_FLAGSHIP,
    "mistral-medium-latest",
    MISTRAL_TEXT_FLAGSHIP,
  ]) {
    const s = p?.trim() ? resolveMistralModelId(p.trim()) : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function isMistralModelNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  const b = body.toLowerCase();
  return b.includes("model not found") || b.includes("unknown model");
}

export function isMistralEligibleForModelFallback(status: number, body: string): boolean {
  if (isMistralModelNotFound(status, body)) return true;
  if (status === 429) return true;
  const b = body.toLowerCase();
  return b.includes("rate_limit") || b.includes("too many requests");
}
