"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Layers, Plus, Upload, View } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import FloorplanVizLibrary from "@/components/os/widgets/floorplan-viz/FloorplanVizLibrary";
import FloorplanVizResults from "@/components/os/widgets/floorplan-viz/FloorplanVizResults";
import FloorplanVizStylePicker from "@/components/os/widgets/floorplan-viz/FloorplanVizStylePicker";
import { fileFromDataUrl } from "@/components/os/widgets/floorplan-viz/plan-source";
import type { FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import type { FloorplanVizEditRegion } from "@/lib/projects/floorplan-viz-edit-region";
import type { FloorplanVizResult } from "@/lib/projects/floorplan-viz";
import { floorplanVizViewKey, type FloorplanVizRunSummary } from "@/lib/projects/floorplan-viz-ids";
import {
  listFloorplanVizJobs,
  type FloorplanVizScope,
} from "@/lib/projects/floorplan-viz-scope";
import {
  DEFAULT_FLOORPLAN_VIZ_STYLE_ID,
  type FloorplanVizStyleId,
  type FloorplanVizStyleKit,
} from "@/lib/projects/floorplan-viz-styles";
import { OsButton } from "@/components/os/ui";

type ProjectListItem = { id: string; name: string };

function stillKey(img: FloorplanVizImage): string {
  return img.id ?? floorplanVizViewKey(img.viewId, img.roomName);
}

export type FloorplanVizWidgetProps = {
  liveData?: Record<string, unknown> | null;
};

export default function FloorplanVizWidget({ liveData }: FloorplanVizWidgetProps) {
  const { t } = useI18n();
  const { isCompanyMgmt } = useTradeProfile();
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
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    if (typeof liveData?.projectId === "string") setProjectId(liveData.projectId);
  }, [liveData?.projectId]);

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
          fd.append("file", file);
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

  const editStill = useCallback(
    async (img: FloorplanVizImage, instruction: string, region?: FloorplanVizEditRegion) => {
      if (!result?.runId || !img.id) {
        toast.error(t("workspaceWidgets.floorplanViz.editNeedSave"));
        return;
      }
      const key = stillKey(img);
      setEditingKey(key);
      try {
        const res = await fetch(
          `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instruction, ...(region ? { region } : {}) }),
          },
        );
        const json = (await res.json()) as { image?: FloorplanVizImage; images?: FloorplanVizImage[]; error?: string };
        if (!res.ok || !json.image) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.editFailed"));
          return;
        }
        setResult({
          ...result,
          images: json.images ?? result.images.map((row) => (row.id === img.id ? json.image! : row)),
        });
        toast.success(t("workspaceWidgets.floorplanViz.edited"));
        void refreshRuns();
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.editFailed"));
      } finally {
        setEditingKey(null);
      }
    },
    [refreshRuns, result, t],
  );

  const improveStill = useCallback(
    async (img: FloorplanVizImage, failures: string[] = []) => {
      if (!result?.runId || !img.id) {
        toast.error(t("workspaceWidgets.floorplanViz.editNeedSave"));
        return;
      }
      const key = stillKey(img);
      setEditingKey(key);
      try {
        const res = await fetch(
          `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              improve: true,
              ...(failures.length ? { failures } : {}),
            }),
          },
        );
        const json = (await res.json()) as { image?: FloorplanVizImage; images?: FloorplanVizImage[]; error?: string };
        if (!res.ok || !json.image) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.improveFailed"));
          return;
        }
        setResult({
          ...result,
          images: json.images ?? result.images.map((row) => (row.id === img.id ? json.image! : row)),
        });
        toast.success(t("workspaceWidgets.floorplanViz.improved"));
        void refreshRuns();
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.improveFailed"));
      } finally {
        setEditingKey(null);
      }
    },
    [refreshRuns, result, t],
  );

  const rescanStill = useCallback(
    async (img: FloorplanVizImage) => {
      if (!result?.runId || !img.id) {
        toast.error(t("workspaceWidgets.floorplanViz.editNeedSave"));
        return;
      }
      const key = stillKey(img);
      setEditingKey(key);
      try {
        const res = await fetch(
          `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rescan: true }),
          },
        );
        const json = (await res.json()) as {
          image?: FloorplanVizImage;
          images?: FloorplanVizImage[];
          auditIssues?: string[];
          error?: string;
        };
        if (!res.ok || !json.image) {
          toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.rescanFailed"));
          return;
        }
        setResult({
          ...result,
          images: json.images ?? result.images.map((row) => (row.id === img.id ? json.image! : row)),
        });
        const n = json.auditIssues?.length ?? json.image.auditIssues?.length ?? 0;
        toast.success(
          n > 0
            ? t("workspaceWidgets.floorplanViz.rescannedWithIssues", { n: String(n) })
            : t("workspaceWidgets.floorplanViz.rescannedClean"),
        );
      } catch {
        toast.error(t("workspaceWidgets.floorplanViz.rescanFailed"));
      } finally {
        setEditingKey(null);
      }
    },
    [result, t],
  );

  const selectStill = useCallback(
    async (img: FloorplanVizImage) => {
      if (!result?.runId || !img.id) return;
      const res = await fetch(
        `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected: true }),
        },
      );
      const json = (await res.json()) as { images?: FloorplanVizImage[]; error?: string };
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : t("workspaceWidgets.floorplanViz.editFailed"));
        return;
      }
      if (json.images) setResult({ ...result, images: json.images });
      toast.success(t("workspaceWidgets.floorplanViz.chosenAttempt"));
      void refreshRuns();
    },
    [refreshRuns, result, t],
  );

  const deleteStill = useCallback(
    async (img: FloorplanVizImage) => {
      if (!result?.runId || !img.id) return;
      if (!window.confirm(t("workspaceWidgets.floorplanViz.deleteImageConfirm"))) return;
      const res = await fetch(
        `/api/projects/visualize-floorplan/${encodeURIComponent(result.runId)}/stills/${encodeURIComponent(img.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        toast.error(t("workspaceWidgets.floorplanViz.deleteFailed"));
        return;
      }
      setResult({
        ...result,
        images: result.images.filter((row) => row.id !== img.id),
      });
      toast.success(t("workspaceWidgets.floorplanViz.deleted"));
      void refreshRuns();
    },
    [refreshRuns, result, t],
  );

  const pendingJobs = result ? listFloorplanVizJobs(result.layout, "rooms", result.images) : [];
  const pendingCount = pendingJobs.length;

  if (isCompanyMgmt) {
    return (
      <p className="p-6 text-sm text-[color:var(--foreground-muted)]">
        {t("workspaceWidgets.floorplanViz.constructionOnly")}
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" dir="rtl">
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Box size={16} className="text-violet-600" aria-hidden />
          <div className="min-w-0 flex-1">
            {result?.runId ? (
              <input
                className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm font-bold hover:border-[color:var(--border-main)] focus:border-[color:var(--border-main)]"
                value={titleDraft}
                aria-label={t("workspaceWidgets.floorplanViz.rename")}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void renameRun()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <h2 className="text-sm font-bold">{t("workspaceWidgets.titles.floorplanViz")}</h2>
            )}
            {!result ? (
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.floorplanViz.subtitle")}
              </p>
            ) : null}
          </div>
          {projects.length > 0 ? (
            <label className="text-[10px] text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.floorplanViz.project")}
              <select
                className="ms-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">{t("workspaceWidgets.floorplanViz.noProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <OsButton
            variant="quiet"
            size="sm"
            icon={<Plus size={12} aria-hidden />}
            onClick={() => {
              setResult(null);
              setFile(null);
              setError(null);
            }}
          >
            {t("workspaceWidgets.floorplanViz.newRun")}
          </OsButton>
          <OsButton
            variant="secondary"
            size="sm"
            icon={<Upload size={12} aria-hidden />}
            onClick={() => fileRef.current?.click()}
          >
            {file ? file.name : t("workspaceWidgets.floorplanViz.upload")}
          </OsButton>
          <OsButton
            variant="primary"
            size="sm"
            loading={loading && pendingCount === 0}
            disabled={(!file && !result?.runId) || loading}
            onClick={() => void generate(scope)}
          >
            {scope === "full"
              ? t("workspaceWidgets.floorplanViz.generateFull")
              : t("workspaceWidgets.floorplanViz.generateOverview")}
          </OsButton>
        </div>
      </div>
      <div data-widget-scroll-pane className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 space-y-4">
          <section className="rounded-xl border border-[color:var(--border-main)] p-3">
            <p className="mb-2 text-[11px] font-semibold">{t("workspaceWidgets.floorplanViz.library")}</p>
            <FloorplanVizLibrary
              t={t}
              runs={runs}
              activeRunId={result?.runId}
              disabled={loading}
              onOpen={(id) => void openRun(id)}
              onDelete={(id) => void deleteRun(id)}
            />
          </section>
          <div role="radiogroup" aria-label={t("workspaceWidgets.floorplanViz.scopeLabel")} className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              role="radio"
              aria-checked={scope === "overview"}
              disabled={loading}
              onClick={() => setScope("overview")}
              className={`rounded-xl border px-3 py-2 text-start ${
                scope === "overview"
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <View size={14} aria-hidden />
                {t("workspaceWidgets.floorplanViz.scopeOverview")}
              </span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.floorplanViz.scopeOverviewHint")}
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "full"}
              disabled={loading}
              onClick={() => setScope("full")}
              className={`rounded-xl border px-3 py-2 text-start ${
                scope === "full"
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <Layers size={14} aria-hidden />
                {t("workspaceWidgets.floorplanViz.scopeFull")}
              </span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.floorplanViz.scopeFullHint")}
              </span>
            </button>
          </div>
          <FloorplanVizStylePicker
            t={t}
            styleId={styleId}
            onStyleId={setStyleId}
            customKit={customKit}
            onCustomKit={setCustomKit}
            disabled={loading}
          />
        </div>
        {!file && !result && !loading ? (
          <p className="py-10 text-center text-sm text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.floorplanViz.empty")}
          </p>
        ) : (
          <FloorplanVizResults
            t={t}
            loading={loading}
            error={error}
            layout={result?.layout ?? null}
            images={result?.images ?? []}
            enginesUsed={result?.enginesUsed ?? []}
            ocrEngines={result?.ocrEngines ?? []}
            visionEngines={result?.visionEngines ?? []}
            projectId={projectId || undefined}
            projectName={projects.find((p) => p.id === projectId)?.name}
            unitTitle={result?.title}
            sourceFile={file}
            styleKit={result?.styleKit ?? customKit}
            pendingRooms={pendingCount}
            onGenerateRooms={pendingCount > 0 ? () => void generate("rooms") : undefined}
            loadingLabel={
              scope === "full"
                ? t("projectDashboard.vizGenerating")
                : t("workspaceWidgets.floorplanViz.generatingOverview")
            }
            runId={result?.runId}
            editingKey={editingKey}
            onEditStill={(img, instruction, region) => void editStill(img, instruction, region)}
            onImproveStill={(img, failures) => void improveStill(img, failures)}
            onRescanStill={(img) => void rescanStill(img)}
            onDeleteStill={(img) => void deleteStill(img)}
            onSelectStill={(img) => void selectStill(img)}
          />
        )}
      </div>
    </div>
  );
}
