"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, ChevronLeft, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { captureProductEvent } from "@/lib/analytics/posthog-client";

const STORAGE_KEY = "bsd_ybm_first_day_wizard_v1";

const STEPS = [
  { id: "login", titleKey: "workspaceWidgets.onboarding.stepLogin" },
  { id: "drive", titleKey: "workspaceWidgets.onboarding.stepDrive" },
  { id: "scan", titleKey: "workspaceWidgets.onboarding.stepScan" },
  { id: "document", titleKey: "workspaceWidgets.onboarding.stepDocument" },
] as const;

async function trackWizard(action: string, details?: string) {
  captureProductEvent("wizard_step", { action, details: details ?? "" });
  try {
    await fetch("/api/telemetry/wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, details }),
    });
  } catch {
    /* non-blocking */
  }
}

type FirstDayWizardProps = {
  onOpenWidget: (type: "googleDrive" | "aiScanner" | "docCreator") => void;
};

export default function FirstDayWizard({ onOpenWidget }: FirstDayWizardProps) {
  const { t } = useI18n();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [status]);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
    void trackWizard("completed");
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setOpen(false);
    void trackWizard("dismissed");
  }, []);

  if (!open) return null;

  const current = STEPS[step];

  const onPrimary = () => {
    void trackWizard(`step_${current.id}`);
    if (current.id === "drive") onOpenWidget("googleDrive");
    if (current.id === "scan") onOpenWidget("aiScanner");
    if (current.id === "document") onOpenWidget("docCreator");
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      complete();
    }
  };

  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1250] mx-auto max-w-md rounded-xl border border-indigo-500/30 bg-[color:var(--surface-card)] p-4 shadow-xl md:start-auto md:end-6 md:bottom-28"
      role="dialog"
      aria-label={t("workspaceWidgets.onboarding.title")}
      data-testid="first-day-wizard"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            {t("workspaceWidgets.onboarding.eyebrow")}
          </p>
          <h2 className="text-base font-black text-[color:var(--foreground-main)]">
            {t("workspaceWidgets.onboarding.title")}
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-1.5 hover:bg-[color:var(--surface-soft)]"
          aria-label={t("workspaceWidgets.onboarding.dismiss")}
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <ol className="mb-4 space-y-2">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 text-sm ${i === step ? "font-bold text-[color:var(--foreground-main)]" : "text-[color:var(--foreground-muted)]"}`}
          >
            {i < step ? (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" aria-hidden />
            ) : (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px]">
                {i + 1}
              </span>
            )}
            {t(s.titleKey)}
          </li>
        ))}
      </ol>

      <p className="mb-4 text-xs text-[color:var(--foreground-muted)]">
        {t(`workspaceWidgets.onboarding.desc_${current.id}`)}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrimary}
          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-500"
        >
          {step < STEPS.length - 1
            ? t("workspaceWidgets.onboarding.next")
            : t("workspaceWidgets.onboarding.finish")}
          <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)]"
        >
          {t("workspaceWidgets.onboarding.skip")}
        </button>
      </div>
    </div>
  );
}
