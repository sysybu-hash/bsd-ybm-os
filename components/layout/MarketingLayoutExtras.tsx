"use client";

import dynamic from "next/dynamic";
import DeferUntilIdle from "@/components/layout/DeferUntilIdle";

const CookieConsentBanner = dynamic(() => import("@/components/legal/CookieConsentBanner"), {
  ssr: false,
});

const AppToaster = dynamic(() => import("@/components/os/system/AppToaster"), {
  ssr: false,
});

const AccessibilityToolbar = dynamic(
  () => import("@/components/os/system/AccessibilityToolbar"),
  { ssr: false },
);

const SiteFeedbackFab = dynamic(() => import("@/components/feedback/SiteFeedbackFab"), {
  ssr: false,
});

const AccessibilitySettingsBootstrap = dynamic(
  () =>
    import("@/components/os/system/AccessibilitySettingsBootstrap").then((m) => ({
      default: m.AccessibilitySettingsBootstrap,
    })),
  { ssr: false },
);

/** עוגיות, משוב, נגישות וטוסטר — אחרי idle כדי לא להגדיל TBT/LCP בדף נחיתה */
export default function MarketingLayoutExtras() {
  return (
    <DeferUntilIdle timeoutMs={6000}>
      <AccessibilitySettingsBootstrap />
      <CookieConsentBanner />
      <AccessibilityToolbar />
      <SiteFeedbackFab />
      <AppToaster />
    </DeferUntilIdle>
  );
}
