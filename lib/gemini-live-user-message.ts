export type GeminiLiveUserErrorKey =
  | "sessionExpired"
  | "apiKey"
  | "internal"
  | "connection"
  | "rateLimited"
  | null;

const ISO_TIMESTAMP_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;

/** מזהה שגיאות Live נפוצות לפני תרגום i18n ב-UI. */
export function getGeminiLiveUserErrorKey(raw: string): GeminiLiveUserErrorKey {
  const lower = raw.trim().toLowerCase();
  if (
    lower.includes("rate limit") ||
    lower.includes("rate_limited") ||
    lower.includes("הגבלת קצב") ||
    lower.includes("too many requests") ||
    lower.includes("resource exhausted") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded")
  ) {
    return "rateLimited";
  }
  if (
    lower.includes("new_session_expire_time") ||
    lower.includes("new session expire") ||
    (lower.includes("deadline exceeded") && lower.includes("session"))
  ) {
    return "sessionExpired";
  }
  if (
    lower.includes("api key expired") ||
    lower.includes("api_key_invalid") ||
    lower.includes("please renew the api key") ||
    lower.includes("invalid api key")
  ) {
    return "apiKey";
  }
  if (
    lower.includes("internal error encountered") ||
    lower.includes("internal_error") ||
    lower.includes("internal server error") ||
    lower === "internal error"
  ) {
    return "internal";
  }
  if (
    lower.includes("websocket failed") ||
    lower.includes("connection timeout") ||
    lower.includes("gemini live websocket") ||
    (lower.includes("חיבור gemini live") && lower.includes("1006"))
  ) {
    return "connection";
  }
  return null;
}

export function formatGeminiLiveRetryAt(
  retryAt: Date,
  locale = "he",
): string {
  const loc = locale.startsWith("he") ? "he-IL" : locale.startsWith("ru") ? "ru-RU" : "en-GB";
  return new Intl.DateTimeFormat(loc, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(retryAt);
}

/** חילוץ זמן retry מטקסט שגיאה / JSON של Google או מתגובת API. */
export function parseGeminiLiveRetryAt(
  raw: string,
  meta?: { resetAt?: string | Date; retryAfterSec?: number },
): Date | null {
  if (meta?.resetAt) {
    const d = meta.resetAt instanceof Date ? meta.resetAt : new Date(meta.resetAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (meta?.retryAfterSec != null && meta.retryAfterSec > 0) {
    return new Date(Date.now() + meta.retryAfterSec * 1000);
  }

  let t = raw.trim();
  try {
    const j = JSON.parse(t) as {
      resetAt?: string;
      retryAfter?: number;
      error?: { message?: string; details?: unknown[] };
    };
    if (typeof j.resetAt === "string") {
      const d = new Date(j.resetAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (typeof j.retryAfter === "number" && j.retryAfter > 0) {
      return new Date(Date.now() + j.retryAfter * 1000);
    }
    if (typeof j?.error?.message === "string" && j.error.message.trim()) {
      t = j.error.message.trim();
    }
    const details = j?.error?.details;
    if (Array.isArray(details)) {
      for (const item of details) {
        if (item && typeof item === "object") {
          const delay = (item as { retryDelay?: string }).retryDelay;
          if (typeof delay === "string") {
            const sec = parseGoogleRetryDelaySeconds(delay);
            if (sec != null) return new Date(Date.now() + sec * 1000);
          }
        }
      }
    }
  } catch {
    /* raw לא JSON מלא */
  }

  const isoMatch = t.match(ISO_TIMESTAMP_RE);
  if (isoMatch?.[0]) {
    const d = new Date(isoMatch[0]);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const retryDelayJson = t.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (retryDelayJson?.[1]) {
    const sec = Number(retryDelayJson[1]);
    if (Number.isFinite(sec) && sec > 0) return new Date(Date.now() + sec * 1000);
  }

  const retryAfterMatch = t.match(/retry[- ]?after[:\s]+(\d+)/i);
  if (retryAfterMatch?.[1]) {
    const sec = Number(retryAfterMatch[1]);
    if (Number.isFinite(sec) && sec > 0) return new Date(Date.now() + sec * 1000);
  }

  return null;
}

function parseGoogleRetryDelaySeconds(delay: string): number | null {
  const m = delay.trim().match(/^(\d+(?:\.\d+)?)s$/i);
  if (!m?.[1]) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

export function formatGeminiLiveRateLimitMessage(
  retryAt: Date,
  locale = "he",
  translate?: (key: string) => string,
): string {
  const when = formatGeminiLiveRetryAt(retryAt, locale);
  const template =
    translate?.("workspaceWidgets.aiChat.liveRateLimited") ??
    "הגבלת קצב ב-Gemini Live. נסו שוב ב-{retryAt}.";
  return template.replace("{retryAt}", when);
}

/**
 * טקסט למשתמש מטעינות Gemini Live — ללא ייבוא מ־Document AI / Node,
 * כדי שקומפוננטות `"use client"` יוכלו לייבא בלי למשוך `fs` ל-bundle הדפדפן.
 */
export function formatGeminiLiveUserMessage(
  raw: string,
  translate?: (key: string) => string,
  options?: { locale?: string; retryAt?: Date | null },
): string {
  let t = raw.trim();
  if (!t) return "שגיאת חיבור ל-Gemini Live.";
  const locale = options?.locale ?? "he";

  let parsedRetryAt = options?.retryAt ?? null;
  try {
    const j = JSON.parse(t) as { error?: { message?: string } };
    if (typeof j?.error?.message === "string" && j.error.message.trim()) {
      t = j.error.message.trim();
    }
    if (!parsedRetryAt) {
      parsedRetryAt = parseGeminiLiveRetryAt(raw);
    }
  } catch {
    if (!parsedRetryAt) {
      parsedRetryAt = parseGeminiLiveRetryAt(t);
    }
  }

  const errorKey = getGeminiLiveUserErrorKey(t);
  if (errorKey === "rateLimited") {
    const retryAt = parsedRetryAt ?? new Date(Date.now() + 60_000);
    return formatGeminiLiveRateLimitMessage(retryAt, locale, translate);
  }
  if (errorKey === "sessionExpired") {
    return (
      translate?.("workspaceWidgets.aiChat.liveSessionExpired") ??
      "פג תוקף חיבור הקול — ההקמה לא הסתיימה בזמן. לחצו שוב על המיקרופון."
    );
  }
  if (errorKey === "internal") {
    return (
      translate?.("workspaceWidgets.aiChat.liveInternalError") ??
      "שגיאה פנימית בשרת Google Gemini Live. נסו שוב בעוד רגע; אם זה חוזר — פנו למנהל המערכת."
    );
  }
  if (errorKey === "connection") {
    return (
      translate?.("workspaceWidgets.aiChat.liveConnectionFailed") ??
      "לא הצלחנו להתחבר ל-Gemini Live. בדקו חיבור לאינטרנט ונסו שוב."
    );
  }
  const lower = t.toLowerCase();
  if (
    lower.includes("api key expired") ||
    lower.includes("api_key_invalid") ||
    lower.includes("please renew the api key") ||
    lower.includes("invalid api key")
  ) {
    return "מפתח Gemini בשרת פג תוקף או לא תקין. צור מפתח חדש ב-Google AI Studio והגדר GOOGLE_GENERATIVE_AI_API_KEY (או GEMINI_API_KEY) ב-.env ובפריסה.";
  }
  return t.length > 220 ? `${t.slice(0, 217)}…` : t;
}
