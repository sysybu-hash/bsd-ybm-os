"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  Calendar,
  Clock,
  Download,
  FileDown,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Settings,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import WidgetState from "@/components/os/WidgetState";
import { useMeckanoReports } from "./meckano-reports/useMeckanoReports";

type TabId = "overview" | "reports" | "people" | "zones" | "punch" | "settings";

export default function MeckanoHubWidget() {
  const hub = useMeckanoReports();
  const { dir, t, reports, employees, projects, isLoading, error, filters, setFilters, fetchReports, exportToCSV, downloadPDF, lastSyncAt, autoSyncEnabled } = hub;

  const [tab, setTab] = useState<TabId>("reports");
  const [syncingZones, setSyncingZones] = useState(false);
  const [punchBusy, setPunchBusy] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "סקירה", icon: FileText },
    { id: "reports", label: "דוחות", icon: Calendar },
    { id: "people", label: "עובדים", icon: Users },
    { id: "zones", label: "אזורים", icon: MapPin },
    { id: "punch", label: "שעונים", icon: Clock },
    { id: "settings", label: "הגדרות", icon: Settings },
  ];

  const syncZones = useCallback(async () => {
    setSyncingZones(true);
    try {
      const res = await fetch("/api/meckano/zones/sync", { method: "POST", credentials: "include" });
      const data = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "סנכרון אזורים נכשל");
      toast.success(`יובאו ${data.imported ?? 0} אזורים ממקאנו`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSyncingZones(false);
    }
  }, []);

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
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      toast.success(data.message ?? (action === "in" ? "כניסה דווחה" : "יציאה דווחה"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setPunchBusy(false);
    }
  }, []);

  const saveApiKey = useCallback(async () => {
    setSavingKey(true);
    try {
      const fd = new FormData();
      fd.set("meckanoApiKey", apiKeyDraft.trim());
      const { updateMeckanoApiKeyAction } = await import("@/app/actions/org-settings");
      const result = await updateMeckanoApiKeyAction(fd);
      if (!result.ok) throw new Error(result.error);
      toast.success("מפתח API נשמר");
      void fetchReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSavingKey(false);
    }
  }, [apiKeyDraft, fetchReports]);

  useEffect(() => {
    if (tab === "reports" && reports.length === 0 && !isLoading) {
      void fetchReports();
    }
  }, [tab, reports.length, isLoading, fetchReports]);

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold">{t("workspaceWidgets.meckano.title")}</h2>
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {autoSyncEnabled ? t("workspaceWidgets.meckano.autoSyncOn") : null}
                {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleString("he-IL")}` : ""}
              </p>
            </div>
          </div>
          {tab === "reports" ? (
            <div className="flex gap-1">
              <button type="button" onClick={exportToCSV} className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold">
                <Download size={12} className="inline me-1" />
                CSV
              </button>
              <button type="button" onClick={downloadPDF} className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white">
                <FileDown size={12} className="inline me-1" />
                PDF
              </button>
            </div>
          ) : null}
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                tab === id ? "bg-indigo-500/20 text-indigo-300" : "text-[color:var(--foreground-muted)]"
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" ? (
          <div className="space-y-3 p-4 text-xs">
            <p>סנכרון אוטומטי: {autoSyncEnabled ? "פעיל" : "כבוי"}</p>
            <p>סה״כ שעות בטווח הנוכחי: {totalHours.toFixed(1)}</p>
            <p>עובדים במערכת: {employees.length}</p>
            <p>משימות/פרויקטים: {projects.length}</p>
            <button type="button" onClick={() => void fetchReports()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white">
              רענון דוחות
            </button>
            <button type="button" onClick={() => void syncZones()} disabled={syncingZones} className="ms-2 rounded-lg border border-[color:var(--border-main)] px-3 py-1.5">
              {syncingZones ? <Loader2 size={14} className="animate-spin inline" /> : <RefreshCw size={14} className="inline" />}
              {" "}סנכרון אזורים
            </button>
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
              <button type="button" onClick={() => void fetchReports()} className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                <Search size={12} className="inline me-1" />
                {t("workspaceWidgets.meckano.filter")}
              </button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-indigo-500" />
              </div>
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
                        <td className="p-2">{new Date(r.date).toLocaleDateString("he-IL")}</td>
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
              <span>סה״כ שעות: <strong>{totalHours.toFixed(1)}</strong></span>
              <span>ימי עבודה: <strong>{reports.length}</strong></span>
            </div>
          </>
        ) : null}

        {tab === "people" ? (
          <ul className="divide-y divide-[color:var(--border-main)]/30 p-3 text-xs">
            {employees.map((e) => (
              <li key={e.id} className="flex justify-between py-2">
                <span className="font-bold"><User size={12} className="inline me-1" />{e.name}</span>
                <span className="text-[color:var(--foreground-muted)]">{e.department}</span>
              </li>
            ))}
            {employees.length === 0 ? <li className="py-4 text-[color:var(--foreground-muted)]">אין נתונים — בדוק מפתח API</li> : null}
          </ul>
        ) : null}

        {tab === "zones" ? (
          <div className="space-y-3 p-4 text-xs">
            <p className="text-[color:var(--foreground-muted)]">ייבוא אזורים ממקאנו ל-CRM ולפרויקטים.</p>
            <button type="button" onClick={() => void syncZones()} disabled={syncingZones} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white">
              {syncingZones ? <Loader2 size={14} className="animate-spin inline" /> : <Briefcase size={14} className="inline me-1" />}
              סנכרון אזורים מ-API
            </button>
            <button type="button" onClick={async () => {
              const res = await fetch("/api/meckano/sync/zones-to-crm", { method: "POST", credentials: "include" });
              const d = await res.json();
              if (res.ok) toast.success(`סונכרנו ${d.total ?? 0} אזורים ל-CRM`);
              else toast.error(d.error ?? "שגיאה");
            }} className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5">
              סנכרון אזורים → CRM
            </button>
          </div>
        ) : null}

        {tab === "punch" ? (
          <div className="flex flex-col items-center gap-3 p-8">
            <p className="text-xs text-[color:var(--foreground-muted)]">דיווח נוכחות למקאנו (משתמש מנוי)</p>
            <button type="button" disabled={punchBusy} onClick={() => void punch("in")} className="w-full max-w-xs rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white">
              כניסה
            </button>
            <button type="button" disabled={punchBusy} onClick={() => void punch("out")} className="w-full max-w-xs rounded-xl bg-rose-600 py-3 text-sm font-bold text-white">
              יציאה
            </button>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="space-y-3 p-4 text-xs">
            <label className="block font-bold">מפתח API (ארגון)</label>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="הדבק מפתח מ-Meckano → הגדרות"
              className="w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2"
            />
            <button type="button" disabled={savingKey} onClick={() => void saveApiKey()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white">
              {savingKey ? <Loader2 size={14} className="animate-spin inline" /> : null}
              שמור מפתח
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
