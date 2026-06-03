"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BarChart3, BookOpen, Calendar, Settings } from "lucide-react";
import { registerWebPush, unregisterWebPush } from "@/lib/push/register-client";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import type { TabId, DashboardData, ProjectListItem, ProjectDashboardWidgetProps } from "./types";
import { PUSH_KEY } from "./utils";

export function useProjectDashboard({ projectId, projectName, openWorkspaceWidget }: ProjectDashboardWidgetProps) {
  const { t, dir } = useI18n();
  const { isCompanyMgmt, industryId, features } = useTradeProfile();
  const [resolvedId, setResolvedId] = useState(projectId ?? "");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId || projectName));
  const [projectsList, setProjectsList] = useState<ProjectListItem[]>([]);
  const [projectsListLoading, setProjectsListLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("financial");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [uploadingBlueprint, setUploadingBlueprint] = useState(false);
  const [blueprintPreview, setBlueprintPreview] = useState<import("@/lib/projects/blueprint-analysis-schema").BlueprintAnalysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [diaryInitialDesc, setDiaryInitialDesc] = useState<string | undefined>();
  const [diaryInitialTaskId, setDiaryInitialTaskId] = useState<string | null | undefined>();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration("/sw.js")
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        const active = Boolean(sub);
        setPushEnabled(active);
        try { localStorage.setItem(PUSH_KEY, active ? "1" : "0"); } catch { /* ignore */ }
      })
      .catch(() => {
        try { setPushEnabled(localStorage.getItem(PUSH_KEY) === "1"); } catch { /* ignore */ }
      });
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
      setProjectsList(list.map((p) => ({ id: String(p.id), name: String(p.name ?? ""), isActive: p.isActive })));
    } catch {
      toast.error(t("projectDashboard.errors.projectsList"));
      setProjectsList([]);
    } finally {
      setProjectsListLoading(false);
    }
  }, [t]);

  const selectProject = useCallback((id: string) => { setResolvedId(id); setLoading(true); }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      let id = projectId ?? resolvedId;
      if (!id && projectName) {
        const detailRes = await fetch(`/api/projects/detail?query=${encodeURIComponent(projectName)}`, { credentials: "include" });
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
      if (!ok) { toast.error(t("workspaceWidgets.projectDashboard.pushNotAvailable")); return; }
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
      fd.append("preview", "true");
      const res = await fetch("/api/projects/analyze-blueprint", { method: "POST", credentials: "include", body: fd });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? t("projectDashboard.errors.blueprint")); return; }
      setBlueprintPreview(json as import("@/lib/projects/blueprint-analysis-schema").BlueprintAnalysis);
    } catch {
      toast.error(t("projectDashboard.errors.blueprint"));
    } finally {
      setUploadingBlueprint(false);
    }
  };

  const confirmBlueprintImport = async (selected: import("@/lib/projects/blueprint-analysis-schema").BlueprintAnalysis) => {
    if (!resolvedId) return;
    const res = await fetch("/api/projects/analyze-blueprint", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: resolvedId, ...selected }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? t("projectDashboard.errors.blueprint"));
      return;
    }
    const parts: string[] = [];
    if ((json.tasksCreated as number) > 0) parts.push(`${json.tasksCreated as number} משימות`);
    if ((json.milestonesCreated as number) > 0) parts.push(`${json.milestonesCreated as number} אבני דרך`);
    if ((json.boqItemsCreated as number) > 0) parts.push(`${json.boqItemsCreated as number} סעיפי BOQ`);
    toast.success(parts.length > 0 ? `יובאו: ${parts.join(", ")}` : (json.message as string ?? t("projectDashboard.blueprintSuccess")));
    setBlueprintPreview(null);
    await refresh();
  };

  useEffect(() => {
    if (isCompanyMgmt && activeTab === "diary") setActiveTab("gantt");
  }, [isCompanyMgmt, activeTab]);

  const clearProjectSelection = useCallback(() => {
    setData(null);
    setResolvedId("");
    void loadProjectsList();
  }, [loadProjectsList]);

  const resetWorkspace = useCallback(() => {
    setActiveTab("financial");
    setDiaryInitialDesc(undefined);
    setDiaryInitialTaskId(undefined);
    toast.success(t("projectDashboard.resetWorkspaceDone"));
  }, [t]);

  const tabs = useMemo(() => {
    const all: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
      { id: "financial", label: isCompanyMgmt ? t("projectDashboard.tabs.financialBusiness") : t("projectDashboard.tabs.financial"), icon: BarChart3 },
      { id: "diary", label: t("projectDashboard.tabs.diary"), icon: BookOpen },
      { id: "gantt", label: t("projectDashboard.tabs.gantt"), icon: Calendar },
      { id: "ai", label: t("projectDashboard.tabs.ai"), icon: BookOpen },
      { id: "settings", label: t("projectDashboard.tabs.settings"), icon: Settings },
    ];
    return isCompanyMgmt ? all.filter((tab) => tab.id !== "diary") : all;
  }, [t, isCompanyMgmt]);

  return {
    t, dir,
    data, loading, resolvedId,
    projectsList, projectsListLoading,
    activeTab, setActiveTab,
    pushEnabled, uploadingBlueprint,
    blueprintPreview, setBlueprintPreview,
    fileRef,
    diaryInitialDesc, setDiaryInitialDesc,
    diaryInitialTaskId, setDiaryInitialTaskId,
    showProjectPicker, isCompanyMgmt, industryId, features,
    tabs,
    selectProject, refresh, clearProjectSelection, resetWorkspace, togglePush,
    onBlueprintFile, confirmBlueprintImport, loadProjectsList,
    openWorkspaceWidget,
  };
}
