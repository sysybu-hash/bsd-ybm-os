"use client";

import { CheckCircle2, ChevronLeft, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

export type WizardStep = {
  id: string;
  titleKey: string;
};

type Props = {
  steps: readonly WizardStep[];
  step: number;
  onDismiss: () => void;
  onPrimary: () => void;
};

export default function FirstDayWizardPanel({
  steps,
  step,
  onDismiss,
  onPrimary,
}: Props) {
  const { t } = useI18n();
  const current = steps[step];
  if (!current) return null;

  const progressPct = Math.round(((step + 1) / steps.length) * 100);

  return (
    <div
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1250] mx-auto max-w-md overflow-hidden rounded-2xl border border-indigo-500/35 bg-[color:var(--surface-card)] shadow-2xl shadow-indigo-950/20 md:start-auto md:end-6 md:bottom-28"
      role="dialog"
      aria-label={t("workspaceWidgets.onboarding.title")}
      data-testid="first-day-wizard"
    >
      <div
        className="h-1 bg-indigo-500/20"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-gradient-to-l from-indigo-500 to-violet-500 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--win-accent,#6366f1)] dark:text-indigo-300">
              {t("workspaceWidgets.onboarding.eyebrow")}
            </p>
            <h2 className="text-base font-black text-[color:var(--foreground-main)]">
              {t("workspaceWidgets.onboarding.title")}
            </h2>
            <p className="mt-0.5 text-[11px] text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.onboarding.stepCounter", {
                current: String(step + 1),
                total: String(steps.length),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1.5 hover:bg-[color:var(--surface-soft)]"
            aria-label={t("workspaceWidgets.onboarding.dismiss")}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <ol className="mb-4 space-y-2">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`flex items-center gap-2 text-sm ${i === step ? "font-bold text-[color:var(--foreground-main)]" : "text-[color:var(--foreground-muted)]"}`}
            >
              {i < step ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${i === step ? "border-2 border-indigo-500 text-[color:var(--win-accent,#6366f1)]" : "border border-current"}`}
                >
                  {i + 1}
                </span>
              )}
              {t(s.titleKey)}
            </li>
          ))}
        </ol>

        <p className="mb-4 text-xs leading-relaxed text-[color:var(--foreground-muted)]">
          {t(`workspaceWidgets.onboarding.desc_${current.id}`)}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrimary}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[color:var(--win-accent,#6366f1)] px-3 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
          >
            {step < steps.length - 1
              ? t("workspaceWidgets.onboarding.next")
              : t("workspaceWidgets.onboarding.finish")}
            <ChevronLeft size={16} className="rtl:rotate-180" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)]"
          >
            {t("workspaceWidgets.onboarding.skip")}
          </button>
        </div>
      </div>
    </div>
  );
}
