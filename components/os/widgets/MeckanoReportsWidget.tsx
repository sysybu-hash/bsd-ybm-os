"use client";

import React from "react";
import {
  ArrowLeftRight, Briefcase, Calendar, Clock, Download,
  FileDown, FileText, Loader2, MapPin, Search, User,
} from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import { useMeckanoReports } from "./meckano-reports/useMeckanoReports";

export default function MeckanoReportsWidget() {
  const {
    dir, t,
    reports, employees, projects,
    isLoading, error, filters, setFilters,
    fetchReports, exportToCSV, downloadPDF,
    lastSyncAt, autoSyncEnabled,
  } = useMeckanoReports();

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

  return (
    <div className="flex flex-col min-h-full bg-transparent text-[color:var(--foreground-main)] overflow-x-hidden" dir={dir}>
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--foreground-main)]">{t("workspaceWidgets.meckano.title")}</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.meckano.subtitle")}
              {autoSyncEnabled ? (
                <span className="ms-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  · {t("workspaceWidgets.meckano.autoSyncOn")}
                  {lastSyncAt
                    ? ` (${t("workspaceWidgets.meckano.lastSync")}: ${new Date(lastSyncAt).toLocaleString()})`
                    : ""}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button onClick={exportToCSV}
            className="flex-1 md:flex-none p-2 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 rounded-xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all border border-[color:var(--border-main)] flex items-center justify-center gap-2 text-xs font-bold">
            <Download size={16} /> {t("workspaceWidgets.meckano.exportCsv")}
          </button>
          <button onClick={downloadPDF}
            className="flex-1 md:flex-none p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20">
            <FileDown size={16} /> {t("workspaceWidgets.meckano.downloadPdf")}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-[color:var(--background-main)]/30 border-b border-[color:var(--border-main)] grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <Calendar size={10} /> {t("workspaceWidgets.meckano.dateFrom")}
          </label>
          <input type="date" value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[color:var(--foreground-main)]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <Calendar size={10} /> {t("workspaceWidgets.meckano.dateTo")}
          </label>
          <input type="date" value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[color:var(--foreground-main)]" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <User size={10} /> {t("workspaceWidgets.meckano.filterEmployee")}
          </label>
          <select value={filters.employeeId}
            onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none text-[color:var(--foreground-main)]">
            <option value="all">{t("workspaceWidgets.meckano.allEmployees")}</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <Briefcase size={10} /> {t("workspaceWidgets.meckano.filterProject")}
          </label>
          <select value={filters.projectId}
            onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none text-[color:var(--foreground-main)]">
            <option value="all">{t("workspaceWidgets.meckano.allProjects")}</option>
            <option value="general">{t("workspaceWidgets.meckano.generalProject")}</option>
            {projects.map((proj) => <option key={proj.id} value={proj.id}>{proj.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => void fetchReports()}
            className="w-full h-9 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
            <Search size={14} /> {t("workspaceWidgets.meckano.filter")}
          </button>
        </div>
      </div>

      {/* Data Area */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--background-main)]/50 backdrop-blur-[1px] z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <span className="text-sm font-bold text-[color:var(--foreground-muted)]">{t("workspaceWidgets.meckano.loading")}</span>
            </div>
          </div>
        ) : null}

        {error?.includes("API Key") ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--background-main)] z-30 p-8 text-center">
            <div className="max-w-md">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-6 text-rose-500">
                <Clock size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">מפתח API חסר</h3>
              <p className="text-sm text-[color:var(--foreground-muted)] mb-8">
                כדי למשוך דוחות מ-Meckano, עליך להגדיר את מפתח ה-API בקובץ ה-<code>.env</code> תחת המשתנה <code>MECKANO_API_KEY</code>.
              </p>
              <button onClick={() => void fetchReports()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all">
                {t("workspaceWidgets.meckano.retry")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[360px]">
            <thead className="sticky top-0 z-10 bg-[color:var(--background-main)]/80 backdrop-blur-md">
              <tr className="text-start text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-[0.15em] border-b border-[color:var(--border-main)]/30">
                <th className="px-3 py-3 sm:px-6 sm:py-4">{t("workspaceWidgets.meckano.colDate")}</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">{t("workspaceWidgets.meckano.colEmployee")}</th>
                <th className="hidden px-3 py-3 sm:table-cell sm:px-6 sm:py-4">{t("workspaceWidgets.meckano.colProject")}</th>
                <th className="hidden px-3 py-3 md:table-cell md:px-6 md:py-4">{t("workspaceWidgets.meckano.colLocation")}</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4">{t("workspaceWidgets.meckano.colHours")}</th>
                <th className="px-3 py-3 sm:px-6 sm:py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-main)]/10">
              {reports.map((report, idx) => (
                <tr key={report.id ?? idx} className="group hover:bg-[color:var(--foreground-muted)]/5 transition-colors">
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--foreground-main)]">
                      <Calendar size={12} className="text-[color:var(--foreground-muted)]" />
                      {new Date(report.date).toLocaleDateString("he-IL")}
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                        {report.employeeName?.charAt(0) ?? "U"}
                      </div>
                      <span className="text-xs font-bold text-[color:var(--foreground-main)]">{report.employeeName}</span>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 sm:table-cell sm:px-6 sm:py-4">
                    <div className="flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
                      <Briefcase size={12} className="text-[color:var(--foreground-muted)] opacity-50" />
                      {report.project}
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell md:px-6 md:py-4">
                    <div className="flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
                      <MapPin size={12} className="text-[color:var(--foreground-muted)] opacity-50" />
                      {report.location}
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-2">
                      <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-black">
                        {report.hours}
                      </div>
                      <Clock size={12} className="text-[color:var(--foreground-muted)] opacity-50" />
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4">
                    <ArrowLeftRight size={14} className="text-[color:var(--foreground-muted)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-30">
            <FileText size={48} className="text-[color:var(--foreground-muted)]" />
            <p className="mt-4 text-sm font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">{t("workspaceWidgets.meckano.empty")}</p>
          </div>
        ) : null}
      </div>

      {/* Summary Footer */}
      <div className="p-4 bg-[color:var(--background-main)]/50 border-t border-[color:var(--border-main)] flex justify-end gap-8">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest">סה&quot;כ שעות</span>
          <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
            {reports.reduce((acc, curr) => acc + curr.hours, 0).toFixed(1)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest">ימי עבודה</span>
          <span className="text-lg font-black text-[color:var(--foreground-main)]">{reports.length}</span>
        </div>
      </div>
    </div>
  );
}
