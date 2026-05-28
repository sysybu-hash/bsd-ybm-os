import { PRODUCTION_SITE_URL } from "@/lib/site-url";

export type MarketingPublicUrls = Readonly<{
  siteOrigin: string;
  register: string;
  login: string;
}>;

/** כתובת קנונית לשיווק — תמיד פרודקשן (גם ב-localhost וב-Vercel preview) */
export function resolveMarketingCanonicalSiteUrl(): string {
  return PRODUCTION_SITE_URL;
}

export function buildMarketingPublicUrls(base?: string): MarketingPublicUrls {
  const origin = (base ?? resolveMarketingCanonicalSiteUrl()).replace(/\/$/, "");
  return {
    siteOrigin: origin,
    register: `${origin}/login?mode=register`,
    login: `${origin}/login`,
  };
}

export type MarketingSitePromptContext = Readonly<{
  /** מקור הדפדפן (למשל localhost) — להבחין מתצוגת מקדימה מול פרודקשן */
  browserOrigin?: string;
}>;

export function buildMarketingSiteRulesBlock(
  locale: "he" | "en" | "ru",
  context?: MarketingSitePromptContext,
): string {
  const urls = buildMarketingPublicUrls();
  const previewNote =
    context?.browserOrigin &&
    !urls.siteOrigin.startsWith(context.browserOrigin) &&
    !context.browserOrigin.includes(urls.siteOrigin.replace(/^https?:\/\//, ""))
      ? locale === "he"
        ? `המשתמש גולש מתצוגת מקדימה (${context.browserOrigin}). אם צריך קישור — השתמש בפרודקשן בלבד, לא ב-localhost.`
        : locale === "ru"
          ? `Предпросмотр: ${context.browserOrigin}. Публичные ссылки — только production ниже.`
          : `Preview origin (${context.browserOrigin}). Use production URLs below only when sharing links.`
      : "";

  const hardLimit =
    locale === "he"
      ? "שיחה קולית: עד 120 שניות — אחר כך נסגרת. לפני הסגירה סכם בקצרה בניחותא."
      : locale === "ru"
        ? "Голос: до 120 секунд, затем отключение. Перед концом — краткое резюме."
        : "Voice: 120-second limit, then disconnect. Brief friendly wrap-up before end.";

  return [
    "## Links (use sparingly)",
    `- Official site: ${urls.siteOrigin}`,
    `- Signup: ${urls.register}`,
    `- Login: ${urls.login}`,
    "- Do NOT repeat the domain in every answer. Mention links only when the user asks or when closing a voice session.",
    "- Never invent hostnames (no localhost in user-facing answers).",
    previewNote,
    hardLimit,
  ]
    .filter(Boolean)
    .join("\n");
}
