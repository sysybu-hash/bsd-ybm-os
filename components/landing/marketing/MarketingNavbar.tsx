"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useMarketingPanel } from "@/components/landing/marketing/MarketingPanelContext";
import { MARKETING_NAV_PANELS } from "@/lib/marketing/marketing-panels";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  onLogin: () => void;
  onRegister: () => void;
  /** "top" = classic horizontal nav (default). "drawer" = slim bar + slide-in side menu. */
  variant?: "top" | "drawer";
}>;

export default function MarketingNavbar({ onLogin, onRegister, variant = "top" }: Props) {
  const { t, dir } = useI18n();
  const { openPanel } = useMarketingPanel();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const navClass = scrolled
    ? "mkt-glass-strong border-b border-white/10 shadow-lg"
    : "bg-transparent border-b border-transparent";

  // ── Drawer variant ──────────────────────────────────────────────────────
  if (variant === "drawer") {
    const panelOffscreen = dir === "rtl" ? "100%" : "-100%";
    return (
      <>
        <header
          className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${navClass}`}
          style={{ top: "var(--mkt-banner-offset, 0px)" }}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3.5">
            <BrandHomeLink size="sm" variant="image" tone="auto" priority />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRegister}
                className="hidden rounded-full mkt-btn-primary px-4 py-2 text-sm font-bold sm:inline-flex"
              >
                {t("marketingHome.hero.ctaRegister")}
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label={t("marketingHome.cinematic.menuAria")}
                aria-expanded={drawerOpen}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 mkt-glass text-[color:var(--mkt-fg)] transition hover:bg-white/10"
              >
                <Menu size={20} aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {drawerOpen ? (
            <>
              <motion.button
                key="mkt-drawer-backdrop"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[90] bg-slate-950/55 backdrop-blur-sm"
                aria-label={t("workspaceWidgets.sidebar.closeAria")}
                onClick={() => setDrawerOpen(false)}
              />
              <motion.aside
                key="mkt-drawer-panel"
                role="dialog"
                aria-modal="true"
                aria-label={t("marketingHome.cinematic.menuAria")}
                dir={dir}
                initial={{ x: panelOffscreen }}
                animate={{ x: 0 }}
                exit={{ x: panelOffscreen }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
                className="mkt-glass-strong fixed inset-y-0 end-0 z-[95] flex w-[min(86vw,20rem)] flex-col border-s border-white/10 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                  <BrandHomeLink size="sm" variant="image" tone="auto" />
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label={t("workspaceWidgets.sidebar.closeAria")}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--mkt-fg)] transition hover:bg-white/10"
                  >
                    <X size={20} aria-hidden />
                  </button>
                </div>

                <nav
                  className="flex-1 overflow-y-auto px-3 py-4"
                  aria-label={t("marketingHome.nav.product")}
                >
                  <ul className="flex flex-col gap-1">
                    {MARKETING_NAV_PANELS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              openPanel(item.id);
                              setDrawerOpen(false);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-bold text-[color:var(--mkt-nav-link)] transition hover:bg-white/10"
                          >
                            {Icon ? <Icon size={18} className="shrink-0 text-[color:var(--mkt-accent)]" aria-hidden /> : null}
                            {t(item.titleKey)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                <div className="border-t border-white/10 px-4 py-4">
                  <div className="flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={() => { onRegister(); setDrawerOpen(false); }}
                      className="w-full rounded-full mkt-btn-primary px-4 py-2.5 text-sm font-bold"
                    >
                      {t("marketingHome.hero.ctaRegister")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { onLogin(); setDrawerOpen(false); }}
                      className="w-full rounded-full mkt-btn-ghost px-4 py-2.5 text-sm font-bold"
                    >
                      {t("marketingHome.osLanding.signIn")}
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="mkt-locale-switcher"><LocaleSwitcher compact /></div>
                    <div className="mkt-theme-toggle"><ThemeToggle variant="landing" /></div>
                  </div>
                </div>
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>
      </>
    );
  }

  // ── Classic top nav (default) ───────────────────────────────────────────
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
              aria-label={t(item.titleKey)}
              className="mkt-nav-link text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
