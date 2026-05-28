import { GEMINI_LIVE_SESSION_START_TAG } from "@/lib/gemini-live/session-greeting";
import { buildMarketingPublicUrls } from "@/lib/marketing/canonical-site";

const DEV_ORIGIN_URL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/[^\s)"']*)?/gi;

/** מסיר תגיות פנימיות ומחליף כתובות dev בכתובת פרודקשן קנונית */
export function sanitizeMarketingAssistantReply(text: string): string {
  const { siteOrigin } = buildMarketingPublicUrls();

  return text
    .replaceAll(GEMINI_LIVE_SESSION_START_TAG, "")
    .replace(/\[SESSION_WRAP_UP\]/gi, "")
    .replace(DEV_ORIGIN_URL, (_match, path?: string) => `${siteOrigin}${path ?? ""}`)
    .replace(/\blocalhost(?::\d+)?\b/gi, new URL(siteOrigin).host)
    .replace(/\b127\.0\.0\.1(?::\d+)?\b/g, new URL(siteOrigin).host)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
