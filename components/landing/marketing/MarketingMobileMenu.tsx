"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useMarketingPanel } from "@/components/landing/marketing/MarketingPanelContext";
import { MARKETING_EXPLORE_PANELS } from "@/lib/marketing/marketing-panels";
import { setMarketingMobileOverlayOpen } from "@/lib/marketing/mobile-overlay-body";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
}>;

export default function MarketingMobileMenu({ open, onClose, onLogin, onRegister }: Props) {
  const { t, dir } = useI18n();
  const { openPanel } = useMarketingPanel();
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  useEffect(() => {
    setMarketingMobileOverlayOpen(open);
    return () => setMarketingMobileOverlayOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mkt-mobile-menu-backdrop fixed inset-0 z-[2590] md:hidden"
            aria-label={t("marketingHome.cinematic.closeMenuAria")}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("marketingHome.cinematic.menuAria")}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 32, stiffness: 360 }}
            className="mkt-mobile-menu-panel fixed inset-0 z-[2600] flex flex-col overflow-hidden md:hidden"
            dir={dir}
          >
            <header className="mkt-mobile-menu-header flex shrink-0 items-center justify-between gap-3 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <BrandHomeLink size="sm" variant="image" tone="auto" />
              <button
                type="button"
                onClick={onClose}
                className="mkt-mobile-menu-close flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95"
                aria-label={t("marketingHome.cinematic.closeMenuAria")}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3">
              <p className="mkt-mobile-menu-eyebrow mb-1 text-[11px] font-bold tracking-widest uppercase">
                {t("marketingHome.hero.kicker")}
              </p>
              <p className="mkt-mobile-menu-tagline mb-4 text-sm font-bold leading-snug sm:text-base">
                {t("marketingHome.header.tagline")}
              </p>

              <nav className="flex flex-col gap-1.5" aria-label={t("marketingHome.cinematic.menuAria")}>
                {MARKETING_EXPLORE_PANELS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        openPanel(item.id);
                      }}
                      className="mkt-mobile-menu-link group flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-start transition active:scale-[0.99]"
                    >
                      <span className="mkt-mobile-menu-link-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-bold leading-snug">
                        {t(item.titleKey)}
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

            <footer className="mkt-mobile-menu-footer shrink-0 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mb-3 flex items-center justify-center gap-2">
                <div className="mkt-locale-switcher mkt-mobile-menu-chip rounded-xl px-2 py-1">
                  <LocaleSwitcher compact />
                </div>
                <div className="mkt-theme-toggle mkt-mobile-menu-chip rounded-xl p-1">
                  <ThemeToggle variant="landing" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRegister();
                  }}
                  className="mkt-btn-primary w-full rounded-xl py-3 text-sm font-extrabold shadow-lg"
                >
                  {t("marketingHome.hero.ctaRegister")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogin();
                  }}
                  className="mkt-btn-ghost w-full rounded-xl py-3 text-sm font-bold"
                >
                  {t("marketingHome.osLanding.signIn")}
                </button>
              </div>
            </footer>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
