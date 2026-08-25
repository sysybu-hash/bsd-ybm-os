"use client";

import React, { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { FIRST_DAY_WIZARD_STORAGE_KEY } from "@/lib/onboarding/first-day-wizard-constants";
import FirstDayWizardPanel, { type WizardStep } from "@/components/os/onboarding/FirstDayWizardPanel";
import { useClientFlag } from "@/hooks/use-client-flag";

/** Core path only: project → scan → first save. */
const STEPS: readonly WizardStep[] = [
  { id: "project", titleKey: "workspaceWidgets.onboarding.stepProject" },
  { id: "scan", titleKey: "workspaceWidgets.onboarding.stepScan" },
  { id: "save", titleKey: "workspaceWidgets.onboarding.stepSave" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** The wizard is shown until storage records that it was completed or dismissed. */
function isWizardUnfinished(): boolean {
  try {
    return !localStorage.getItem(FIRST_DAY_WIZARD_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode): show the wizard rather than swallow onboarding.
    return true;
  }
}

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
  onOpenWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

function openForStep(
  stepId: StepId,
  onOpenWidget: FirstDayWizardProps["onOpenWidget"],
): void {
  switch (stepId) {
    case "project":
      onOpenWidget("projectsHub", null);
      break;
    case "scan":
      onOpenWidget("documentsHub", { tab: "scan" });
      break;
    case "save":
      onOpenWidget("documentsHub", { tab: "scan" });
      break;
    default:
      break;
  }
}

export default function FirstDayWizard({ onOpenWidget }: FirstDayWizardProps) {
  const { status } = useSession();
  // Two independent conditions rather than one piece of effect-written state:
  // storage says the wizard is unfinished, and the session has arrived. Closing
  // it writes storage, but `closed` is what hides it in this render.
  const unfinished = useClientFlag(isWizardUnfinished);
  const [closed, setClosed] = useState(false);
  const open = unfinished && !closed && status === "authenticated";
  const [step, setStep] = useState(0);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(FIRST_DAY_WIZARD_STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setClosed(true);
    void trackWizard("completed");
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(FIRST_DAY_WIZARD_STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setClosed(true);
    void trackWizard("dismissed");
  }, []);

  if (!open) return null;

  const current = STEPS[step];
  if (!current) return null;

  const onPrimary = () => {
    void trackWizard(`step_${current.id}`);
    openForStep(current.id, onOpenWidget);
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      complete();
    }
  };

  return (
    <FirstDayWizardPanel
      steps={STEPS}
      step={step}
      onDismiss={dismiss}
      onPrimary={onPrimary}
    />
  );
}

export { FIRST_DAY_WIZARD_STORAGE_KEY };
