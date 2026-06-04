"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { FIRST_DAY_WIZARD_STORAGE_KEY } from "@/lib/onboarding/first-day-wizard-constants";
import FirstDayWizardPanel, { type WizardStep } from "@/components/os/onboarding/FirstDayWizardPanel";

const STEPS: readonly WizardStep[] = [
  { id: "login", titleKey: "workspaceWidgets.onboarding.stepLogin" },
  { id: "finance", titleKey: "workspaceWidgets.onboarding.stepFinance" },
  { id: "scan", titleKey: "workspaceWidgets.onboarding.stepScan" },
  { id: "drive", titleKey: "workspaceWidgets.onboarding.stepDrive" },
  { id: "fieldCopilot", titleKey: "workspaceWidgets.onboarding.stepFieldCopilot" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

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
    case "finance":
      onOpenWidget("financeHub", { tab: "overview" });
      break;
    case "scan":
      onOpenWidget("documentsHub", { tab: "scan" });
      break;
    case "drive":
      onOpenWidget("googleDrive", null);
      break;
    case "fieldCopilot":
      onOpenWidget("fieldCopilot", null);
      break;
    default:
      break;
  }
}

export default function FirstDayWizard({ onOpenWidget }: FirstDayWizardProps) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;
    try {
      const done = localStorage.getItem(FIRST_DAY_WIZARD_STORAGE_KEY);
      if (!done) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [status]);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(FIRST_DAY_WIZARD_STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
    void trackWizard("completed");
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(FIRST_DAY_WIZARD_STORAGE_KEY, "dismissed");
    } catch {
      /* ignore */
    }
    setOpen(false);
    void trackWizard("dismissed");
  }, []);

  if (!open) return null;

  const current = STEPS[step];
  if (!current) return null;

  const onPrimary = () => {
    void trackWizard(`step_${current.id}`);
    if (current.id !== "login") {
      openForStep(current.id, onOpenWidget);
    }
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
