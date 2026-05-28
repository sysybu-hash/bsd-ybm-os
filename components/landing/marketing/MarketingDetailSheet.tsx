"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MarketingPanelId } from "@/lib/marketing/marketing-panels";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  panel: MarketingPanelId | null;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}>;

export default function MarketingDetailSheet({
  panel,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
}: Props) {
  const { t, dir } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tmr = window.setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      window.clearTimeout(tmr);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, panel]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {panel ? (
        <div className="mkt-panel-root" dir={dir}>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mkt-panel-backdrop fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md"
            aria-label={t("marketingHome.panels.closeAria")}
            onClick={onClose}
          />
          <div
            className="mkt-panel-overlay pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-3 sm:p-6 md:p-8"
            aria-hidden={false}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="mkt-panel-dialog pointer-events-auto flex w-full max-w-[min(100%,72rem)] flex-col overflow-hidden rounded-3xl border shadow-2xl"
              style={{ maxHeight: "min(92dvh, 920px)", minHeight: "min(58dvh, 480px)" }}
            >
              <header className="mkt-panel-header relative shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-amber-400/80 to-transparent"
                  aria-hidden
                />
                <div className="flex items-start gap-4">
                  {Icon ? (
                    <span className="mkt-panel-header-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14">
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} aria-hidden />
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1 pe-2">
                    <h2 id={titleId} className="text-xl font-black leading-tight sm:text-2xl md:text-3xl">
                      {title}
                    </h2>
                    {subtitle ? (
                      <p className="mkt-panel-subtitle mt-1.5 text-sm font-semibold leading-relaxed sm:text-base">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    className="mkt-panel-close flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:scale-105 active:scale-95"
                    aria-label={t("marketingHome.panels.closeAria")}
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </header>
              <div className="mkt-panel-body custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-6 pt-1 sm:px-7 sm:pb-8">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
