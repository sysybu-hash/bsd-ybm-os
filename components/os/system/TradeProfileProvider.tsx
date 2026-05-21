"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { getIndustryConfig, normalizeIndustryType } from "@/lib/professions/config";
import { getIndustryProfile, type IndustryProfile } from "@/lib/professions/runtime";

type TradeProfileContextValue = {
  profile: IndustryProfile;
  industryId: string;
  isConstruction: boolean;
  isCompanyMgmt: boolean;
  features: ReturnType<typeof getIndustryConfig>["features"];
  constructionTradeId: string;
  constructionTradeLabel: string;
  businessLineId: string;
  businessLineLabel: string;
};

const TradeProfileContext = createContext<TradeProfileContextValue | null>(null);

export function TradeProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const { messages } = useI18n();

  const industry =
    (session?.user as { organizationIndustry?: string | null } | undefined)?.organizationIndustry ??
    "CONSTRUCTION";
  const trade =
    (session?.user as { organizationConstructionTrade?: string | null } | undefined)
      ?.organizationConstructionTrade ??
    (isCompanyMgmtIndustry(industry) ? "GENERAL_BUSINESS" : "GENERAL_CONTRACTOR");

  const value = useMemo(() => {
    const industryId = normalizeIndustryType(industry);
    const mergedConfig = getIndustryConfig(industryId);
    const profile = getIndustryProfile(industry, undefined, trade, messages);
    const isCompanyMgmt = industryId === "COMPANY_MGMT";
    return {
      profile,
      industryId,
      isConstruction: industryId === "CONSTRUCTION",
      isCompanyMgmt,
      features: mergedConfig.features,
      constructionTradeId: profile.constructionTradeId ?? trade,
      constructionTradeLabel: profile.constructionTradeLabel ?? trade,
      businessLineId: profile.businessLineId ?? trade,
      businessLineLabel: profile.businessLineLabel ?? trade,
    };
  }, [industry, trade, messages]);

  return (
    <TradeProfileContext.Provider value={value}>{children}</TradeProfileContext.Provider>
  );
}

export function useTradeProfile(): TradeProfileContextValue {
  const ctx = useContext(TradeProfileContext);
  if (!ctx) {
    const profile = getIndustryProfile("CONSTRUCTION", undefined, "GENERAL_CONTRACTOR");
    const mergedConfig = getIndustryConfig("CONSTRUCTION");
    return {
      profile,
      industryId: "CONSTRUCTION",
      isConstruction: true,
      isCompanyMgmt: false,
      features: mergedConfig.features,
      constructionTradeId: "GENERAL_CONTRACTOR",
      constructionTradeLabel: profile.constructionTradeLabel ?? "קבלן ראשי",
      businessLineId: "GENERAL_BUSINESS",
      businessLineLabel: "עסק כללי",
    };
  }
  return ctx;
}
