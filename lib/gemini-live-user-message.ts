export type GeminiLiveUserErrorKey = "sessionExpired" | "apiKey" | null;

/** מזהה שגיאות Live נפוצות לפני תרגום i18n ב-UI. */
export function getGeminiLiveUserErrorKey(raw: string): GeminiLiveUserErrorKey {
  const lower = raw.trim().toLowerCase();
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
  return null;
}

/**
 * טקסט למשתמש מטעינות Gemini Live — ללא ייבוא מ־Document AI / Node,
 * כדי שקומפוננטות `"use client"` יוכלו לייבא בלי למשוך `fs` ל-bundle הדפדפן.
 */
export function formatGeminiLiveUserMessage(
  raw: string,
  translate?: (key: string) => string,
): string {
  let t = raw.trim();
  if (!t) return "שגיאת חיבור ל-Gemini Live.";
  try {
    const j = JSON.parse(t) as { error?: { message?: string } };
    if (typeof j?.error?.message === "string" && j.error.message.trim()) {
      t = j.error.message.trim();
    }
  } catch {
    /* raw לא JSON */
  }
  const errorKey = getGeminiLiveUserErrorKey(t);
  if (errorKey === "sessionExpired") {
    return (
      translate?.("workspaceWidgets.aiChat.liveSessionExpired") ??
      "פג תוקף חיבור הקול — ההקמה לא הסתיימה בזמן. לחצו שוב על המיקרופון."
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
