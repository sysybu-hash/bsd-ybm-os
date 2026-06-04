"use client";

import dynamic from "next/dynamic";

const CookieConsentBanner = dynamic(() => import("@/components/legal/CookieConsentBanner"), {
  ssr: false,
});

const AppToaster = dynamic(() => import("@/components/os/system/AppToaster"), {
  ssr: false,
});

/** עוגיות + טוסטר — אחרי hydration כדי לא להגדיל TBT בדף נחיתה */
export default function MarketingLayoutExtras() {
  return (
    <>
      <CookieConsentBanner />
      <AppToaster />
    </>
  );
}
