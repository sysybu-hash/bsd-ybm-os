import type { AiProviderId } from "@/lib/ai-providers";

export type ScanCreditKind = "cheap" | "premium";

/** Gemini = זול; OpenAI / Anthropic = פרימיום */
export function scanCreditKindForProvider(provider: AiProviderId): ScanCreditKind {
  if (provider === "openai" || provider === "anthropic") return "premium";
  return "cheap";
}
