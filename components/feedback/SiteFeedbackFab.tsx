"use client";

import "./site-feedback.css";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import SiteFeedbackForm from "@/components/feedback/SiteFeedbackForm";

/** ניפוץ אירוע זה פותח את פאנל המשוב — משמש כפתור הלשונית במובייל */
export const OPEN_FEEDBACK_FAB_EVENT = "bsd-open-feedback-fab";

export default function SiteFeedbackFab() {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="site-feedback-fab fixed start-4 z-[2400] hidden md:flex h-12 w-12 items-center justify-center rounded-full border border-indigo-400/40 bg-indigo-600 text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 md:h-auto md:w-auto md:gap-2 md:px-4 md:py-3 md:text-sm md:font-bold"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MessageSquare className="h-5 w-5 shrink-0" aria-hidden />
        <span className="hidden md:inline">{t("siteFeedback.fabLabel")}</span>
      </button>

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
