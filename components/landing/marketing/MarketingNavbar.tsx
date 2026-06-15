"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
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
  const { t, dir } = useI18n();
  const { openPanel } = useMarketingPanel();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const navClass = scrolled
    ? "mkt-glass-strong border-b border-white/10 shadow-lg"
    : "bg-transparent border-b border-transparent";

  // Panel slides in from the inline-start edge (right in RTL, left in LTR).
  const panelOffset = dir === "rtl" ? 320 : -320;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${navClass}`}
      style={{ top: "var(--mkt-banner-offset, 0px)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-0.5 sm:px-6 sm:py-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <BrandHomeLink size="md" variant="image" tone="auto" priority />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t("marketingHome.cinematic.menuAria")}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="mkt-nav-menu-btn flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Menu className="h-7 w-7" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

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

      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2590] bg-slate-950/50 backdrop-blur-sm"
              aria-label={t("marketingHome.cinematic.closeMenuAria")}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={t("marketingHome.cinematic.menuAria")}
              initial={{ opacity: 0, x: panelOffset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: panelOffset }}
              transition={{ type: "spring", damping: 32, stiffness: 360 }}
              className="mkt-glass-strong fixed bottom-0 top-0 z-[2600] flex w-[min(21rem,88vw)] flex-col overflow-hidden border-[color:var(--mkt-glass-border)] start-0 border-e"
              dir={dir}
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--mkt-glass-border)] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <BrandHomeLink size="sm" variant="image" tone="auto" />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10 active:scale-95"
                  aria-label={t("marketingHome.cinematic.closeMenuAria")}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3">
                <p className="mkt-eyebrow mb-1 text-[11px] font-bold tracking-widest uppercase">
                  {t("marketingHome.hero.kicker")}
                </p>
                <p className="mb-4 text-sm font-bold leading-snug text-[color:var(--mkt-fg-muted)]">
                  {t("marketingHome.header.tagline")}
                </p>

                <nav className="flex flex-col gap-1.5" aria-label={t("marketingHome.nav.product")}>
                  {MARKETING_NAV_PANELS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          openPanel(item.id);
                        }}
                        className="group flex w-full items-center gap-3 rounded-xl border border-[color:var(--mkt-glass-border)] bg-[color:var(--mkt-glass-bg)] px-3 py-2.5 text-start transition hover:border-white/25 hover:bg-white/10"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--mkt-icon-well)] text-[color:var(--mkt-accent-strong)]">
                          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold leading-snug text-[color:var(--mkt-fg)]">
                            {t(item.titleKey)}
                          </span>
                          <span className="block text-xs leading-snug text-[color:var(--mkt-fg-muted)]">
                            {t(item.descriptionKey)}
                          </span>
                        </span>
                        <Chevron
                          className="h-4 w-4 shrink-0 opacity-50 transition group-hover:opacity-100 rtl:rotate-180"
                          aria-hidden
                        />
                      </button>
                    );
                  })}
                </nav>
              </div>

              <footer className="shrink-0 border-t border-[color:var(--mkt-glass-border)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="mb-3 flex items-center justify-center gap-2 sm:hidden">
                  <div className="mkt-locale-switcher rounded-xl px-2 py-1">
                    <LocaleSwitcher compact />
                  </div>
                  <div className="mkt-theme-toggle rounded-xl p-1">
                    <ThemeToggle variant="landing" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRegister();
                    }}
                    className="mkt-btn-primary w-full rounded-xl py-3 text-sm font-extrabold shadow-lg"
                  >
                    {t("marketingHome.hero.ctaRegister")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogin();
                    }}
                    className="mkt-btn-ghost w-full rounded-xl py-3 text-sm font-bold"
                  >
                    {t("marketingHome.osLanding.signIn")}
                  </button>
                </div>
              </footer>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
