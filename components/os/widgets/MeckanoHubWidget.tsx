"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  Calendar,
  Clock,
  Download,
  FileDown,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  Settings,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import WidgetState from "@/components/os/WidgetState";
import { OsButton, OsIconButton } from "@/components/os/ui";
import { useMeckanoAccess } from "@/hooks/use-meckano-access";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { useMeckanoReports } from "./meckano-reports/useMeckanoReports";

type TabId = "overview" | "reports" | "people" | "zones" | "punch" | "settings";

const MECKANO_TABS: TabId[] = ["overview", "reports", "people", "zones", "punch", "settings"];

export default function MeckanoHubWidget() {
  const { allowed, loading: accessLoading } = useMeckanoAccess();
  const hub = useMeckanoReports();
  const { dir, t, locale, reports, employees, projects, isLoading, error, filters, setFilters, fetchReports, exportToCSV, downloadPDF, lastSyncAt, autoSyncEnabled } = hub;
  const tm = useCallback(
    (suffix: string, params?: Record<string, string | number>) =>
      t(
        `workspaceWidgets.meckano.${suffix}`,
        params
          ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
          : undefined,
      ),
    [t],
  );

  const [tab, setTabState] = useState<TabId>("reports");
  const applyView = useCallback((view: WidgetViewState) => {
    const next = view.tab;
    if (typeof next === "string" && (MECKANO_TABS as string[]).includes(next)) {
      setTabState(next as TabId);
    }
  }, []);
  const { pushView } = useSyncedWidgetNavigation(applyView);
  const setTab = useCallback(
    (id: TabId) => {
      setTabState(id);
      pushView({ tab: id });
    },
    [pushView],
  );
  const [syncingZones, setSyncingZones] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const tabs: { id: TabId; labelKey: string; icon: React.ElementType }[] = [
    { id: "overview", labelKey: "tabOverview", icon: FileText },
    { id: "reports", labelKey: "tabReports", icon: Calendar },
    { id: "people", labelKey: "tabPeople", icon: Users },
    { id: "zones", labelKey: "tabZones", icon: MapPin },
    { id: "punch", labelKey: "tabPunch", icon: Clock },
    { id: "settings", labelKey: "tabSettings", icon: Settings },
  ];

  const syncZones = useCallback(async () => {
    setSyncingZones(true);
    try {
      const res = await fetch("/api/meckano/zones/sync", { method: "POST", credentials: "include" });
      const data = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? tm("zonesSyncFailed"));
      toast.success(tm("zonesImported", { count: data.imported ?? 0 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tm("genericError"));
    } finally {
      setSyncingZones(false);
    }
  }, [tm]);

  const punch = useCallback(async (action: "in" | "out") => {
    setPunchBusy(true);
    try {
      const res = await fetch("/api/meckano/clock-in", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? tm("genericError"));
      toast.success(data.message ?? (action === "in" ? tm("punchedIn") : tm("punchedOut")));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tm("genericError"));
    } finally {
      setPunchBusy(false);
    }
  }, [tm]);

  const saveApiKey = useCallback(async () => {
    setSavingKey(true);
    try {
      const fd = new FormData();
      fd.set("meckanoApiKey", apiKeyDraft.trim());
      const { updateMeckanoApiKeyAction } = await import("@/app/actions/org-settings");
      const result = await updateMeckanoApiKeyAction(fd);
      if (!result.ok) throw new Error(result.error);
      toast.success(tm("apiKeySaved"));
      void fetchReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tm("saveFailed"));
    } finally {
      setSavingKey(false);
    }
  }, [apiKeyDraft, fetchReports, tm]);

  useEffect(() => {
    if (tab === "reports" && reports.length === 0 && !isLoading) {
      void fetchReports();
    }
  }, [tab, reports.length, isLoading, fetchReports]);

  if (!accessLoading && !allowed) return null;

  if (!isLoading && error && reports.length === 0 && !error.includes("API Key")) {
    return (
      <WidgetState
        variant="error"
        message={error}
        onRetry={() => void fetchReports()}
        retryLabel={t("workspaceWidgets.meckano.retry")}
      />
    );
  }

  const totalHours = reports.reduce((acc, r) => acc + r.hours, 0);

  return (
    <div data-widget-sticky-chrome className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-[color:var(--win-accent,#6366f1)]">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold">{t("workspaceWidgets.meckano.title")}</h2>
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {autoSyncEnabled ? t("workspaceWidgets.meckano.autoSyncOn") : null}
                {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleString(locale)}` : ""}
              </p>
            </div>
          </div>
          {tab === "reports" ? (
            <div className="flex gap-1">
              <OsIconButton label={t("common.refresh")} size="sm" onClick={() => void fetchReports()}>
                <RefreshCw size={14} aria-hidden />
              </OsIconButton>
              <OsButton variant="secondary" size="sm" icon={<Download size={12} aria-hidden />} onClick={exportToCSV}>
                CSV
              </OsButton>
              <OsButton variant="primary" size="sm" icon={<FileDown size={12} aria-hidden />} onClick={downloadPDF}>
                PDF
              </OsButton>
            </div>
          ) : null}
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {tabs.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                tab === id ? "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300" : "text-[color:var(--foreground-muted)]"
              }`}
            >
              <Icon size={12} aria-hidden />
              {tm(labelKey)}
            </button>
          ))}
        </nav>
      </div>

      <div data-widget-scroll-pane className="custom-scrollbar">
        {tab === "overview" ? (
          <div className="space-y-3 p-4 text-xs">
            <p>{tm("ovAutoSync")}: {autoSyncEnabled ? tm("on") : tm("off")}</p>
            <p>{tm("ovTotalHours")}: {totalHours.toFixed(1)}</p>
            <p>{tm("ovEmployees")}: {employees.length}</p>
            <p>{tm("ovProjects")}: {projects.length}</p>
            <OsButton variant="primary" onClick={() => void fetchReports()}>
              {tm("refreshReports")}
            </OsButton>
            <OsButton
              variant="secondary"
              className="ms-2"
              loading={syncingZones}
              icon={<RefreshCw size={14} aria-hidden />}
              onClick={() => void syncZones()}
            >
              {tm("syncZones")}
            </OsButton>
          </div>
        ) : null}

        {tab === "reports" ? (
          <>
            <div className="grid grid-cols-2 gap-2 border-b border-[color:var(--border-main)] p-3 md:grid-cols-5">
              <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs" />
              <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs" />
              <select value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })} className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs">
                <option value="all">{t("workspaceWidgets.meckano.allEmployees")}</option>
                {employees.map((emp) => <option key={emp.id} value={String(emp.id)}>{emp.name}</option>)}
              </select>
              <select value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })} className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs">
                <option value="all">{t("workspaceWidgets.meckano.allProjects")}</option>
                <option value="general">{t("workspaceWidgets.meckano.generalProject")}</option>
                {projects.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
              <OsButton variant="primary" size="sm" icon={<Search size={12} aria-hidden />} onClick={() => void fetchReports()}>
                {t("workspaceWidgets.meckano.filter")}
              </OsButton>
            </div>
            {isLoading ? (
              <WidgetState variant="loading" />
            ) : (
              <div className="overflow-x-auto p-2">
                <table className="w-full min-w-[360px] text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-[color:var(--foreground-muted)]">
                      <th className="p-2 text-start">{t("workspaceWidgets.meckano.colDate")}</th>
                      <th className="p-2 text-start">{t("workspaceWidgets.meckano.colEmployee")}</th>
                      <th className="hidden p-2 sm:table-cell">{t("workspaceWidgets.meckano.colProject")}</th>
                      <th className="p-2">{t("workspaceWidgets.meckano.colHours")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r, idx) => (
                      <tr key={String(r.id ?? idx)} className="border-t border-[color:var(--border-main)]/20">
                        <td className="p-2">{new Date(r.date).toLocaleDateString(locale)}</td>
                        <td className="p-2 font-bold">{r.employeeName}</td>
                        <td className="hidden p-2 sm:table-cell text-[color:var(--foreground-muted)]">{r.project}</td>
                        <td className="p-2">{r.hours.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reports.length === 0 ? <p className="py-8 text-center text-[color:var(--foreground-muted)]">{t("workspaceWidgets.meckano.empty")}</p> : null}
              </div>
            )}
            <div className="sticky bottom-0 flex justify-end gap-6 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/90 p-3 text-xs">
              <span>{tm("footTotalHours")}: <strong>{totalHours.toFixed(1)}</strong></span>
              <span>{tm("footWorkDays")}: <strong>{reports.length}</strong></span>
            </div>
          </>
        ) : null}

        {tab === "people" ? (
          <ul className="divide-y divide-[color:var(--border-main)]/30 p-3 text-xs">
            {employees.map((e) => (
              <li key={e.id} className="flex justify-between py-2">
                <span className="font-bold"><User size={12} className="inline me-1" aria-hidden />{e.name}</span>
                <span className="text-[color:var(--foreground-muted)]">{e.department}</span>
              </li>
            ))}
            {employees.length === 0 ? <li className="py-4 text-[color:var(--foreground-muted)]">{tm("peopleEmpty")}</li> : null}
          </ul>
        ) : null}

        {tab === "zones" ? (
          <div className="space-y-3 p-4 text-xs">
            <p className="text-[color:var(--foreground-muted)]">{tm("zonesDesc")}</p>
            <OsButton variant="primary" loading={syncingZones} icon={<Briefcase size={14} aria-hidden />} onClick={() => void syncZones()}>
              {tm("zonesSyncApi")}
            </OsButton>
            <OsButton
              variant="secondary"
              onClick={async () => {
                const res = await fetch("/api/meckano/sync/zones-to-crm", { method: "POST", credentials: "include" });
                const d = (await res.json()) as { total?: number; error?: string };
                if (res.ok) toast.success(tm("zonesSyncedToCrm", { count: d.total ?? 0 }));
                else toast.error(d.error ?? tm("genericError"));
              }}
            >
              {tm("zonesToCrm")}
            </OsButton>
          </div>
        ) : null}

        {tab === "punch" ? (
          <div className="flex flex-col items-center gap-3 p-8">
            <p className="text-xs text-[color:var(--foreground-muted)]">{tm("punchDesc")}</p>
            <button type="button" disabled={punchBusy} onClick={() => void punch("in")} className="w-full max-w-xs rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-60">
              {tm("punchIn")}
            </button>
            <button type="button" disabled={punchBusy} onClick={() => void punch("out")} className="w-full max-w-xs rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-60">
              {tm("punchOut")}
            </button>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="space-y-3 p-4 text-xs">
            <label className="block font-bold" htmlFor="meckano-api-key">{tm("settingsApiKeyLabel")}</label>
            <input
              id="meckano-api-key"
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={tm("settingsApiKeyPlaceholder")}
              className="w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2"
            />
            <OsButton variant="primary" disabled={!apiKeyDraft.trim()} loading={savingKey} onClick={() => void saveApiKey()}>
              {tm("settingsSaveKey")}
            </OsButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
