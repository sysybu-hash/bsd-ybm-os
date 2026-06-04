import type { ReactNode } from "react";
import MarketingHeroPreload from "@/components/layout/MarketingHeroPreload";

/** Layout רזה לנתיבי שיווק (preview) — preload LCP poster */
export default function MarketingRouteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <MarketingHeroPreload />
      {children}
    </>
  );
}
