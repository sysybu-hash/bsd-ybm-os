"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { getIndustryProfile, type IndustryProfile } from "@/lib/professions/runtime";

type TradeProfileContextValue = {
  profile: IndustryProfile;
  constructionTradeId: string;
  constructionTradeLabel: string;
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
      ?.organizationConstructionTrade ?? "GENERAL_CONTRACTOR";

  const value = useMemo(() => {
    const profile = getIndustryProfile(industry, trade, messages);
    return {
      profile,
      constructionTradeId: profile.constructionTradeId ?? trade,
      constructionTradeLabel: profile.constructionTradeLabel ?? trade,
    };
  }, [industry, trade, messages]);

  return (
    <TradeProfileContext.Provider value={value}>{children}</TradeProfileContext.Provider>
  );
}

export function useTradeProfile(): TradeProfileContextValue {
  const ctx = useContext(TradeProfileContext);
  if (!ctx) {
    const profile = getIndustryProfile("CONSTRUCTION", "GENERAL_CONTRACTOR");
    return {
      profile,
      constructionTradeId: "GENERAL_CONTRACTOR",
      constructionTradeLabel: profile.constructionTradeLabel ?? "קבלן ראשי",
    };
  }
  return ctx;
}
