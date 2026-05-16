import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import {
  getAnthropicModelCandidates,
  getGroqModel,
  getOpenAiChatTextModelCandidates,
  isAnthropicConfigured,
  isAnthropicEligibleForModelFallback,
  isGeminiConfigured,
  isGroqConfigured,
  isOpenAiConfigured,
  isOpenAiEligibleForModelFallback,
  normalizeAiProviderId,
  type AiProviderId,
} from "@/lib/ai-providers";
import { getAiChatSystemPrefix } from "@/lib/i18n/ai-prompts";
import { getUserFacingAiErrorMessageForLocale } from "@/lib/i18n/ai-locale";

const RETRYABLE_STATUS_CODES = [429, 500, 503, 504];
/** אחרי Gemini (ברירת מחדל): OpenAI → Anthropic → Groq — תואם שרשראות fallback מרכזיות */
const FALLBACK_PROVIDER_ORDER: AiProviderId[] = ["openai", "anthropic", "groq"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function isRetryableProviderError(error: unknown) {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    RETRYABLE_STATUS_CODES.some((status) => message.includes(`${status}`)) ||
    message.includes("service unavailable") ||
    message.includes("currently experiencing high demand") ||
    message.includes("resource exhausted") ||
    message.includes("rate limit") ||
    message.includes("overloaded") ||
    message.includes("timeout")
  );
}

function isFallbackEligibleProviderError(error: unknown) {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    isRetryableProviderError(error) ||
    message.includes("insufficient_quota") ||
    message.includes("exceeded your current quota") ||
    message.includes("credit balance is too low") ||
    message.includes("purchase credits") ||
    message.includes("plans & billing") ||
    message.includes("billing details") ||
    message.includes("model overloaded") ||
    message.includes("temporarily unavailable")
  );
}

export function getUserFacingAiErrorMessage(error: unknown, locale?: string) {
  if (isFallbackEligibleProviderError(error)) {
    return getUserFacingAiErrorMessageForLocale(error, locale);
  }

  const message = extractErrorMessage(error);
  if (message.trim()) return message.slice(0, 400);
  return getUserFacingAiErrorMessageForLocale(error, locale);
}

async function runWithRetry<T>(task: () => Promise<T>, retries = 2, baseDelayMs = 450): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableProviderError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown AI provider error");
}

async function runOpenAiPrompt(prompt: string) {
  if (!isOpenAiConfigured()) throw new Error("חסר OPENAI_API_KEY");
  const key = process.env.OPENAI_API_KEY!.trim();
  const models = getOpenAiChatTextModelCandidates();
  let lastErr: Error | null = null;
  for (const model of models) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastErr = new Error(raw.slice(0, 400));
      if (isOpenAiEligibleForModelFallback(res.status, raw)) continue;
      throw lastErr;
    }
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  }
  throw lastErr ?? new Error("OpenAI chat: כל המודלים נכשלו");
}

async function runAnthropicPrompt(prompt: string) {
  if (!isAnthropicConfigured()) throw new Error("חסר ANTHROPIC_API_KEY");
  const key = process.env.ANTHROPIC_API_KEY!.trim();
  const models = getAnthropicModelCandidates();
  let lastErr: Error | null = null;
  for (const model of models) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastErr = new Error(raw.slice(0, 400));
      if (isAnthropicEligibleForModelFallback(res.status, raw)) continue;
      throw lastErr;
    }
    const data = JSON.parse(raw) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return data.content?.find((block) => block.type === "text")?.text ?? "";
  }
  throw lastErr ?? new Error("Anthropic chat: כל המודלים נכשלו");
}

async function runGroqPrompt(prompt: string) {
  if (!isGroqConfigured()) throw new Error("חסר GROQ_API_KEY");
  const key = process.env.GROQ_API_KEY!.trim();
  const model = getGroqModel();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 400));
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function runGeminiPrompt(prompt: string) {
  if (!isGeminiConfigured()) throw new Error("חסר מפתח Gemini");
  const genAI = new GoogleGenerativeAI(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || "",
  );
  let lastErr: unknown = null;
  for (const modelName of getGeminiModelFallbackChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (e) {
      lastErr = e;
      if (isLikelyGeminiModelUnavailable(e)) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini chat: כל המודלים נכשלו");
}

async function executeProvider(provider: AiProviderId, prompt: string) {
  switch (provider) {
    case "openai":
      return runOpenAiPrompt(prompt);
    case "anthropic":
      return runAnthropicPrompt(prompt);
    case "groq":
      return runGroqPrompt(prompt);
    case "gemini":
    default:
      return runGeminiPrompt(prompt);
  }
}

function canUseProvider(provider: AiProviderId) {
  switch (provider) {
    case "openai":
      return isOpenAiConfigured();
    case "anthropic":
      return isAnthropicConfigured();
    case "groq":
      return isGroqConfigured();
    case "gemini":
      return isGeminiConfigured();
    default:
      return false;
  }
}

export async function runAiChat(
  providerRaw: string | undefined,
  userPrompt: string,
  contextJson: string,
  locale: string,
): Promise<{ text: string; provider: AiProviderId }> {
  const requestedProvider = normalizeAiProviderId(providerRaw);
  const systemPrefix = getAiChatSystemPrefix(contextJson, locale);
  const prompt = systemPrefix + userPrompt;

  const providersToTry: AiProviderId[] = [
    requestedProvider,
    ...FALLBACK_PROVIDER_ORDER.filter((provider) => provider !== requestedProvider),
  ].filter(canUseProvider);

  if (providersToTry.length === 0) {
    throw new Error(
      "לא הוגדרו מפתחות AI בשרת. ב-Vercel הוסיפו לפחות אחד: GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY או ANTHROPIC_API_KEY.",
    );
  }

  let lastError: unknown;

  for (const [index, provider] of providersToTry.entries()) {
    try {
      const text =
        provider === "gemini"
          ? await runWithRetry(() => executeProvider(provider, prompt))
          : await executeProvider(provider, prompt);

      return { text, provider };
    } catch (error) {
      lastError = error;
      const hasNextProvider = index < providersToTry.length - 1;
      const shouldFallback = hasNextProvider;

      if (!shouldFallback) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("שירות ה-AI לא הצליח להשיב כרגע.");
}

export { isRetryableProviderError, isFallbackEligibleProviderError };
