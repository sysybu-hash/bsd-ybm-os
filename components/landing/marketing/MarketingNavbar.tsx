"use client";

import { useEffect, useState } from "react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useMarketingPanel } from "@/components/landing/marketing/MarketingPanelContext";
import { MARKETING_NAV_PANELS } from "@/lib/marketing/marketing-panels";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  onLogin: () => void;
  onRegister: () => void;
}>;

export default function MarketingNavbar({ onLogin, onRegister }: Props) {
  const { t } = useI18n();
  const { openPanel } = useMarketingPanel();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navClass = scrolled
    ? "mkt-glass-strong border-b border-white/10 shadow-lg"
    : "bg-transparent border-b border-transparent";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${navClass}`}
      style={{ top: "var(--mkt-banner-offset, 0px)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-4">
        <BrandHomeLink size="sm" variant="image" tone="auto" priority />

        <nav className="hidden items-center gap-6 md:flex" aria-label={t("marketingHome.nav.product")}>
          {MARKETING_NAV_PANELS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openPanel(item.id)}
              className="mkt-nav-link text-sm font-semibold transition-colors"
            >
              {t(item.titleKey)}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="mkt-locale-switcher">
            <LocaleSwitcher compact className="hidden sm:block" />
          </div>
          <div className="mkt-theme-toggle hidden sm:block">
            <ThemeToggle variant="landing" />
          </div>
          <button
            type="button"
            onClick={onLogin}
            className="hidden rounded-full mkt-btn-ghost px-4 py-2 text-sm font-bold sm:inline-flex"
          >
            {t("marketingHome.osLanding.signIn")}
          </button>
          <button
            type="button"
            onClick={onRegister}
            className="hidden rounded-full mkt-btn-primary px-4 py-2 text-sm font-bold md:inline-flex"
          >
            {t("marketingHome.hero.ctaRegister")}
          </button>
        </div>
      </div>
    </header>
  );
}
