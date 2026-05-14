import { parseSubscriptionTier } from "@/lib/subscription-tier-config";

/**
 * בחירת מודל Gemini לניתוח CRM: FREE → Flash; מנוי בתשלום או SUPER_ADMIN → Pro.
 * ניתן לעקוף ב־CRM_ANALYSIS_GEMINI_MODEL / PREMIUM_GEMINI_MODEL.
 */
export const CRM_FLASH_MODEL_DEFAULT = "gemini-2.5-flash";
export const CRM_PREMIUM_MODEL_DEFAULT = "gemini-3.1-pro-stable";

export function resolveCrmGeminiModel(
  orgTier: string,
  callerRole: string | undefined,
  callerIsOSOwner?: boolean,
): string {
  const flash =
    process.env.CRM_ANALYSIS_GEMINI_MODEL?.trim() || CRM_FLASH_MODEL_DEFAULT;
  const pro = process.env.PREMIUM_GEMINI_MODEL?.trim() || CRM_PREMIUM_MODEL_DEFAULT;

  const tier = parseSubscriptionTier(orgTier) ?? "FREE";
  const orgPremium = tier !== "FREE";
  const platformAdmin =
    callerIsOSOwner === true || callerRole === "SUPER_ADMIN";

  if (orgPremium || platformAdmin) {
    return pro;
  }
  return flash;
}
