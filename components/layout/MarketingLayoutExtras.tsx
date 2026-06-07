"use client";

import dynamic from "next/dynamic";

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

/** עוגיות, משוב, נגישות וטוסטר — אחרי hydration כדי לא להגדיל TBT בדף נחיתה */
export default function MarketingLayoutExtras() {
  return (
    <>
      <AccessibilitySettingsBootstrap />
      <CookieConsentBanner />
      <AccessibilityToolbar />
      <SiteFeedbackFab />
      <AppToaster />
    </>
  );
}
