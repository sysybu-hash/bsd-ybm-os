"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  fileFromDataUrl,
  PLAN_DIRECT_UPLOAD_MAX_BYTES,
  planExceedsUploadLimit,
  stagePlanFile,
  type StagedPlanRef,
} from "@/components/os/widgets/floorplan-viz/plan-source";
import type { FloorplanVizResult } from "@/lib/projects/floorplan-viz";
import type { FloorplanVizRunSummary } from "@/lib/projects/floorplan-viz-ids";
import { useFloorplanVizStills } from "@/components/os/widgets/floorplan-viz/useFloorplanVizStills";
import { useDwfBuilding } from "@/components/os/widgets/floorplan-viz/useDwfBuilding";
import { useFloorplanVizLibrary } from "@/components/os/widgets/floorplan-viz/useFloorplanVizLibrary";
import {
  listFloorplanVizJobs,
  type FloorplanVizScope,
} from "@/lib/projects/floorplan-viz-scope";
import {
  DEFAULT_FLOORPLAN_VIZ_STYLE_ID,
  type FloorplanVizStyleId,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";

type TFn = (key: string, vars?: Record<string, string>) => string;

type ProjectListItem = { id: string; name: string };

export type VizAccess = { subscriber: boolean; paint: boolean; contactEmail: string };

/**
 * What the identify step adds to a run: the plan already uploaded (so it is
 * not uploaded twice) and the structure and plan the person confirmed.
 */
export type ConfirmedRunFields = {
  staged?: StagedPlanRef | null;
  fields?: Record<string, string>;
};

/**
 * A floor-plan run and everything that can be done to it: upload, generate,
 * reopen, rename, delete, and the five edits an operator can ask of one still.
 * Split out of the widget so the widget is the screen and this is the work.
 */
export function useFloorplanVizRun({
  liveData,
  t,
}: {
  liveData?: Record<string, unknown> | null;
  t: TFn;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [projectId, setProjectId] = useState(
    typeof liveData?.projectId === "string" ? liveData.projectId : "",
  );
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FloorplanVizResult | null>(null);
  const [styleId, setStyleId] = useState<FloorplanVizStyleId>(DEFAULT_FLOORPLAN_VIZ_STYLE_ID);
  const [customKit, setCustomKit] = useState<FloorplanVizStyleKit | null>(null);
  const [scope, setScope] = useState<FloorplanVizScope>("overview");
  const [runs, setRuns] = useState<FloorplanVizRunSummary[]>([]);
  const [access, setAccess] = useState<VizAccess | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const dwf = useDwfBuilding(t);
  const prepareDwf = dwf.prepare;

  useEffect(() => {
    if (typeof liveData?.projectId === "string") setProjectId(liveData.projectId);
  }, [liveData?.projectId]);

  // Opened from the scanner: the sheet arrives as a data URL, so the widget
  // starts with the same bytes the scan read rather than asking for them again.
  useEffect(() => {
    const dataUrl = typeof liveData?.planDataUrl === "string" ? liveData.planDataUrl : "";
    if (!dataUrl) return;
    const name = typeof liveData?.planFileName === "string" ? liveData.planFileName : "plan.pdf";
    setFile(fileFromDataUrl(dataUrl, name));
    setResult(null);
    setError(null);
  }, [liveData?.planDataUrl, liveData?.planFileName]);

  const refreshRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/visualize-floorplan", { credentials: "include" });
      const json = (await res.json()) as { runs?: FloorplanVizRunSummary[]; access?: VizAccess };
      if (res.ok && Array.isArray(json.runs)) setRuns(json.runs);
      if (res.ok && json.access) setAccess(json.access);
    } catch {
      /* library is optional if list fails */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/projects", { credentials: "include" });
        const json = (await res.json()) as { projects?: ProjectListItem[] };
        if (!cancelled) setProjects(Array.isArray(json.projects) ? json.projects : []);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    void refreshRuns();
    return () => {
      cancelled = true;
    };
  }, [refreshRuns]);

  useEffect(() => {
    setTitleDraft(result?.title ?? "");
  }, [result?.title, result?.runId]);

  const onFile = useCallback(
    (next: File | null) => {
      setFile(null);
      setResult(null);
      setError(null);
      // A permit strip becomes its drawing, once its apartments are read.
      void prepareDwf(next).then(setFile);
    },
    [prepareDwf],
  );

  const applyResult = useCallback((incoming: FloorplanVizResult) => {
    setResult(incoming);
    if (incoming.styleKit) {
      setStyleId(incoming.styleKit.id);
      setCustomKit(incoming.styleKit.id === "custom" ? incoming.styleKit : null);
    }
    if (incoming.scope === "full" || incoming.scope === "overview") setScope(incoming.scope);
  }, []);

  const generate = useCallback(
    async (
      nextScope: FloorplanVizScope,
      renderMode: "render3d" | "finish" = "render3d",
      confirmed?: ConfirmedRunFields,
    ) => {
      const appending = Boolean(result?.runId);
      if (!appending && !file) {
        toast.error(t("workspaceWidgets.floorplanViz.needFile"));
        return;
      }
      if (!appending && styleId === "custom" && !customKit) {
        toast.error(t("workspaceWidgets.floorplanViz.styleKitFailed"));
        return;
      }
      setLoading(true);
      setError(null);
      if (!appending) setResult(null);
      try {
        const fd = new FormData();
        if (appending && result?.runId) {
          fd.append("runId", result.runId);
          fd.append("scope", nextScope);
          fd.append("renderMode", renderMode);
        } else if (file) {
          const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          const dwfFields = dwf.isDwf ? await dwf.runFields() : null;
          if (dwf.isDwf && !dwfFields) return;
          if (dwfFields) {
            for (const [key, value] of Object.entries(dwfFields)) fd.append(key, value);
          } else {
            // Keep the PDF bytes. Rasterizing here used to skip the CAD path
            // and the model invented a different apartment.
            if (planExceedsUploadLimit(file)) {
              const message = t("workspaceWidgets.floorplanViz.planTooLarge");
              setError(message);
              toast.error(message);
              return;
            }
            const staged = confirmed?.staged ?? (await stagePlanFile(file));
            if (staged?.blobUrl) fd.append("blobUrl", staged.blobUrl);
            else if (staged?.uploadId) fd.append("uploadId", staged.uploadId);
            else if (file.size <= PLAN_DIRECT_UPLOAD_MAX_BYTES) fd.append("file", file);
            else {
              const message = t("workspaceWidgets.floorplanViz.planStorageUnavailable");
              setError(message);
              toast.error(message);
              return;
            }
          }
          if (projectId) fd.append("projectId", projectId);
          fd.append("styleId", styleId);
          fd.append("planKind", isPdf ? "sales-sheet" : "auto");
          fd.append("scope", nextScope);
          fd.append("renderMode", renderMode);
          if (customKit) fd.append("styleKit", JSON.stringify(customKit));
          for (const [key, value] of Object.entries(confirmed?.fields ?? {})) fd.append(key, value);
        }
        const res = await fetch("/api/projects/visualize-floorplan", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          const message = typeof json.error === "string" ? json.error : t("projectDashboard.errors.viz");
          setError(message);
          toast.error(message);
          return;
        }
        const incoming = json as unknown as FloorplanVizResult;
        applyResult(incoming);
        if (incoming.runId) {
          toast.success(
            appending
              ? t("workspaceWidgets.floorplanViz.attemptSaved")
              : t("workspaceWidgets.floorplanViz.savedToOrg"),
          );
        }
        void refreshRuns();
      } catch {
        const message = t("projectDashboard.errors.viz");
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [applyResult, customKit, dwf, file, projectId, refreshRuns, result, styleId, t],
  );

  const { openRun, deleteRun, renameRun, saveRooms } = useFloorplanVizLibrary({
    t,
    result,
    setResult,
    setFile,
    setLoading,
    setError,
    applyResult,
    refreshRuns,
    titleDraft,
  });

  const { editingKey, editStill, improveStill, rescanStill, selectStill, deleteStill, dismissIssue } =
    useFloorplanVizStills({ result, setResult, refreshRuns, t });

  const pendingJobs = result ? listFloorplanVizJobs(result.layout, "rooms", result.images) : [];
  const pendingCount = pendingJobs.length;

  return {
    file,
    setFile,
    onFile,
    dwf,
    projectId,
    setProjectId,
    projects,
    loading,
    error,
    setError,
    result,
    setResult,
    styleId,
    setStyleId,
    customKit,
    setCustomKit,
    scope,
    setScope,
    runs,
    access,
    editingKey,
    titleDraft,
    setTitleDraft,
    fileRef,
    refreshRuns,
    generate,
    openRun,
    deleteRun,
    renameRun,
    editStill,
    improveStill,
    rescanStill,
    selectStill,
    deleteStill,
    dismissIssue,
    saveRooms,
    pendingCount,
  };
}
