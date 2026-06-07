"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/os/system/I18nProvider";
import MarketingNavbar from "@/components/landing/marketing/MarketingNavbar";
import { openMarketingOmnibarSheet } from "@/components/landing/marketing/marketing-omnibar-events";
import MarketingOmnibarPlaceholder from "@/components/landing/marketing/MarketingOmnibarPlaceholder";
import { MarketingPanelProvider } from "@/components/landing/marketing/MarketingPanelContext";
import DeferUntilVisible from "@/components/layout/DeferUntilVisible";
import MarketingDeferredChrome from "@/components/layout/MarketingDeferredChrome";
import type { AppLocale } from "@/lib/i18n/config";

const VideoBackground = dynamic(() => import("@/components/landing/marketing/VideoBackground"), {
  ssr: false,
});

const MarketingLiveDemoSection = dynamic(
  () => import("@/components/landing/marketing/MarketingLiveDemoSection"),
  {
    loading: () => (
      <div className="min-h-[28rem] w-full" aria-hidden data-marketing-live-demo-skeleton />
    ),
  },
);

const MarketingExploreHub = dynamic(
  () => import("@/components/landing/marketing/MarketingExploreHub"),
  {
    loading: () => <div className="min-h-[24rem] w-full" aria-hidden />,
  },
);

const MarketingOmnibarIsland = dynamic(
  () => import("@/components/landing/marketing/MarketingOmnibarIsland"),
  { ssr: false, loading: () => <MarketingOmnibarPlaceholder /> },
);

const MobileBottomNav = dynamic(() => import("@/components/landing/marketing/MobileBottomNav"), {
  ssr: false,
  loading: () => <div className="fixed inset-x-0 bottom-0 z-50 h-16 md:hidden" aria-hidden />,
});

const MarketingMobileMenu = dynamic(
  () => import("@/components/landing/marketing/MarketingMobileMenu"),
  { ssr: false },
);

type Props = Readonly<{
  hero: React.ReactNode;
  locale?: AppLocale;
}>;

export default function MarketingCinematicClient({ hero }: Props) {
  const router = useRouter();
  const { dir, locale, t } = useI18n();
  const [mountOmnibar, setMountOmnibar] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [enableVideoLayer, setEnableVideoLayer] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!mobile && !reduced) setEnableVideoLayer(true);
  }, []);

  useEffect(() => {
    const run = () => setMountOmnibar(true);
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const timeout = mobile ? 5000 : 2500;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout });
    } else {
      globalThis.setTimeout(run, mobile ? 2000 : 1200);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  useEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    const resetScroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        });
      });
    };

    resetScroll();

    const onPageShow = (event: PageTransitionEvent) => {
      resetScroll();
      if (event.persisted) {
        window.dispatchEvent(new Event("marketing:pageshow-restore"));
      }
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const goLogin = () => router.push("/login");
  const goRegister = () => {
    void import("@/lib/analytics/marketing-funnel").then(({ trackFunnelCtaRegister }) => {
      trackFunnelCtaRegister("marketing_hero");
    });
    router.push("/login?mode=register");
  };

  return (
    <MarketingPanelProvider>
      <div
        className="marketing-cinematic relative min-h-dvh overflow-x-hidden bg-transparent"
        dir={dir}
        style={{
          ["--mkt-banner-offset" as string]: "0px",
          minHeight: "100dvh",
          backgroundColor: "var(--mkt-body-bg)",
        }}
      >
        {enableVideoLayer ? <VideoBackground /> : null}
        <div className="relative z-10">
          <MarketingNavbar onLogin={goLogin} onRegister={goRegister} />
          <main className="relative pb-[calc(8rem+env(safe-area-inset-bottom,0px))] md:pb-8">
            {hero}
            {mountOmnibar ? (
              <MarketingOmnibarIsland onLogin={goLogin} onRegister={goRegister} />
            ) : (
              <MarketingOmnibarPlaceholder />
            )}
            <DeferUntilVisible
              rootMargin="-45% 0px 0px 0px"
              minHeight="36rem"
              fallback={<div className="min-h-[36rem] w-full" aria-hidden data-marketing-live-demo-skeleton />}
            >
              <MarketingLiveDemoSection />
            </DeferUntilVisible>
            <DeferUntilVisible minHeight="24rem" fallback={<div className="min-h-[24rem] w-full" aria-hidden />}>
              <MarketingExploreHub />
            </DeferUntilVisible>
            <MarketingDeferredChrome />
          </main>
          <MobileBottomNav
            menuOpen={mobileMenuOpen}
            onDismissOverlays={() => {
              setMobileMenuOpen(false);
            }}
            onOpenMenu={() => {
              setMobileMenuOpen(true);
            }}
            onOpenOmnibar={() => {
              setMobileMenuOpen(false);
              setMountOmnibar(true);
              globalThis.setTimeout(() => openMarketingOmnibarSheet(), 0);
            }}
          />
          {mobileMenuOpen ? (
            <MarketingMobileMenu
              open={mobileMenuOpen}
              onClose={() => setMobileMenuOpen(false)}
              onLogin={goLogin}
              onRegister={goRegister}
            />
          ) : null}
        </div>
      </div>
    </MarketingPanelProvider>
  );
}
