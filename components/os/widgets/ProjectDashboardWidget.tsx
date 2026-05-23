"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import {
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Calendar,
  FolderOpen,
  ArrowRight,
  Loader2,
  Scan,
  Settings,
  Upload,
} from "lucide-react";
import ProjectSchedulePanel from "@/components/os/widgets/project/ProjectSchedulePanel";
import { registerWebPush, unregisterWebPush } from "@/lib/push/register-client";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import WidgetState from "@/components/os/WidgetState";
import type { TabId, DashboardData, ProjectListItem, ProjectDashboardWidgetProps } from "./project-dashboard/types";
import { PUSH_KEY, buildGanttLabels } from "./project-dashboard/utils";
import { FinancialTab } from "./project-dashboard/FinancialTab";
import { DiaryTab } from "./project-dashboard/DiaryTab";
import { SettingsTab } from "./project-dashboard/SettingsTab";

const NotebookLMWidget = dynamic(() => import("@/components/os/widgets/NotebookLMWidget"), {
  loading: () => (
    <div className="flex h-40 items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  ),
});

export type { ProjectDashboardWidgetProps };

export default function ProjectDashboardWidget({
  projectId,
  projectName,
  openWorkspaceWidget,
}: ProjectDashboardWidgetProps) {
  const { t, dir } = useI18n();
  const { isCompanyMgmt, industryId } = useTradeProfile();
  const [resolvedId, setResolvedId] = useState(projectId ?? "");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId || projectName));
  const [projectsList, setProjectsList] = useState<ProjectListItem[]>([]);
  const [projectsListLoading, setProjectsListLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("financial");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [uploadingBlueprint, setUploadingBlueprint] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Diary pre-fill from Gantt navigation
  const [diaryInitialDesc, setDiaryInitialDesc] = useState<string | undefined>();
  const [diaryInitialTaskId, setDiaryInitialTaskId] = useState<string | null | undefined>();

  useEffect(() => {
    try { setPushEnabled(localStorage.getItem(PUSH_KEY) === "1"); } catch { setPushEnabled(false); }
  }, []);

  useEffect(() => { if (projectId) setResolvedId(projectId); }, [projectId]);

  const loadDashboard = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}/dashboard`, { credentials: "include" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "dashboard");
    return body as DashboardData;
  }, []);

  const loadProjectsList = useCallback(async () => {
    setProjectsListLoading(true);
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { projects?: ProjectListItem[] };
      if (!res.ok) throw new Error("projects");
      const list = Array.isArray(json.projects) ? json.projects : [];
      setProjectsList(
        list.map((p) => ({ id: String(p.id), name: String(p.name ?? ""), isActive: p.isActive })),
      );
    } catch {
      toast.error(t("projectDashboard.errors.projectsList"));
      setProjectsList([]);
    } finally {
      setProjectsListLoading(false);
    }
  }, [t]);

  const selectProject = useCallback((id: string) => {
    setResolvedId(id);
    setLoading(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      let id = projectId ?? resolvedId;
      if (!id && projectName) {
        const detailRes = await fetch(
          `/api/projects/detail?query=${encodeURIComponent(projectName)}`,
          { credentials: "include" },
        );
        if (!detailRes.ok) throw new Error("detail");
        const detail = await detailRes.json();
        id = detail.id as string;
        setResolvedId(id);
      }
      if (!id) { setData(null); return; }
      setResolvedId(id);
      setData(await loadDashboard(id));
    } catch {
      toast.error(t("projectDashboard.errors.load"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, projectId, projectName, resolvedId, t]);

  const showProjectPicker = !data && !resolvedId && !projectId && !projectName;

  useEffect(() => {
    if (projectId || projectName || resolvedId) { void refresh(); return; }
    setLoading(false);
    setData(null);
    void loadProjectsList();
  }, [projectId, projectName, resolvedId, refresh, loadProjectsList]);

  const togglePush = async () => {
    const next = !pushEnabled;
    if (next) {
      const ok = await registerWebPush();
      if (!ok) { toast.error("התראות Push לא זמינות — בדקו VAPID והרשאות דפדפן"); return; }
    } else {
      await unregisterWebPush().catch(() => undefined);
    }
    setPushEnabled(next);
    try { localStorage.setItem(PUSH_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    toast.message(next ? t("projectDashboard.pushOn") : t("projectDashboard.pushOff"));
  };

  const onBlueprintFile = async (file: File) => {
    if (!resolvedId) return;
    setUploadingBlueprint(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", resolvedId);
      const res = await fetch("/api/projects/analyze-blueprint", {
        method: "POST", credentials: "include", body: fd,
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? t("projectDashboard.errors.blueprint")); return; }
      toast.success(json.message ?? t("projectDashboard.blueprintSuccess"));
      await refresh();
    } catch {
      toast.error(t("projectDashboard.errors.blueprint"));
    } finally {
      setUploadingBlueprint(false);
    }
  };

  useEffect(() => {
    if (isCompanyMgmt && activeTab === "diary") setActiveTab("gantt");
  }, [isCompanyMgmt, activeTab]);

  const clearProjectSelection = useCallback(() => {
    setData(null);
    setResolvedId("");
    void loadProjectsList();
  }, [loadProjectsList]);

  const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = useMemo(() => {
    const all: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
      {
        id: "financial",
        label: isCompanyMgmt
          ? t("projectDashboard.tabs.financialBusiness")
          : t("projectDashboard.tabs.financial"),
        icon: BarChart3,
      },
      { id: "diary", label: t("projectDashboard.tabs.diary"), icon: BookOpen },
      { id: "gantt", label: t("projectDashboard.tabs.gantt"), icon: Calendar },
      { id: "ai", label: t("projectDashboard.tabs.ai"), icon: BookOpen },
      { id: "settings", label: t("projectDashboard.tabs.settings"), icon: Settings },
    ];
    return isCompanyMgmt ? all.filter((tab) => tab.id !== "diary") : all;
  }, [t, isCompanyMgmt]);

  if (showProjectPicker) {
    return (
      <ProjectPickerPanel
        projects={projectsList}
        loading={projectsListLoading}
        onSelect={selectProject}
        titleKey="projectDashboard.pickProjectTitle"
        descKey="projectDashboard.pickProjectDesc"
        loadingKey="projectDashboard.pickProjectLoading"
        emptyKey="projectDashboard.noProjects"
        openCrmKey={openWorkspaceWidget ? "projectDashboard.openCrm" : undefined}
        onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
        statusActiveKey="projectDashboard.statusActive"
        statusInactiveKey="projectDashboard.statusInactive"
      />
    );
  }

  if (!data && !showProjectPicker && (loading || Boolean(resolvedId || projectId || projectName))) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center" dir={dir}>
        <Loader2 className="animate-spin text-amber-500" aria-hidden />
      </div>
    );
  }

  if (!data) {
    return (
      <WidgetState
        variant="empty"
        message={`${t("projectDashboard.emptyTitle")} — ${t("projectDashboard.emptyDesc")}`}
        action={
          <button
            type="button"
            onClick={clearProjectSelection}
            className="rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold hover:bg-[color:var(--surface-elevated)]"
          >
            {t("projectDashboard.pickProjectTitle")}
          </button>
        }
      />
    );
  }

  const apiBase = `/api/projects/${encodeURIComponent(resolvedId)}`;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <header className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">{data.name}</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">
              {data.client ?? t("projectDashboard.noClient")} · {data.status}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={clearProjectSelection}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
            >
              <ArrowRight size={14} aria-hidden />
              {t("projectDashboard.switchProject")}
            </button>
            <button
              type="button"
              onClick={togglePush}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
              title={t("projectDashboard.pushToggle")}
            >
              {pushEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              <span className="sr-only">{t("projectDashboard.pushToggle")}</span>
              {t("projectDashboard.pushToggle")}
            </button>
            <p className="w-full text-[10px] text-[color:var(--foreground-muted)]">
              {t("projectDashboard.pushNote")}
            </p>
            {!isCompanyMgmt ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onBlueprintFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={uploadingBlueprint}
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1 rounded-lg bg-amber-600/90 px-2 py-1 text-xs text-white disabled:opacity-50"
                >
                  {uploadingBlueprint ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {t("projectDashboard.uploadBlueprint")}
                </button>
              </>
            ) : null}
          </div>
        </div>
        {openWorkspaceWidget && resolvedId ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {!isCompanyMgmt ? (
              <button
                type="button"
                onClick={() => openWorkspaceWidget("aiScanner", { projectId: resolvedId, scanMode: "DRAWING_BOQ" })}
                className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
              >
                <Scan size={12} aria-hidden /> סורק AI
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openWorkspaceWidget("notebookLM", { projectId: resolvedId, title: data.name })}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
            >
              <BookOpen size={12} aria-hidden /> מחברת
            </button>
            <button
              type="button"
              onClick={() => openWorkspaceWidget("googleDrive", { projectId: resolvedId })}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
            >
              <FolderOpen size={12} aria-hidden /> Drive
            </button>
            <button
              type="button"
              onClick={() => openWorkspaceWidget("crmTable", null)}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
            >
              CRM
            </button>
          </div>
        ) : null}
        <div className="mt-2 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                  activeTab === tab.id
                    ? "bg-amber-500/20 text-amber-200"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
                }`}
              >
                <Icon size={12} aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === "financial" && (
          <FinancialTab
            data={data}
            apiBase={apiBase}
            isCompanyMgmt={isCompanyMgmt}
            refresh={refresh}
            t={t}
          />
        )}
        {activeTab === "diary" && (
          <DiaryTab
            data={data}
            apiBase={apiBase}
            refresh={refresh}
            t={t}
            initialDesc={diaryInitialDesc}
            initialTaskId={diaryInitialTaskId}
          />
        )}
        {activeTab === "gantt" && (
          <ProjectSchedulePanel
            projectId={resolvedId}
            projectName={data.name}
            clientName={data.client}
            primaryContactId={data.primaryContactId}
            apiBase={apiBase}
            tasks={data.tasks}
            organizationIndustry={industryId}
            hideConstructionFeatures={isCompanyMgmt}
            onRefresh={refresh}
            openWorkspaceWidget={openWorkspaceWidget}
            onOpenBoq={isCompanyMgmt ? undefined : () => setActiveTab("financial")}
            onOpenDiary={
              isCompanyMgmt
                ? undefined
                : (opts) => {
                    setActiveTab("diary");
                    if (opts?.description) setDiaryInitialDesc(opts.description);
                    if (opts?.taskId) setDiaryInitialTaskId(opts.taskId);
                  }
            }
            labels={buildGanttLabels(t)}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab data={data} resolvedId={resolvedId} refresh={refresh} t={t} />
        )}
        {activeTab === "ai" && (
          <div className="h-[min(520px,60vh)] min-h-[280px]">
            <NotebookLMWidget liveData={{ projectId: resolvedId, name: data.name }} />
          </div>
        )}
      </div>
    </div>
  );
}
