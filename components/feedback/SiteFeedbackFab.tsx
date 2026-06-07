"use client";

import "./site-feedback.css";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import SiteFeedbackForm from "@/components/feedback/SiteFeedbackForm";

import { OPEN_FEEDBACK_FAB_EVENT } from "@/lib/mobile-chrome-events";

export { OPEN_FEEDBACK_FAB_EVENT };

type Props = { hideFab?: boolean };

export default function SiteFeedbackFab({ hideFab = false }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const feedbackContext =
    pathname === "/" || pathname.startsWith("/marketing-preview") ? "marketing" : "app";

  /** מאזין לאירוע מהלשונית במובייל */
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK_FAB_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_FAB_EVENT, onOpen);
  }, []);

  return (
    <>
      {/* כפתור FAB — מוסתר במובייל (הלשונית בסרגל התחתון מחליפה אותו) */}
      {!hideFab ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="site-feedback-fab fixed start-4 z-[2400] hidden md:flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-400/35 bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 lg:h-auto lg:w-auto lg:gap-2 lg:rounded-2xl lg:px-3.5 lg:py-2.5 lg:text-sm lg:font-bold"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("siteFeedback.fabLabel")}
        >
          <MessageSquare className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="hidden lg:inline">{t("siteFeedback.fabLabel")}</span>
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[2500] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-labelledby="site-feedback-title"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={t("siteFeedback.close")}
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="site-feedback-title"
                  className="text-lg font-black text-[color:var(--foreground-main)]"
                >
                  {t("siteFeedback.title")}
                </h2>
                <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
                  {t("siteFeedback.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                aria-label={t("siteFeedback.close")}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <SiteFeedbackForm context={feedbackContext} onSuccess={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
