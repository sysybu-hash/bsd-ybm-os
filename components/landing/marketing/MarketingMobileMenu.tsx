"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useMarketingPanel } from "@/components/landing/marketing/MarketingPanelContext";
import { MARKETING_EXPLORE_PANELS } from "@/lib/marketing/marketing-panels";
import {
  SITE_CONTACT,
  siteContactAddress,
  siteContactAvailability,
  siteContactPhoneDisplay,
  siteContactWhatsAppUrl,
} from "@/lib/site-contact";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
}>;

export default function MarketingMobileMenu({ open, onClose, onLogin, onRegister }: Props) {
  const { t, dir, locale } = useI18n();
  const { openPanel } = useMarketingPanel();
  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

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
            className="mkt-mobile-menu-backdrop fixed inset-0 z-[90] md:hidden"
            aria-label={t("marketingHome.cinematic.closeMenuAria")}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("marketingHome.cinematic.menuAria")}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className="mkt-mobile-menu-panel fixed inset-x-3 top-[calc(var(--mkt-nav-height,4.25rem)+0.5rem)] bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-[95] flex flex-col overflow-hidden rounded-3xl border shadow-2xl md:hidden"
            dir={dir}
          >
            <header className="mkt-mobile-menu-header flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
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

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <p className="mkt-mobile-menu-eyebrow mb-1 text-[11px] font-bold tracking-widest uppercase">
                {t("marketingHome.hero.kicker")}
              </p>
              <p className="mkt-mobile-menu-tagline mb-5 text-base font-bold leading-snug">
                {t("marketingHome.header.tagline")}
              </p>

              <nav className="flex flex-col gap-2" aria-label={t("marketingHome.cinematic.menuAria")}>
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
                      className="mkt-mobile-menu-link group flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-start transition active:scale-[0.99]"
                    >
                      <span className="mkt-mobile-menu-link-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
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

              <div className="mkt-mobile-menu-contact mt-5 space-y-2 rounded-2xl border p-3 text-xs text-slate-400">
                <p>
                  <span className="font-bold text-slate-200">{t("marketingHome.contact.phoneLabel")}: </span>
                  <a
                    href={siteContactWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-200/90"
                    aria-label={t("marketingHome.contact.whatsappAria")}
                  >
                    {siteContactPhoneDisplay(locale)}
                  </a>
                </p>
                <p>
                  <span className="font-bold text-slate-200">{t("marketingHome.contact.emailLabel")}: </span>
                  <a href={`mailto:${SITE_CONTACT.email}`} className="text-amber-200/90">
                    {SITE_CONTACT.email}
                  </a>
                </p>
                <p>
                  <span className="font-bold text-slate-200">{t("marketingHome.contact.addressLabel")}: </span>
                  {siteContactAddress(locale)}
                </p>
                <p>{siteContactAvailability(locale)}</p>
              </div>
            </div>

            <footer className="mkt-mobile-menu-footer shrink-0 border-t px-4 py-4">
              <div className="mb-4 flex items-center justify-center gap-2">
                <div className="mkt-locale-switcher mkt-mobile-menu-chip rounded-xl px-2 py-1">
                  <LocaleSwitcher compact />
                </div>
                <div className="mkt-theme-toggle mkt-mobile-menu-chip rounded-xl p-1">
                  <ThemeToggle variant="landing" />
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRegister();
                  }}
                  className="mkt-btn-primary w-full rounded-2xl py-3.5 text-sm font-extrabold shadow-lg"
                >
                  {t("marketingHome.hero.ctaRegister")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogin();
                  }}
                  className="mkt-btn-ghost w-full rounded-2xl py-3.5 text-sm font-bold"
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
