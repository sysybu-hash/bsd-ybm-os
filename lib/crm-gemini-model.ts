import { parseSubscriptionTier } from "@/lib/subscription-tier-config";
import { env } from "@/lib/env";
import {
  GEMINI_PREMIUM_TEXT_MODEL,
  GEMINI_STABLE_TEXT_MODEL,
  resolveGeminiModelId,
} from "@/lib/gemini-model";

/**
 * בחירת מודל Gemini לניתוח CRM: FREE → Flash; מנוי בתשלום או SUPER_ADMIN → Pro.
 * ניתן לעקוף ב־CRM_ANALYSIS_GEMINI_MODEL / PREMIUM_GEMINI_MODEL.
 */
export const CRM_FLASH_MODEL_DEFAULT = GEMINI_STABLE_TEXT_MODEL;
export const CRM_PREMIUM_MODEL_DEFAULT = GEMINI_PREMIUM_TEXT_MODEL;

export function resolveCrmGeminiModel(
  orgTier: string,
  callerRole: string | undefined,
  callerIsOSOwner?: boolean,
): string {
  const flash = resolveGeminiModelId(
    env.CRM_ANALYSIS_GEMINI_MODEL?.trim() || CRM_FLASH_MODEL_DEFAULT,
  );
  const pro = resolveGeminiModelId(
    env.PREMIUM_GEMINI_MODEL?.trim() || CRM_PREMIUM_MODEL_DEFAULT,
  );

  const tier = parseSubscriptionTier(orgTier) ?? "FREE";
  const orgPremium = tier !== "FREE";
  const platformAdmin =
    callerIsOSOwner === true || callerRole === "SUPER_ADMIN";

  if (orgPremium || platformAdmin) {
    return pro;
  }
  return flash;
}
