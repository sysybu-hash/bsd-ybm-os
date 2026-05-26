"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { Loader2 } from "lucide-react";

import { useI18n } from "@/components/os/system/I18nProvider";

import { useFieldCopilotSession } from "@/hooks/useFieldCopilotSession";

import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";

import {
  canAdvanceFromCaptureStep,
  canAdvanceFromClientStep,
  canAdvanceFromReviewStep,
} from "@/lib/field-copilot/client-step";

import type { WidgetType } from "@/hooks/use-window-manager";

import type { WidgetViewState } from "@/lib/workspace-navigation/types";

import type { FieldCopilotHandoffTarget } from "@/lib/field-copilot/handoff";

import FieldCopilotStepper from "./field-copilot/FieldCopilotStepper";

import FieldCopilotNavBar from "./field-copilot/FieldCopilotNavBar";

import ClientProjectStep from "./field-copilot/steps/ClientProjectStep";

import CaptureStep from "./field-copilot/steps/CaptureStep";

import AnalysisStep from "./field-copilot/steps/AnalysisStep";

import ReviewStep from "./field-copilot/steps/ReviewStep";

import ProduceStep from "./field-copilot/steps/ProduceStep";



export type FieldCopilotWidgetProps = {

  liveData?: Record<string, unknown> | null;

  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;

};



function readString(data: Record<string, unknown> | null | undefined, key: string): string | undefined {

  const v = data?.[key];

  return typeof v === "string" && v.trim() ? v.trim() : undefined;

}



function readNumber(data: Record<string, unknown> | null | undefined, key: string): number | undefined {

  const v = data?.[key];

  return typeof v === "number" && Number.isFinite(v) ? v : undefined;

}



export default function FieldCopilotWidget({ liveData, openWorkspaceWidget }: FieldCopilotWidgetProps) {

  const { t, locale } = useI18n();
  const { status: authStatus } = useSession();

  const initialSessionId = readString(liveData, "sessionId");

  const initialStep = readNumber(liveData, "step") ?? 0;



  const session = useFieldCopilotSession(initialSessionId);

  const [step, setStep] = useState(initialStep);

  const [handoffBusy, setHandoffBusy] = useState(false);

  const bootstrappedRef = useRef(false);



  const applyView = useCallback(

    (view: WidgetViewState) => {

      const sid = typeof view.sessionId === "string" ? view.sessionId : undefined;

      if (sid && sid !== session.draft?.id) void session.loadSession(sid);

      if (typeof view.step === "number") setStep(view.step);

    },

    [session],

  );



  const { pushView } = useSyncedWidgetNavigation(applyView);



  useEffect(() => {
    if (authStatus !== "authenticated") return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    void (async () => {
      try {
        if (initialSessionId) {
          await session.loadSession(initialSessionId);
          return;
        }

        await session.createSession({
          contactId: readString(liveData, "contactId"),
          contactName: readString(liveData, "contactName"),
          projectId: readString(liveData, "projectId"),
          projectName: readString(liveData, "projectName"),
        });
      } catch {
        /* surfaced via session.error */
      }
    })();
  }, [
    authStatus,
    initialSessionId,
    liveData,
    session,
    session.createSession,
    session.loadSession,
  ]);



  const goStep = (next: number) => {

    setStep(next);

    if (session.draft?.id) {

      pushView({ sessionId: session.draft.id, step: next });

    }

  };



  const onUpdate = async (patch: Record<string, unknown>) => {

    await session.patchSession(patch);

  };



  const onAnalyze = async () => {

    await session.analyze(locale);

  };



  const onHandoff = async (target: FieldCopilotHandoffTarget) => {

    setHandoffBusy(true);

    try {

      const docLiveData = await session.handoff(target);

      openWorkspaceWidget?.("docCreator", docLiveData);

    } finally {

      setHandoffBusy(false);

    }

  };



  const hasAnalysis =

    session.draft?.status === "READY" ||

    session.draft?.status === "HANDED_OFF" ||

    Boolean(session.draft?.analysis);



  const canContinue = useMemo(() => {

    if (step === 0) return canAdvanceFromClientStep(session.draft);

    if (step === 1) return canAdvanceFromCaptureStep(session.draft);

    if (step === 2) return hasAnalysis;

    if (step === 3) return canAdvanceFromReviewStep(session.draft);

    return false;

  }, [step, session.draft, hasAnalysis]);



  const showNavContinue = step < 4;

  const showNavBack = step > 0;



  if (authStatus === "loading" || (!session.draft && session.loading)) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center gap-2 text-sm text-[color:var(--foreground-muted)]">
        <Loader2 className="animate-spin" size={20} />
        {t("workspaceWidgets.fieldCopilot.loading")}
      </div>
    );
  }



  return (

    <div className="flex h-full min-h-0 flex-col bg-[color:var(--background-main)]">

      <FieldCopilotStepper current={step} />

      <FieldCopilotNavBar

        showBack={showNavBack}

        showContinue={showNavContinue}

        continueDisabled={!canContinue || session.loading}

        onBack={() => goStep(step - 1)}

        onContinue={() => {

          if (step === 2 && !hasAnalysis) {

            void onAnalyze();

            return;

          }

          goStep(step + 1);

        }}

      />

      {session.error ? (

        <p className="mx-4 mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">

          {session.error}

        </p>

      ) : null}

      {session.driveNotice === "saved" ? (

        <p className="mx-4 mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">

          {t("workspaceWidgets.fieldCopilot.driveSaved")}

        </p>

      ) : null}

      {session.driveNotice === "failed" ? (

        <p className="mx-4 mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">

          {t("workspaceWidgets.fieldCopilot.driveNotSaved")}

        </p>

      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">

        {step === 0 ? <ClientProjectStep draft={session.draft} onUpdate={onUpdate} /> : null}

        {step === 1 ? (

          <CaptureStep

            draft={session.draft}

            onUpdate={onUpdate}

            uploadAsset={session.uploadAsset}

          />

        ) : null}

        {step === 2 ? (

          <AnalysisStep
            loading={session.loading}
            scopeSummary={session.draft?.scopeSummary}
            onAnalyze={() => void onAnalyze()}
          />

        ) : null}

        {step === 3 ? <ReviewStep draft={session.draft} onUpdate={onUpdate} /> : null}

        {step === 4 ? (

          <ProduceStep busy={handoffBusy} onHandoff={(target) => void onHandoff(target)} />

        ) : null}

      </div>

    </div>

  );

}

