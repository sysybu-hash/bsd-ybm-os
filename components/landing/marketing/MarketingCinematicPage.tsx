"use client";



import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useMarketingHeroOmnibar } from "@/hooks/useMarketingHeroOmnibar";

import { useI18n } from "@/components/os/system/I18nProvider";

import VideoBackground from "@/components/landing/marketing/VideoBackground";

import MarketingNavbar from "@/components/landing/marketing/MarketingNavbar";

import HeroSection from "@/components/landing/marketing/HeroSection";

import MarketingExploreHub from "@/components/landing/marketing/MarketingExploreHub";

import MarketingLiveDemoSection from "@/components/landing/marketing/MarketingLiveDemoSection";

import MarketingContactStrip from "@/components/landing/marketing/MarketingContactStrip";

import MarketingFooter from "@/components/landing/marketing/MarketingFooter";

import MarketingMobileMenu from "@/components/landing/marketing/MarketingMobileMenu";

import MarketingMobileOmnibarSheet from "@/components/landing/marketing/MarketingMobileOmnibarSheet";

import MobileBottomNav from "@/components/landing/marketing/MobileBottomNav";

import { MarketingPanelProvider } from "@/components/landing/marketing/MarketingPanelContext";

import MarketingPanelHost from "@/components/landing/marketing/MarketingPanelHost";



export default function MarketingCinematicPage() {

  const router = useRouter();

  const { dir, locale, t } = useI18n();

  const omnibar = useMarketingHeroOmnibar(t, locale);

  const [mobileOmnibarOpen, setMobileOmnibarOpen] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);



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

  const goLiveDemo = () => {
    document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

        <VideoBackground />

        <div className="relative z-10">

          <MarketingNavbar onLogin={goLogin} onRegister={goRegister} />

          <main className="relative pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:pb-8">

            <HeroSection onRegister={goRegister} onLogin={goLogin} omnibar={omnibar} />

            <MarketingLiveDemoSection />

            <MarketingExploreHub />

            <MarketingContactStrip />

            <MarketingFooter />

          </main>

          <MobileBottomNav
            menuOpen={mobileMenuOpen}
            onDismissOverlays={() => {
              setMobileOmnibarOpen(false);
              setMobileMenuOpen(false);
            }}
            onOpenMenu={() => {
              setMobileOmnibarOpen(false);
              setMobileMenuOpen(true);
            }}
            onOpenOmnibar={() => {
              setMobileMenuOpen(false);
              setMobileOmnibarOpen(true);
            }}
          />

          <MarketingMobileMenu

            open={mobileMenuOpen}

            onClose={() => setMobileMenuOpen(false)}

            onLogin={goLogin}

            onRegister={goRegister}

          />

          <MarketingMobileOmnibarSheet

            open={mobileOmnibarOpen}

            onClose={() => setMobileOmnibarOpen(false)}

            omnibar={omnibar}

          />

          <MarketingPanelHost onLogin={goLogin} onRegister={goRegister} />

        </div>

      </div>

    </MarketingPanelProvider>

  );

}

