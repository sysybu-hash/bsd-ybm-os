"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Calendar, 
  User, 
  Briefcase, 
  MapPin, 
  Download, 
  FileDown, 
  Search,
  Filter,
  ArrowLeftRight,
  Clock,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

interface ReportEntry {
  id: string | number;
  date: string;
  employeeName: string;
  project: string;
  location: string;
  hours: number;
}

interface Employee {
  id: number;
  name: string;
  email: string;
  department: string;
}

interface Project {
  id: number;
  name: string;
}

export default function MeckanoReportsWidget() {
  const { dir } = useI18n();
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    employeeId: 'all',
    projectId: 'all',
    locationId: 'all'
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/meckano/access');
        const data = await res.json();
        setAccessAllowed(Boolean(data.allowed));
        if (!data.allowed && data.message) {
          setError(data.message);
        }
        if (!data.configured) {
          setError('מפתח MECKANO_API_KEY לא מוגדר בשרת.');
        }
      } catch {
        setAccessAllowed(false);
        setError('לא ניתן לבדוק הרשאות Meckano');
      }
    })();
  }, []);

  const fetchEmployees = React.useCallback(async () => {
    if (!accessAllowed) return;
    try {
      const res = await fetch('/api/meckano/employees');
      const data = await res.json();
      if (res.ok) {
        setEmployees(data.employees || []);
      } else if (res.status === 403) {
        setError(data.error || 'אין הרשאה ל-Meckano');
      }
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    }
  }, [accessAllowed]);

  const fetchProjects = React.useCallback(async () => {
    if (!accessAllowed) return;
    try {
      const res = await fetch('/api/meckano/projects');
      const data = await res.json();
      if (res.ok) {
        setProjects(data.projects || []);
      } else if (res.status === 403) {
        setError(data.error || 'אין הרשאה ל-Meckano');
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    }
  }, [accessAllowed]);

  const fetchReports = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meckano/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });
      const data = await res.json();
      if (res.ok) {
        setReports(data.reports);
      } else {
        setError(data.error);
        toast.error(data.error || 'נכשל בטעינת דוחות');
      }
    } catch (err) {
      setError('שגיאת תקשורת בטעינת דוחות');
      toast.error('שגיאת תקשורת בטעינת דוחות');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (accessAllowed !== true) return;
    fetchEmployees();
    fetchProjects();
    fetchReports();
  }, [accessAllowed, fetchEmployees, fetchProjects, fetchReports]);

  const exportToCSV = () => {
    const csv = Papa.unparse(reports);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `meckano_report_${filters.startDate}_to_${filters.endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('דוח CSV יוצא בהצלחה');
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    // Header
    doc.setFont("helvetica", "bold");
    doc.text("Meckano Attendance Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${filters.startDate} - ${filters.endDate}`, 14, 22);

    const tableData = reports.map(r => [
      r.date,
      r.employeeName,
      r.project,
      r.location,
      r.hours.toString()
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Date', 'Employee', 'Project', 'Location', 'Hours']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] } // Emerald-500
    });

    doc.save(`meckano_report_${filters.startDate}_to_${filters.endDate}.pdf`);
    toast.success('דוח PDF הורד בהצלחה');
  };

  return (
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileText size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--foreground-main)]">מחולל דוחות Meckano</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">ניהול ומעקב שעות עובדים ופרויקטים</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={exportToCSV}
            className="flex-1 md:flex-none p-2 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 rounded-xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all border border-[color:var(--border-main)] flex items-center justify-center gap-2 text-xs font-bold"
          >
            <Download size={16} /> ייצוא CSV
          </button>
          <button 
            onClick={downloadPDF}
            className="flex-1 md:flex-none p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
          >
            <FileDown size={16} /> הורד PDF
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 bg-[color:var(--background-main)]/30 border-b border-[color:var(--border-main)] grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <Calendar size={10} /> מתאריך
          </label>
          <input 
            type="date" 
            value={filters.startDate}
            onChange={(e) => setFilters({...filters, startDate: e.target.value})}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[color:var(--foreground-main)]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <Calendar size={10} /> עד תאריך
          </label>
          <input 
            type="date" 
            value={filters.endDate}
            onChange={(e) => setFilters({...filters, endDate: e.target.value})}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-[color:var(--foreground-main)]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <User size={10} /> עובד
          </label>
          <select 
            value={filters.employeeId}
            onChange={(e) => setFilters({...filters, employeeId: e.target.value})}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none text-[color:var(--foreground-main)]"
          >
            <option value="all">כל העובדים</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-1">
            <Briefcase size={10} /> פרויקט
          </label>
          <select 
            value={filters.projectId}
            onChange={(e) => setFilters({...filters, projectId: e.target.value})}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none text-[color:var(--foreground-main)]"
          >
            <option value="all">כל הפרויקטים</option>
            <option value="general">כללי / משרד</option>
            {projects.map(proj => (
              <option key={proj.id} value={proj.id}>{proj.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button 
            onClick={fetchReports}
            className="w-full h-9 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
          >
            <Search size={14} /> סנן תוצאות
          </button>
        </div>
      </div>

      {/* Data Area */}
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--background-main)]/50 backdrop-blur-[1px] z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <span className="text-sm font-bold text-[color:var(--foreground-muted)]">טוען נתונים...</span>
            </div>
          </div>
        ) : null}

        {error && error.includes('API Key') && (
          <div className="absolute inset-0 flex items-center justify-center bg-[color:var(--background-main)] z-30 p-8 text-center">
            <div className="max-w-md">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-6 text-rose-500">
                <Clock size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">מפתח API חסר</h3>
              <p className="text-sm text-[color:var(--foreground-muted)] mb-8">
                כדי למשוך דוחות מ-Meckano, עליך להגדיר את מפתח ה-API בקובץ ה-<code>.env</code> תחת המשתנה <code>MECKANO_API_KEY</code>.
              </p>
              <button 
                onClick={fetchReports}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all"
              >
                נסה שוב
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
          <thead className="sticky top-0 z-10 bg-[color:var(--background-main)]/80 backdrop-blur-md">
            <tr className="text-right text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-[0.15em] border-b border-[color:var(--border-main)]/30">
              <th className="px-6 py-4">תאריך</th>
              <th className="px-6 py-4">עובד</th>
              <th className="px-6 py-4">פרויקט</th>
              <th className="px-6 py-4">מיקום</th>
              <th className="px-6 py-4">שעות</th>
              <th className="px-6 py-4 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border-main)]/10">
            {reports.map((report, idx) => (
              <tr key={report.id || idx} className="group hover:bg-[color:var(--foreground-muted)]/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--foreground-main)]">
                    <Calendar size={12} className="text-[color:var(--foreground-muted)]" />
                    {new Date(report.date).toLocaleDateString('he-IL')}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                      {report.employeeName?.charAt(0) || 'U'}
                    </div>
                    <span className="text-xs font-bold text-[color:var(--foreground-main)]">{report.employeeName}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
                    <Briefcase size={12} className="text-[color:var(--foreground-muted)] opacity-50" />
                    {report.project}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
                    <MapPin size={12} className="text-[color:var(--foreground-muted)] opacity-50" />
                    {report.location}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-black">
                      {report.hours}
                    </div>
                    <Clock size={12} className="text-[color:var(--foreground-muted)] opacity-50" />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <ArrowLeftRight size={14} className="text-[color:var(--foreground-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

        {!isLoading && reports.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-30">
            <FileText size={48} className="text-[color:var(--foreground-muted)]" />
            <p className="mt-4 text-sm font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">אין נתונים להצגה</p>
          </div>
        )}
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
