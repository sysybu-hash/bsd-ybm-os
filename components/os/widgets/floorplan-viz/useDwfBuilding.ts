"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { extractW2dFromDwf, isDwfFileName } from "@/components/os/widgets/floorplan-viz/dwf-extract";
import {
  planExceedsUploadLimit,
  stagePlanFile,
  type StagedPlanRef,
} from "@/components/os/widgets/floorplan-viz/plan-source";
import type { DwfBuildingUnit } from "@/lib/projects/dwf-building";

type TFn = (key: string, vars?: Record<string, string>) => string;

/** How a unit is keyed in the picker: "7", or "34/upper" for a duplex's upper floor. */
export function dwfUnitKey(unit: DwfBuildingUnit): string {
  return unit.level ? `${unit.unit}/${unit.level}` : String(unit.unit);
}

/**
 * A permit strip (DWF) chosen for a run.
 *
 * The strip draws a building, so a run needs an apartment as well as the file.
 * On choosing one, its drawing is cut out of the package in the browser,
 * uploaded to Blob, and read on the server for the apartments it draws. The
 * run reads the same upload and deletes it when done, so a second run uploads
 * the drawing again.
 */
export function useDwfBuilding(t: TFn) {
  const [drawing, setDrawing] = useState<File | null>(null);
  const [units, setUnits] = useState<DwfBuildingUnit[]>([]);
  const [choice, setChoice] = useState("");
  const [staged, setStagedState] = useState<StagedPlanRef | null>(null);
  // Read right after prepare resolves, before the state has rendered.
  const stagedNow = useRef<StagedPlanRef | null>(null);
  const setStaged = useCallback((ref: StagedPlanRef | null) => {
    stagedNow.current = ref;
    setStagedState(ref);
  }, []);
  const [reading, setReading] = useState(false);

  const reset = useCallback(() => {
    setDrawing(null);
    setUnits([]);
    setChoice("");
    setStaged(null);
  }, [setStaged]);

  /**
   * Take a chosen file. Answers the file the run should carry — the drawing
   * cut out of a DWF, or the file itself when it is not one — or null when a
   * DWF could not be read.
   */
  const prepare = useCallback(
    async (file: File | null): Promise<File | null> => {
      reset();
      if (!file || !isDwfFileName(file.name)) return file;
      setReading(true);
      try {
        const cut = await extractW2dFromDwf(file);
        if (!cut) {
          toast.error(t("workspaceWidgets.floorplanViz.dwfUnreadable"));
          return null;
        }
        const stagedRef = await stagePlanFile(cut, { always: true });
        if (!stagedRef) {
          toast.error(
            t(
              planExceedsUploadLimit(cut)
                ? "workspaceWidgets.floorplanViz.planTooLarge"
                : "workspaceWidgets.floorplanViz.dwfNeedsStorage",
            ),
          );
          return null;
        }
        const res = await fetch("/api/projects/visualize-floorplan/dwf-units", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stagedRef),
        });
        const json = (await res.json()) as { units?: DwfBuildingUnit[]; error?: string };
        if (!res.ok || !Array.isArray(json.units) || json.units.length === 0) {
          toast.error(json.error ?? t("workspaceWidgets.floorplanViz.dwfUnreadable"));
          return null;
        }
        setDrawing(cut);
        setUnits(json.units);
        setStaged(stagedRef);
        return cut;
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.dwfUnreadable"));
        return null;
      } finally {
        setReading(false);
      }
    },
    [reset, setStaged, t],
  );

  /** The run's fields: the upload (again, if the last run used it up) and the apartment. */
  const runFields = useCallback(async (): Promise<Record<string, string> | null> => {
    if (!drawing) return null;
    const picked = units.find((u) => dwfUnitKey(u) === choice);
    if (!picked) {
      toast.error(t("workspaceWidgets.floorplanViz.dwfNeedUnit"));
      return null;
    }
    const ref = staged ?? (await stagePlanFile(drawing, { always: true }));
    if (!ref) {
      toast.error(
        t(
          planExceedsUploadLimit(drawing)
            ? "workspaceWidgets.floorplanViz.planTooLarge"
            : "workspaceWidgets.floorplanViz.dwfNeedsStorage",
        ),
      );
      return null;
    }
    // The run deletes the upload once it has its own copy.
    setStaged(null);
    return {
      ...(ref.blobUrl ? { blobUrl: ref.blobUrl } : {}),
      ...(ref.uploadId ? { uploadId: ref.uploadId } : {}),
      unit: String(picked.unit),
      ...(picked.level ? { level: picked.level } : {}),
    };
  }, [staged, setStaged, choice, drawing, t, units]);

  /** The strip's upload as prepare left it, readable before the next render. */
  const currentStaged = useCallback(() => stagedNow.current, []);

  return { isDwf: drawing !== null, drawing, units, choice, setChoice, currentStaged, reading, prepare, runFields, reset };
}
