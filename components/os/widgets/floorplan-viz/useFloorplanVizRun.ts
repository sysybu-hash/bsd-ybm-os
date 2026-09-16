"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { fileFromDataUrl, uploadPlanToBlob } from "@/components/os/widgets/floorplan-viz/plan-source";
import type { FloorplanVizResult } from "@/lib/projects/floorplan-viz";
import type { FloorplanVizRunSummary } from "@/lib/projects/floorplan-viz-ids";
import { useFloorplanVizStills } from "@/components/os/widgets/floorplan-viz/useFloorplanVizStills";
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
  const [titleDraft, setTitleDraft] = useState("");

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
      const json = (await res.json()) as { runs?: FloorplanVizRunSummary[] };
      if (res.ok && Array.isArray(json.runs)) setRuns(json.runs);
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

  const onFile = useCallback((next: File | null) => {
    setFile(next);
    setResult(null);
    setError(null);
  }, []);

  const applyResult = useCallback((incoming: FloorplanVizResult) => {
    setResult(incoming);
    if (incoming.styleKit) {
      setStyleId(incoming.styleKit.id);
      setCustomKit(incoming.styleKit.id === "custom" ? incoming.styleKit : null);
    }
    if (incoming.scope === "full" || incoming.scope === "overview") setScope(incoming.scope);
  }, []);

  const generate = useCallback(
    async (nextScope: FloorplanVizScope) => {
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
        } else if (file) {
          const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          // Keep the PDF bytes. Rasterizing here used to skip the CAD path
          // and the model invented a different apartment.
          const blobUrl = await uploadPlanToBlob(file);
          if (blobUrl) fd.append("blobUrl", blobUrl);
          else fd.append("file", file);
          if (projectId) fd.append("projectId", projectId);
          fd.append("styleId", styleId);
          fd.append("planKind", isPdf ? "sales-sheet" : "auto");
          fd.append("scope", nextScope);
          if (customKit) fd.append("styleKit", JSON.stringify(customKit));
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
    [applyResult, customKit, file, projectId, refreshRuns, result, styleId, t],
  );

  const openRun = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(id)}`, {
          credentials: "include",
        });
        const json = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.loadFailed"));
          return;
        }
        const incoming = json as unknown as FloorplanVizResult & { sourceFileName?: string };
        applyResult(incoming);
        if (incoming.planBase64 && incoming.planMimeType) {
          const incomingPdf =
            incoming.planMimeType === "application/pdf" || incoming.planBase64.startsWith("JVBERi");
          setFile((prev) => {
            if (
              !incomingPdf &&
              prev &&
              (prev.type === "application/pdf" || /\.pdf$/i.test(prev.name))
            ) {
              return prev;
            }
            return fileFromDataUrl(
              `data:${incoming.planMimeType};base64,${incoming.planBase64}`,
              incoming.sourceFileName || incoming.title || (incomingPdf ? "plan.pdf" : "plan.jpg"),
            );
          });
        }
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [applyResult, t],
  );

  const deleteRun = useCallback(
    async (id: string) => {
      if (!window.confirm(t("workspaceWidgets.floorplanViz.deleteRunConfirm"))) return;
      const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error(t("workspaceWidgets.floorplanViz.deleteFailed"));
        return;
      }
      if (result?.runId === id) {
        setResult(null);
        setFile(null);
      }
      toast.success(t("workspaceWidgets.floorplanViz.deleted"));
      void refreshRuns();
    },
    [refreshRuns, result?.runId, t],
  );

  const renameRun = useCallback(async () => {
    if (!result?.runId) return;
    const title = titleDraft.trim();
    if (!title || title === result.title) return;
    const res = await fetch(`/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      toast.error(t("workspaceWidgets.floorplanViz.renameFailed"));
      return;
    }
    setResult({ ...result, title });
    void refreshRuns();
  }, [refreshRuns, result, t, titleDraft]);

  const { editingKey, editStill, improveStill, rescanStill, selectStill, deleteStill } =
    useFloorplanVizStills({ result, setResult, refreshRuns, t });

  const pendingJobs = result ? listFloorplanVizJobs(result.layout, "rooms", result.images) : [];
  const pendingCount = pendingJobs.length;

  return {
    file,
    setFile,
    onFile,
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
    pendingCount,
  };
}
