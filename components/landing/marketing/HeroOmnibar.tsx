"use client";

import MarketingHeroOmnibarUI from "@/components/landing/marketing/MarketingHeroOmnibarUI";
import type { MarketingHeroOmnibarState } from "@/hooks/useMarketingHeroOmnibar";

type Props = Readonly<{
  omnibar: MarketingHeroOmnibarState;
}>;

export default function HeroOmnibar({ omnibar }: Props) {
  return <MarketingHeroOmnibarUI omnibar={omnibar} variant="hero" />;
}
