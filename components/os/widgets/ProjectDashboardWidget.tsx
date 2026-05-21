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
  Plus,
  Scan,
  Settings,
  Upload,
} from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import ProjectSchedulePanel from "@/components/os/widgets/project/ProjectSchedulePanel";
import ProjectBoqPanel from "@/components/os/widgets/project/ProjectBoqPanel";
import { registerWebPush, unregisterWebPush } from "@/lib/push/register-client";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import WidgetState from "@/components/os/WidgetState";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { BUSINESS_PAYMENT_MILESTONE_PRESETS } from "@/lib/project-payment-milestones";

const NotebookLMWidget = dynamic(() => import("@/components/os/widgets/NotebookLMWidget"), {
  loading: () => (
    <div className="flex h-40 items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  ),
});

type TabId = "financial" | "diary" | "gantt" | "ai" | "settings";

type DashboardData = {
  id: string;
  name: string;
  status: string;
  budget: number;
  primaryContactId: string | null;
  autoSyncCrm: boolean;
  client: string | null;
  budgetUtilizationPercent: number;
  financial: {
    erpExpenses: number;
    plannedExpenses: number;
    extrasApproved: number;
    extrasPending: number;
    milestonesTotal: number;
    milestonesPaid: number;
    utilized: number;
  };
  milestones: Array<{
    id: string;
    name: string;
    amount: number;
    isPaid: boolean;
    datePaid: string | null;
  }>;
  hiddenConstructionMilestones?: number;
  extras: Array<{
    id: string;
    description: string;
    cost: number;
    isApproved: boolean;
  }>;
  projectExpenses: Array<{ id: string; month: string; category: string; amount: number }>;
  workDiaries: Array<{
    id: string;
    description: string;
    workersCount: number;
    progress: number;
    date: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    progress: number;
    dependencies: string | null;
    description?: string | null;
    linkedBoqLineId?: string | null;
    linkedWorkDiaryId?: string | null;
  }>;
  expenseRecords: Array<{
    id: string;
    amount: number;
    vendor: string | null;
    date: string | null;
  }>;
  attendanceLogs: Array<{
    id?: number;
    employeeName?: string;
    date?: string;
    hours?: number;
    status?: string;
  }>;
};

const PUSH_KEY = "project-dashboard-push-enabled";

type ProjectListItem = { id: string; name: string; isActive?: boolean };

function formatMoney(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(
    n,
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL");
}

export type ProjectDashboardWidgetProps = {
  projectId?: string;
  projectName?: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

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

  const [milestoneName, setMilestoneName] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState("");
  const [extraDesc, setExtraDesc] = useState("");
  const [extraCost, setExtraCost] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expCategory, setExpCategory] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [diaryDesc, setDiaryDesc] = useState("");
  const [diaryLinkTaskId, setDiaryLinkTaskId] = useState<string | null>(null);
  const [diaryWorkers, setDiaryWorkers] = useState("1");
  const [diaryProgress, setDiaryProgress] = useState("0");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsBudget, setSettingsBudget] = useState("");
  const [settingsPrimaryContactId, setSettingsPrimaryContactId] = useState<string>("");
  const [settingsAutoSyncCrm, setSettingsAutoSyncCrm] = useState(false);
  const [crmContacts, setCrmContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    try {
      setPushEnabled(localStorage.getItem(PUSH_KEY) === "1");
    } catch {
      setPushEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) setResolvedId(projectId);
  }, [projectId]);

  const loadDashboard = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}/dashboard`, { credentials: "include" });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "dashboard");
    }
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
        list.map((p) => ({
          id: String(p.id),
          name: String(p.name ?? ""),
          isActive: p.isActive,
        })),
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
        const detailRes = await fetch(`/api/projects/detail?query=${encodeURIComponent(projectName)}`, {
          credentials: "include",
        });
        if (!detailRes.ok) throw new Error("detail");
        const detail = await detailRes.json();
        id = detail.id as string;
        setResolvedId(id);
      }
      if (!id) {
        setData(null);
        return;
      }
      setResolvedId(id);
      const dash = await loadDashboard(id);
      setData(dash);
    } catch {
      toast.error(t("projectDashboard.errors.load"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, projectId, projectName, resolvedId, t]);

  const showProjectPicker = !data && !resolvedId && !projectId && !projectName;

  useEffect(() => {
    if (projectId || projectName || resolvedId) {
      void refresh();
      return;
    }
    setLoading(false);
    setData(null);
    void loadProjectsList();
  }, [projectId, projectName, resolvedId, refresh, loadProjectsList]);

  const togglePush = async () => {
    const next = !pushEnabled;
    if (next) {
      const ok = await registerWebPush();
      if (!ok) {
        toast.error("התראות Push לא זמינות — בדקו VAPID והרשאות דפדפן");
        return;
      }
    } else {
      await unregisterWebPush().catch(() => undefined);
    }
    setPushEnabled(next);
    try {
      localStorage.setItem(PUSH_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
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
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("projectDashboard.errors.blueprint"));
        return;
      }
      toast.success(json.message ?? t("projectDashboard.blueprintSuccess"));
      await refresh();
    } catch {
      toast.error(t("projectDashboard.errors.blueprint"));
    } finally {
      setUploadingBlueprint(false);
    }
  };

  useEffect(() => {
    if (!data) return;
    setSettingsStatus(data.status);
    setSettingsBudget(String(data.budget));
    setSettingsPrimaryContactId(data.primaryContactId ?? "");
    setSettingsAutoSyncCrm(data.autoSyncCrm);
  }, [data]);

  useEffect(() => {
    if (activeTab !== "settings") return;
    void (async () => {
      try {
        const res = await fetch("/api/crm/contacts?take=200", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) return;
        const list = Array.isArray(json.contacts) ? json.contacts : json.items ?? [];
        setCrmContacts(
          list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })),
        );
      } catch {
        /* ignore */
      }
    })();
  }, [activeTab]);

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

  useEffect(() => {
    if (isCompanyMgmt && activeTab === "diary") {
      setActiveTab("gantt");
    }
  }, [isCompanyMgmt, activeTab]);

  const clearProjectSelection = useCallback(() => {
    setData(null);
    setResolvedId("");
    void loadProjectsList();
  }, [loadProjectsList]);

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
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col text-[color:var(--foreground-main)]" dir={dir}>
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
                  {uploadingBlueprint ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
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
                onClick={() =>
                  openWorkspaceWidget("aiScanner", {
                    projectId: resolvedId,
                    scanMode: "DRAWING_BOQ",
                  })
                }
                className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
              >
                <Scan size={12} aria-hidden />
                סורק AI
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                openWorkspaceWidget("notebookLM", {
                  projectId: resolvedId,
                  title: data.name,
                })
              }
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
            >
              <BookOpen size={12} aria-hidden />
              מחברת
            </button>
            <button
              type="button"
              onClick={() => openWorkspaceWidget("googleDrive", { projectId: resolvedId })}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
            >
              <FolderOpen size={12} aria-hidden />
              Drive
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
          <div className="space-y-4">
            {!isCompanyMgmt ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.financialBoqTitle")}</h3>
                <ProjectBoqPanel projectId={resolvedId} apiBase={apiBase} />
              </section>
            ) : null}

            <section>
              <p className="mb-1 text-xs text-[color:var(--foreground-muted)]">
                {t("projectDashboard.budgetUtilization")} ({data.budgetUtilizationPercent}%)
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-elevated)]">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${data.budgetUtilizationPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs">
                {formatMoney(data.financial.utilized)} / {formatMoney(data.budget)}
              </p>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold">
                {isCompanyMgmt
                  ? t("projectDashboard.milestonesBusiness")
                  : t("projectDashboard.milestones")}
              </h3>
              {isCompanyMgmt ? (
                <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
                  {t("projectDashboard.milestonesBusinessHelp")}
                </p>
              ) : null}
              {(data.hiddenConstructionMilestones ?? 0) > 0 ? (
                <p className="mb-2 text-[10px] text-amber-400/90">
                  {t("projectDashboard.milestonesHiddenConstruction", {
                    count: String(data.hiddenConstructionMilestones ?? 0),
                  })}
                </p>
              ) : null}
              {isCompanyMgmt && data.milestones.length === 0 ? (
                <div className="mb-2 rounded-lg border border-dashed border-[color:var(--border-main)] p-3 text-xs text-[color:var(--foreground-muted)]">
                  <p>{t("projectDashboard.milestonesEmptyBusiness")}</p>
                  <button
                    type="button"
                    className="mt-2 rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
                    onClick={async () => {
                      const existing = new Set(data.milestones.map((m) => m.name.trim()));
                      for (const preset of BUSINESS_PAYMENT_MILESTONE_PRESETS) {
                        if (existing.has(preset.name)) continue;
                        await fetch(`${apiBase}/milestones`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: preset.name,
                            amount: preset.amount,
                            sortOrder: preset.sortOrder,
                          }),
                        });
                      }
                      await refresh();
                      toast.success(t("projectDashboard.milestonesBusinessApplied"));
                    }}
                  >
                    {t("projectDashboard.applyBusinessMilestones")}
                  </button>
                </div>
              ) : null}
              <ul className="space-y-1 text-xs">
                {data.milestones.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={m.isPaid}
                        onChange={async () => {
                          await fetch(`${apiBase}/milestones`, {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: m.id, isPaid: !m.isPaid }),
                          });
                          await refresh();
                        }}
                      />
                      <span>{m.name}</span>
                    </label>
                    <span>{formatMoney(m.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className={osFieldClassName}
                  placeholder={
                    isCompanyMgmt
                      ? t("projectDashboard.milestoneNameBusiness")
                      : t("projectDashboard.milestoneName")
                  }
                  value={milestoneName}
                  onChange={(e) => setMilestoneName(e.target.value)}
                />
                <input
                  className={osFieldClassName}
                  type="number"
                  placeholder={t("projectDashboard.amount")}
                  value={milestoneAmount}
                  onChange={(e) => setMilestoneAmount(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
                  onClick={async () => {
                    if (!milestoneName || !milestoneAmount) return;
                    await fetch(`${apiBase}/milestones`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: milestoneName, amount: Number(milestoneAmount) }),
                    });
                    setMilestoneName("");
                    setMilestoneAmount("");
                    await refresh();
                  }}
                >
                  <Plus size={14} className="inline" /> {t("projectDashboard.add")}
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.extras")}</h3>
              <ul className="space-y-1 text-xs">
                {data.extras.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1"
                  >
                    <span>{e.description}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatMoney(e.cost)}</span>
                      <button
                        type="button"
                        className="text-amber-400 underline"
                        onClick={async () => {
                          await fetch(`${apiBase}/extras`, {
                            method: "PATCH",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: e.id, isApproved: !e.isApproved }),
                          });
                          await refresh();
                        }}
                      >
                        {e.isApproved ? t("projectDashboard.approved") : t("projectDashboard.approve")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className={osFieldClassName}
                  placeholder={t("projectDashboard.extraDesc")}
                  value={extraDesc}
                  onChange={(e) => setExtraDesc(e.target.value)}
                />
                <input
                  className={osFieldClassName}
                  type="number"
                  placeholder={t("projectDashboard.amount")}
                  value={extraCost}
                  onChange={(e) => setExtraCost(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
                  onClick={async () => {
                    if (!extraDesc || !extraCost) return;
                    await fetch(`${apiBase}/extras`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ description: extraDesc, cost: Number(extraCost) }),
                    });
                    setExtraDesc("");
                    setExtraCost("");
                    await refresh();
                  }}
                >
                  {t("projectDashboard.add")}
                </button>
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold">{t("projectDashboard.erpExpenses")}</h3>
              <p className="mb-2 text-[10px] text-[color:var(--foreground-muted)]">
                {t("projectDashboard.erpVsPlannedHelp")}
              </p>
              <ul className="space-y-1 text-xs">
                {(data.expenseRecords ?? []).map((e) => (
                  <li
                    key={e.id}
                    className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1"
                  >
                    <span>
                      {e.vendor ?? "—"} · {e.date ? formatDate(e.date) : "—"}
                    </span>
                    <span>{formatMoney(e.amount)}</span>
                  </li>
                ))}
                {(data.expenseRecords ?? []).length === 0 && (
                  <li className="text-[color:var(--foreground-muted)]">{t("projectDashboard.noErpExpenses")}</li>
                )}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.plannedExpenses")}</h3>
              <ul className="space-y-1 text-xs">
                {data.projectExpenses.map((e) => (
                  <li key={e.id} className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1">
                    <span>
                      {e.month} · {e.category}
                    </span>
                    <span>{formatMoney(e.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className={osFieldClassName}
                  placeholder="YYYY-MM"
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                />
                <input
                  className={osFieldClassName}
                  placeholder={t("projectDashboard.category")}
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                />
                <input
                  className={osFieldClassName}
                  type="number"
                  placeholder={t("projectDashboard.amount")}
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                />
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white"
                  onClick={async () => {
                    if (!expMonth || !expCategory || !expAmount) return;
                    await fetch(`${apiBase}/expenses`, {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        month: expMonth,
                        category: expCategory,
                        amount: Number(expAmount),
                      }),
                    });
                    setExpMonth("");
                    setExpCategory("");
                    setExpAmount("");
                    await refresh();
                  }}
                >
                  {t("projectDashboard.add")}
                </button>
              </div>
            </section>
          </div>
        )}

        {activeTab === "diary" && (
          <div className="space-y-4">
            <button
              type="button"
              className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
              onClick={async () => {
                const res = await fetch(`${apiBase}/sync-meckano`, {
                  method: "POST",
                  credentials: "include",
                });
                const json = await res.json();
                if (!res.ok) {
                  toast.error(json.error ?? "סנכרון מקאנו נכשל");
                  return;
                }
                toast.success(`מקאנו: ${json.created} חדש, ${json.updated} עודכן`);
                await refresh();
              }}
            >
              סנכרון ממקאנו ליומן
            </button>
            <form
              className="space-y-2 rounded-lg border border-[color:var(--border-main)] p-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!diaryDesc.trim()) return;
                await fetch(`${apiBase}/work-diaries`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    description: diaryDesc,
                    workersCount: Number(diaryWorkers) || 1,
                    progress: Number(diaryProgress) || 0,
                    isSyncedToAI: true,
                    linkedTaskId: diaryLinkTaskId ?? undefined,
                  }),
                });
                setDiaryDesc("");
                setDiaryLinkTaskId(null);
                toast.success(t("projectDashboard.diarySaved"));
                await refresh();
              }}
            >
              <textarea
                className={`${osFieldClassName} min-h-[72px]`}
                value={diaryDesc}
                onChange={(e) => setDiaryDesc(e.target.value)}
                placeholder={t("projectDashboard.diaryPlaceholder")}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  className={osFieldClassName}
                  type="number"
                  min={1}
                  value={diaryWorkers}
                  onChange={(e) => setDiaryWorkers(e.target.value)}
                  aria-label={t("projectDashboard.workers")}
                />
                <input
                  className={osFieldClassName}
                  type="number"
                  min={0}
                  max={100}
                  value={diaryProgress}
                  onChange={(e) => setDiaryProgress(e.target.value)}
                  aria-label={t("projectDashboard.progress")}
                />
                <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-white">
                  {t("projectDashboard.saveDiary")}
                </button>
              </div>
            </form>
            <section>
              <h3 className="mb-2 text-xs font-semibold">{t("projectDashboard.attendanceTitle")}</h3>
              {(data.attendanceLogs ?? []).length === 0 ? (
                <p className="text-xs text-[color:var(--foreground-muted)]">
                  {t("projectDashboard.attendanceEmpty")}
                </p>
              ) : (
                <ul className="mb-4 space-y-1 text-xs">
                  {(data.attendanceLogs ?? []).map((log, idx) => (
                    <li
                      key={log.id ?? idx}
                      className="flex justify-between rounded border border-[color:var(--border-main)] px-2 py-1"
                    >
                      <span>
                        {log.employeeName ?? "—"} · {log.status ?? ""}
                      </span>
                      <span>
                        {log.date ? formatDate(log.date) : "—"} · {log.hours ?? 0}h
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <ul className="space-y-2 text-xs">
              {data.workDiaries.map((d) => (
                <li key={d.id} className="rounded-lg border border-[color:var(--border-main)] p-2">
                  <p className="font-medium">{formatDate(d.date)}</p>
                  <p className="text-[color:var(--foreground-muted)]">{d.description}</p>
                  <p>
                    {t("projectDashboard.workers")}: {d.workersCount} · {d.progress}%
                  </p>
                </li>
              ))}
            </ul>
          </div>
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
                    if (opts?.description) setDiaryDesc(opts.description);
                    if (opts?.taskId) setDiaryLinkTaskId(opts.taskId);
                  }
            }
            labels={{
              importSchedule: t("projectDashboard.importSchedule"),
              importConfirm: t("projectDashboard.importConfirm"),
              importSuccess: t("projectDashboard.importSuccess"),
              importFailed: t("projectDashboard.importFailed"),
              allDomains: t("projectDashboard.allDomains"),
              generateDoc: t("projectDashboard.generateDoc"),
              docGeneratorTitle: t("projectDashboard.docGeneratorTitle"),
              domainCount: t("projectDashboard.domainCount"),
              task: t("projectDashboard.task"),
              start: t("projectDashboard.start"),
              end: t("projectDashboard.end"),
              progress: t("projectDashboard.progress"),
              noTasks: t("projectDashboard.noTasks"),
              listView: t("projectDashboard.ganttListView"),
              chartView: t("projectDashboard.ganttChartView"),
              addTask: t("projectDashboard.addTask"),
              editTask: t("projectDashboard.editTask"),
              save: t("projectDashboard.save"),
              cancel: t("projectDashboard.cancel"),
              delete: t("projectDashboard.delete"),
              deleteConfirm: t("projectDashboard.deleteConfirm"),
              scaleWeeks: t("projectDashboard.scaleWeeks"),
              scaleMonths: t("projectDashboard.scaleMonths"),
              trade: t("projectDashboard.trade"),
              dependencies: t("projectDashboard.dependencies"),
              linkedBoq: t("projectDashboard.linkedBoq"),
              workDiary: t("projectDashboard.workDiary"),
              createDiary: t("projectDashboard.createDiary"),
              ganttLegend: t("projectDashboard.ganttLegend"),
              ganttToday: t("projectDashboard.ganttToday"),
              ganttProgress: t("projectDashboard.ganttProgress"),
              ganttDependency: t("projectDashboard.ganttDependency"),
              newTaskTitle: t("projectDashboard.newTaskTitle"),
              taskSaved: t("projectDashboard.taskSaved"),
              taskDeleted: t("projectDashboard.taskDeleted"),
              taskSaveFailed: t("projectDashboard.taskSaveFailed"),
            }}
          />
        )}

        {activeTab === "settings" && (
          <form
            className="max-w-md space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingSettings(true);
              try {
                const res = await fetch(`/api/projects/${encodeURIComponent(resolvedId)}`, {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    status: settingsStatus,
                    budget: Number(settingsBudget) || 0,
                    primaryContactId: settingsPrimaryContactId || null,
                    autoSyncCrm: settingsAutoSyncCrm,
                  }),
                });
                if (!res.ok) {
                  toast.error(t("projectDashboard.errors.saveSettings"));
                  return;
                }
                toast.success(t("projectDashboard.settingsSaved"));
                await refresh();
              } finally {
                setSavingSettings(false);
              }
            }}
          >
            <label className="block text-xs">
              <span className="text-[color:var(--foreground-muted)]">{t("projectDashboard.settingsStatus")}</span>
              <input
                className={`${osFieldClassName} mt-1 w-full`}
                value={settingsStatus}
                onChange={(e) => setSettingsStatus(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              <span className="text-[color:var(--foreground-muted)]">{t("projectDashboard.settingsBudget")}</span>
              <input
                type="number"
                min={0}
                className={`${osFieldClassName} mt-1 w-full`}
                value={settingsBudget}
                onChange={(e) => setSettingsBudget(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              <span className="text-[color:var(--foreground-muted)]">{t("projectDashboard.settingsPrimaryContact")}</span>
              <select
                className={`${osFieldClassName} mt-1 w-full`}
                value={settingsPrimaryContactId}
                onChange={(e) => setSettingsPrimaryContactId(e.target.value)}
              >
                <option value="">{t("projectDashboard.noPrimaryContact")}</option>
                {crmContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={settingsAutoSyncCrm}
                onChange={(e) => setSettingsAutoSyncCrm(e.target.checked)}
              />
              {t("projectDashboard.settingsAutoSyncCrm")}
            </label>
            <button
              type="submit"
              disabled={savingSettings}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {savingSettings ? t("projectDashboard.saving") : t("projectDashboard.saveSettings")}
            </button>
          </form>
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
