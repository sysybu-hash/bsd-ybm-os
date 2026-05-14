import { CONSTRUCTION_TRADE_IDS, type ConstructionTradeId } from "@/lib/construction-trades";

/**
 * עוגיית דפדפן לבחירת מקצוע לפני התחברות.
 *
 * **גשר ל־DB (הרשמה / יצירת ארגון):**
 * 1. בדף הבחירה (marketing): `document.cookie` או Server Action עם `cookies().set(PRELOGIN_TRADE_COOKIE, tradeId, preloginTradeCookieOptions())`.
 * 2. ב־Server Action של `register` / `createOrganization`: קרא `cookies().get(PRELOGIN_TRADE_COOKIE)?.value`, אמת עם `isValidPreloginConstructionTrade`, כתוב ל־`prisma.organization.create/update({ constructionTrade })`.
 * 3. אחרי הצלחה: `cookies().delete(PRELOGIN_TRADE_COOKIE)` (או `maxAge: 0`) כדי שלא יישאר סתירה לעדכונים עתידיים מההגדרות.
 *
 * **סנכרון מצב אחרי שינוי מקצוע בהגדרות (RSC):** ראה בלוק "סנכרון UI" ב־`lib/workspace-features.ts`.
 */
export const PRELOGIN_TRADE_COOKIE = "bsd_prelogin_construction_trade";

const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function preloginTradeCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function isValidPreloginConstructionTrade(value: string | undefined | null): value is ConstructionTradeId {
  if (!value || typeof value !== "string") return false;
  return (CONSTRUCTION_TRADE_IDS as readonly string[]).includes(value.trim());
}
