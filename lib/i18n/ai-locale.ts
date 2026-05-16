import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";

/** הנחיית שפה אחידה לכל קריאות AI (טקסט, קול, חיפוש סמנטי). */
export function aiReplyLanguageRule(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "English";
  return `Always respond in ${lang} unless the user explicitly asks for another language. Match the user's interface locale.`;
}

export function aiJsonOnlyHint(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "English";
  return `Return JSON only (no markdown). Human-readable string values must be in ${lang}.`;
}

const AI_ERROR_MESSAGES: Record<AppLocale, { busy: string; generic: string }> = {
  he: {
    busy: "שירות ה-AI עמוס כרגע או חסום זמנית. נסה שוב בעוד רגע.",
    generic: "שגיאה זמנית בשירות ה-AI.",
  },
  en: {
    busy: "The AI service is busy or temporarily unavailable. Please try again shortly.",
    generic: "A temporary error occurred with the AI service.",
  },
  ru: {
    busy: "Сервис ИИ перегружен или временно недоступен. Повторите попытку позже.",
    generic: "Временная ошибка сервиса ИИ.",
  },
};

export function interpretDoneFallback(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  if (loc === "en") return "Done.";
  if (loc === "ru") return "Готово.";
  return "בוצע.";
}

export function getUserFacingAiErrorMessageForLocale(error: unknown, locale?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const msgs = AI_ERROR_MESSAGES[loc] ?? AI_ERROR_MESSAGES.en;
  if (typeof error === "object" && error !== null) {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    if (
      lower.includes("429") ||
      lower.includes("503") ||
      lower.includes("rate limit") ||
      lower.includes("resource exhausted") ||
      lower.includes("overloaded")
    ) {
      return msgs.busy;
    }
    if (msg.trim()) return msg.slice(0, 400);
  }
  return msgs.generic;
}
