"use client";

import "./site-feedback.css";
import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import SiteFeedbackForm from "@/components/feedback/SiteFeedbackForm";

export default function SiteFeedbackFab() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="site-feedback-fab fixed bottom-[max(1rem,env(safe-area-inset-bottom))] start-4 z-[2400] flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 md:bottom-6"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MessageSquare className="h-5 w-5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{t("siteFeedback.fabLabel")}</span>
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
                <h2 id="site-feedback-title" className="text-lg font-black text-[color:var(--foreground-main)]">
                  {t("siteFeedback.title")}
                </h2>
                <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{t("siteFeedback.subtitle")}</p>
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
            <SiteFeedbackForm context="app" onSuccess={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
