"use client";

import React from "react";
import { Check } from "lucide-react";
import type { WizardStep } from "@/components/os/widgets/floorplan-viz/wizard/useVizWizard";

type TFn = (key: string, vars?: Record<string, string>) => string;

const ORDER: WizardStep[] = ["upload", "identify", "options", "result"];

/** The four steps, the current one marked and the ones behind it done. Right to left, as the window reads. */
export default function VizStepper({ t, step }: { t: TFn; step: WizardStep }) {
  const current = ORDER.indexOf(step);
  return (
    <ol className="flex items-center gap-1.5" aria-label={t("workspaceWidgets.floorplanViz.wizard.structureLabel")}>
      {ORDER.map((id, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={id} className="flex items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                active
                  ? "bg-violet-600 text-white"
                  : done
                    ? "bg-violet-500/20 text-violet-700 dark:text-violet-300"
                    : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"
              }`}
            >
              {done ? <Check size={11} aria-hidden /> : index + 1}
            </span>
            <span className={`text-[11px] ${active ? "font-bold" : "text-[color:var(--foreground-muted)]"}`}>
              {t(`workspaceWidgets.floorplanViz.wizard.steps.${id}`)}
            </span>
            {index < ORDER.length - 1 ? <span className="mx-0.5 h-px w-4 bg-[color:var(--border-main)]" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
