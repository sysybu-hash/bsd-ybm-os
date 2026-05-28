"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Papa from "papaparse";
import { useI18n } from "@/components/os/system/I18nProvider";

export interface ReportEntry {
  id: string | number;
  date: string;
  employeeName: string;
  project: string;
  location: string;
  hours: number;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
}

export interface MeckanoProject {
  id: number;
  name: string;
}

export type Filters = {
  startDate: string;
  endDate: string;
  employeeId: string;
  projectId: string;
  locationId: string;
};

const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 30))
  .toISOString()
  .split("T")[0]!;

export function useMeckanoReports() {
  const { dir, t } = useI18n();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<MeckanoProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    startDate: defaultStartDate,
    endDate: new Date().toISOString().split("T")[0]!,
    employeeId: "all",
    projectId: "all",
    locationId: "all",
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/meckano/access");
        const data = await res.json() as {
          allowed?: boolean;
          message?: string;
          configured?: boolean;
          lastSyncAt?: string | null;
          autoSyncEnabled?: boolean;
        };
        setAccessAllowed(Boolean(data.allowed));
        setLastSyncAt(data.lastSyncAt ?? null);
        setAutoSyncEnabled(data.autoSyncEnabled !== false);
        if (!data.allowed && data.message) setError(data.message);
        if (!data.configured) setError(t("workspaceWidgets.meckano.noApiKey"));
      } catch {
        setAccessAllowed(false);
        setError(t("workspaceWidgets.meckano.noAccess"));
      }
    })();
  }, [t]);

  const fetchEmployees = useCallback(async () => {
    if (!accessAllowed) return;
    try {
      const res = await fetch("/api/meckano/employees");
      const data = await res.json() as { employees?: Employee[]; error?: string };
      if (res.ok) setEmployees(data.employees ?? []);
      else if (res.status === 403) setError(data.error ?? "אין הרשאה ל-Meckano");
    } catch { /* ignore */ }
  }, [accessAllowed]);

  const fetchProjects = useCallback(async () => {
    if (!accessAllowed) return;
    try {
      const res = await fetch("/api/meckano/projects");
      const data = await res.json() as { projects?: MeckanoProject[]; error?: string };
      if (res.ok) setProjects(data.projects ?? []);
      else if (res.status === 403) setError(data.error ?? "אין הרשאה ל-Meckano");
    } catch { /* ignore */ }
  }, [accessAllowed]);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meckano/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      const data = await res.json() as { reports?: ReportEntry[]; error?: string };
      if (res.ok) {
        setReports(data.reports ?? []);
      } else {
        setError(data.error ?? null);
        toast.error(data.error ?? t("workspaceWidgets.meckano.loadFailed"));
      }
    } catch {
      setError("שגיאת תקשורת בטעינת דוחות");
      toast.error(t("workspaceWidgets.meckano.networkError"));
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (accessAllowed !== true) return;
    void fetchEmployees();
    void fetchProjects();
    void fetchReports();
  }, [accessAllowed, fetchEmployees, fetchProjects, fetchReports]);

  const exportToCSV = () => {
    const csv = Papa.unparse(reports);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `meckano_report_${filters.startDate}_to_${filters.endDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(t("workspaceWidgets.meckano.csvExported"));
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFont("helvetica", "bold");
    doc.text("Meckano Attendance Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${filters.startDate} - ${filters.endDate}`, 14, 22);
    const tableData = reports.map((r) => [r.date, r.employeeName, r.project, r.location, r.hours.toString()]);
    autoTable(doc, {
      startY: 30,
      head: [["Date", "Employee", "Project", "Location", "Hours"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
    });
    doc.save(`meckano_report_${filters.startDate}_to_${filters.endDate}.pdf`);
    toast.success(t("workspaceWidgets.meckano.pdfDownloaded"));
  };

  return {
    dir, t,
    reports, employees, projects,
    isLoading, error, filters, setFilters,
    fetchReports, exportToCSV, downloadPDF,
    lastSyncAt, autoSyncEnabled,
  };
}
