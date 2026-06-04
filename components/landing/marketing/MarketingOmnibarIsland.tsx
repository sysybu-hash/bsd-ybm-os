"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMarketingHeroOmnibar } from "@/hooks/useMarketingHeroOmnibar";
import { useI18n } from "@/components/os/system/I18nProvider";
import HeroOmnibarSection from "@/components/landing/marketing/HeroOmnibarSection";
import MarketingMobileOmnibarSheet from "@/components/landing/marketing/MarketingMobileOmnibarSheet";
import { OPEN_OMNIBAR_EVENT } from "@/components/landing/marketing/marketing-omnibar-events";

const MarketingPanelHost = dynamic(
  () => import("@/components/landing/marketing/MarketingPanelHost"),
  { ssr: false },
);

type Props = Readonly<{
  onLogin: () => void;
  onRegister: () => void;
}>;

/** Omnibar + Gemini Live + פאנלים — נטען אחרי idle כדי לא לחסום LCP/TBT */
export default function MarketingOmnibarIsland({ onLogin, onRegister }: Props) {
  const { locale, t } = useI18n();
  const omnibar = useMarketingHeroOmnibar(t, locale);
  const [mobileOmnibarOpen, setMobileOmnibarOpen] = useState(false);

  useEffect(() => {
    const open = () => setMobileOmnibarOpen(true);
    window.addEventListener(OPEN_OMNIBAR_EVENT, open);
    return () => window.removeEventListener(OPEN_OMNIBAR_EVENT, open);
  }, []);

  return (
    <>
      <HeroOmnibarSection omnibar={omnibar} />
      <MarketingMobileOmnibarSheet
        open={mobileOmnibarOpen}
        onClose={() => setMobileOmnibarOpen(false)}
        omnibar={omnibar}
      />
      <MarketingPanelHost onLogin={onLogin} onRegister={onRegister} />
    </>
  );
}

