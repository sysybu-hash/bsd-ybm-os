"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  PLAN_DIRECT_UPLOAD_MAX_BYTES,
  planExceedsUploadLimit,
  stagePlanFile,
  type StagedPlanRef,
} from "@/components/os/widgets/floorplan-viz/plan-source";
import type { ConfirmedRunFields } from "@/components/os/widgets/floorplan-viz/useFloorplanVizRun";
import {
  structureReportSchema,
  type IdentifiedPlan,
  type StructureKind,
  type StructureReport,
} from "@/lib/validation/schemas/floorplan-structure";

type TFn = (key: string, vars?: Record<string, string>) => string;

export type WizardStep = "upload" | "identify" | "options" | "result";

/** The plan to offer first: the largest floor the walls close, not blocked. */
export function defaultPlanId(report: StructureReport): string | null {
  const open = report.plans.filter((p) => p.kind === "floor" && !p.blocked);
  if (!open.length) return null;
  return open.reduce((a: IdentifiedPlan, b) => ((b.closedM2 ?? 0) > (a.closedM2 ?? 0) ? b : a)).id;
}

/**
 * The window's steps: upload, identify, choose, produce. The file is read on
 * the server for free before anything is offered; the person confirms what it
 * is (or picks it, when the server is not sure) and which plan to draw, and
 * only then are the options for that structure shown.
 */
export function useVizWizard({
  t,
  prepareDwf,
  dwfStaged,
}: {
  t: TFn;
  /** Cuts a DWF's drawing out and reads its flats (useDwfBuilding.prepare); other files pass through. */
  prepareDwf: (file: File | null) => Promise<File | null>;
  /** The strip's upload prepareDwf made, if it made one (useDwfBuilding.currentStaged). */
  dwfStaged: () => StagedPlanRef | null;
}) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [report, setReport] = useState<StructureReport | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [staged, setStaged] = useState<StagedPlanRef | null>(null);
  const [structure, setStructure] = useState<StructureKind | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFiles([]);
    setReport(null);
    setFingerprint("");
    setStaged(null);
    setStructure(null);
    setPlanId(null);
  }, []);

  /** Upload the chosen files and read them; answers the file the run should carry. */
  const identify = useCallback(
    async (chosen: File[]): Promise<File | null> => {
      reset();
      if (chosen.length === 0) return null;
      setIdentifying(true);
      try {
        // A permit strip's drawing is cut out in the browser (its flats are read too).
        const first = chosen.length === 1 ? await prepareDwf(chosen[0]!) : chosen[0]!;
        if (!first) return null;
        const list = chosen.length === 1 ? [first] : chosen;
        const form = new FormData();
        let ref: StagedPlanRef | null = null;
        for (const file of list) {
          if (planExceedsUploadLimit(file)) {
            toast.error(t("workspaceWidgets.floorplanViz.planTooLarge"));
            return null;
          }
          const strip = list.length === 1 ? dwfStaged() : null;
          if (strip) {
            ref = strip;
          } else if (file.size > PLAN_DIRECT_UPLOAD_MAX_BYTES) {
            const one = await stagePlanFile(file);
            if (!one) {
              toast.error(t("workspaceWidgets.floorplanViz.planStorageUnavailable"));
              return null;
            }
            if (list.length === 1) ref = one;
            if (one.blobUrl) form.append("blobUrl", one.blobUrl);
            if (one.uploadId) form.append("uploadId", one.uploadId);
            continue;
          }
          if (ref) {
            if (ref.blobUrl) form.append("blobUrl", ref.blobUrl);
            if (ref.uploadId) form.append("uploadId", ref.uploadId);
          } else {
            form.append("file", file);
          }
        }
        const res = await fetch("/api/projects/visualize-floorplan/identify", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        const json = (await res.json().catch(() => null)) as { report?: unknown; fingerprint?: string; error?: string } | null;
        const parsed = structureReportSchema.safeParse(json?.report);
        if (!res.ok || !parsed.success) {
          toast.error(json?.error ?? t("workspaceWidgets.floorplanViz.wizard.identifyFailed"));
          return null;
        }
        setFiles(list);
        setStaged(ref);
        setReport(parsed.data);
        setFingerprint(json?.fingerprint ?? "");
        setStructure(parsed.data.sure ? parsed.data.structure : parsed.data.structure === "unknown" ? null : parsed.data.structure);
        setPlanId(defaultPlanId(parsed.data));
        setStep("identify");
        return first;
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.wizard.identifyFailed"));
        return null;
      } finally {
        setIdentifying(false);
      }
    },
    [dwfStaged, prepareDwf, reset, t],
  );

  /** What a run of this choice carries: the upload, and the confirmed structure and plan. */
  const runFields = useCallback((): ConfirmedRunFields => {
    if (!structure) return {};
    return {
      staged,
      fields: {
        structure,
        ...(planId && structure !== "building" ? { planRef: planId } : {}),
        ...(fingerprint ? { structureFingerprint: fingerprint } : {}),
      },
    };
  }, [fingerprint, planId, staged, structure]);

  const canContinue =
    report != null &&
    report.blockers.length === 0 &&
    structure != null &&
    (structure === "building" || structure === "house" || structure === "site" || planId != null || report.plans.length === 0);

  return {
    step,
    setStep,
    files,
    identifying,
    report,
    structure,
    setStructure,
    planId,
    setPlanId,
    canContinue,
    identify,
    runFields,
    reset,
  };
}
