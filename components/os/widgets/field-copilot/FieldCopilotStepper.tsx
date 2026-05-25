"use client";

import { useI18n } from "@/components/os/system/I18nProvider";

const STEPS = ["client", "capture", "analysis", "review", "produce"] as const;

type Props = {
  current: number;
};

export default function FieldCopilotStepper({ current }: Props) {
  const { t, dir } = useI18n();

  return (
    <nav
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-[color:var(--border-main)] px-3 py-2"
      aria-label={t("workspaceWidgets.fieldCopilot.stepperAria")}
      dir={dir}
    >
      {STEPS.map((key, idx) => {
        const active = idx === current;
        const done = idx < current;
        return (
          <div
            key={key}
            className={`flex min-w-[4.5rem] flex-1 flex-col items-center rounded-lg px-1 py-1 text-center text-[10px] font-bold md:text-xs ${
              active
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : done
                  ? "text-emerald-600"
                  : "text-[color:var(--foreground-muted)]"
            }`}
          >
            <span className="mb-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-xs">
              {done ? "✓" : idx + 1}
            </span>
            {t(`workspaceWidgets.fieldCopilot.steps.${key}`)}
          </div>
        );
      })}
    </nav>
  );
}
