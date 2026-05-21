"use client";

import { useSession } from "next-auth/react";
import { IndustryConfig } from "@/lib/professions/config";
import { normalizeBusinessLine } from "@/lib/business-lines";
import { getMergedIndustryConfig, normalizeConstructionTrade } from "@/lib/construction-trades";
import { useI18n } from "@/components/os/system/I18nProvider";

/**
 * ⚡ BSD-YBM BSD-YBM: INDUSTRY ADAPTATION HOOK
 * Provides professional terminology and features based on the organization's industry.
 */
export function useIndustryConfig(): IndustryConfig {
  const { data: session } = useSession();
  const { t, messages } = useI18n();

  const industryId = (session?.user as { organizationIndustry?: string | null })?.organizationIndustry || "CONSTRUCTION";
  const trade = (session?.user as { organizationConstructionTrade?: string | null })?.organizationConstructionTrade;
  const config = getMergedIndustryConfig(industryId, trade, messages);
  const tradeId = normalizeConstructionTrade(trade);
  const lineId = normalizeBusinessLine(trade);
  /** מקצוע בנייה / קו עסקי ספציפי — שומרים אוצר מילים מהמיזוג */
  const useTradeSpecificVocabulary =
    (config.id === "CONSTRUCTION" && tradeId !== "GENERAL_CONTRACTOR") ||
    (config.id === "COMPANY_MGMT" && lineId !== "GENERAL_BUSINESS");

  // 🌍 BSD-YBM BSD-YBM: Dynamic Hydration
  // We override the hardcoded labels with localized ones from t() system
  return {
    ...config,
    label: t(`professions.${config.id}.label`) || config.label,
    vocabulary: useTradeSpecificVocabulary
      ? { ...config.vocabulary }
      : {
          ...config.vocabulary,
          client: t(`professions.${config.id}.client`) || config.vocabulary.client,
          project: t(`professions.${config.id}.project`) || config.vocabulary.project,
          document: t(`professions.${config.id}.document`) || config.vocabulary.document,
          inventory: t(`professions.${config.id}.inventory`) || config.vocabulary.inventory,
        },
  };
}
