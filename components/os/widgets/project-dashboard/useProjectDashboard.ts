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
      const res = await fetch("/api/projects/analyze-blueprint", { method: "POST", credentials: "include", body: fd });
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
    fileRef,
    diaryInitialDesc, setDiaryInitialDesc,
    diaryInitialTaskId, setDiaryInitialTaskId,
    showProjectPicker, isCompanyMgmt, industryId,
    tabs,
    selectProject, refresh, clearProjectSelection, togglePush, onBlueprintFile, loadProjectsList,
    openWorkspaceWidget,
  };
}
