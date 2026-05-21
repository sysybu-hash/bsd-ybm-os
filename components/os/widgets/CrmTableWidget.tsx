"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import WidgetState from "@/components/os/WidgetState";
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Search, 
  UserPlus, 
  Filter, 
  MoreVertical, 
  Mail, 
  Phone, 
  Building2,
  ChevronDown,
  Download,
  Trash2,
  Edit3,
  X,
  Save,
  User,
  Hash,
  Upload,
  LayoutDashboard
} from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { createProjectForContact } from '@/app/actions/crm';
import type { WidgetType } from '@/hooks/use-window-manager';
import { formatCurrencyILS, formatShortDate } from '@/lib/ui-formatters';

type IssuedDocumentRow = {
  id: string;
  type: string;
  number: number;
  clientName: string;
  total: number;
  status: string;
  date: string;
  items: unknown;
};

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: 'active' | 'lead' | 'inactive';
  lastContact: string;
  totalProjects: number;
  projectId: string | null;
  projectName: string | null;
  issuedDocuments: IssuedDocumentRow[];
}

const DOC_TYPE_LABELS: Record<string, string> = {
  QUOTE: "הצעת מחיר",
  TRANSACTION_INVOICE: "חשבונית עסקה",
  INVOICE: "חשבונית",
  INVOICE_RECEIPT: "חשבונית מס קבלה",
  RECEIPT: "קבלה",
  CREDIT_NOTE: "זיכוי",
};

const DOC_STATUS_LABELS: Record<string, string> = {
  PENDING: "ממתין",
  PAID: "שולם",
  CANCELLED: "בוטל",
};

function mapIssuedDocuments(raw: unknown): IssuedDocumentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const d = entry as Record<string, unknown>;
    return {
      id: String(d.id),
      type: String(d.type ?? ""),
      number: Number(d.number) || 0,
      clientName: String(d.clientName ?? ""),
      total: Number(d.total) || 0,
      status: String(d.status ?? "PENDING"),
      date: String(d.date ?? d.createdAt ?? ""),
      items: d.items,
    };
  });
}

function issuedDocumentDescription(doc: IssuedDocumentRow): string {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const first = items[0] as { desc?: string; description?: string } | undefined;
  const lineDesc = first?.desc ?? first?.description;
  if (lineDesc && String(lineDesc).trim()) return String(lineDesc).trim();
  const typeLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type;
  return doc.number > 0 ? `${typeLabel} #${doc.number}` : typeLabel;
}

function issuedDocumentStatusClass(status: string): string {
  if (status === "PAID") return "bg-emerald-500/10 text-emerald-500";
  if (status === "CANCELLED") return "bg-slate-500/10 text-slate-500";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

type ProjectOption = { id: string; name: string };

export type OpenWorkspaceWidgetFn = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
  options?: { maximize?: boolean },
) => string | void;

function CrmOverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-slate-900/80 p-4 backdrop-blur-md custom-scrollbar md:p-6">
      {children}
    </div>,
    document.body,
  );
}

export type CrmTableWidgetProps = {
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function CrmTableWidget({ openWorkspaceWidget }: CrmTableWidgetProps) {
  const { dir, t } = useI18n();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'lead' | 'inactive'>('all');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'lead' as const
  });

  const [isImporting, setIsImporting] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [savingProject, setSavingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectSyncMeta, setProjectSyncMeta] = useState<{
    autoSyncCrm: boolean;
    primaryContactId: string | null;
  } | null>(null);

  const mapContactRow = (c: Record<string, unknown>): Client => {
    const project = c.project as { id?: string; name?: string } | null | undefined;
    return {
      id: String(c.id),
      name: String(c.name ?? ""),
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      notes: (c.notes as string | null) ?? null,
      status: (String(c.status ?? "active").toLowerCase() as Client["status"]) || "active",
      lastContact: String(c.createdAt ?? new Date().toISOString()),
      totalProjects: project?.id ? 1 : 0,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      issuedDocuments: mapIssuedDocuments(c.issuedDocuments),
    };
  };

  const loadProjectOptions = React.useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) return;
      const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json) ? json : [];
      setProjectOptions(
        list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadProjectOptions();
  }, [loadProjectOptions]);

  useEffect(() => {
    void fetchClients(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- טעינה ראשונית בלבד
  }, []);

  const handleDeleteClient = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTargetId(id);
  };

  const confirmDeleteClient = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      const res = await fetch(`/api/crm/contacts/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("workspaceWidgets.crmTable.deleted"));
        fetchClients();
      } else {
        throw new Error("delete failed");
      }
    } catch {
      toast.error(t("workspaceWidgets.crmTable.deleteFailed"));
    }
  };

  const handleUpdateClient = async () => {
    if (!selectedClient) return;

    try {
      const res = await fetch(`/api/crm/contacts/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedClient.name,
          email: selectedClient.email,
          phone: selectedClient.phone,
          notes: selectedClient.notes,
          status: selectedClient.status,
          projectId: selectedClient.projectId,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as { contact?: Record<string, unknown> };
        if (json.contact) {
          const refreshed = mapContactRow(json.contact);
          setSelectedClient((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
        }
        toast.success(t("workspaceWidgets.crmTable.updated"));
        setIsEditing(false);
        fetchClients();
      } else {
        throw new Error('Failed to update client');
      }
    } catch (err) {
      toast.error(t("workspaceWidgets.crmTable.updateFailed"));
    }
  };

  useEffect(() => {
    if (!selectedClient?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/crm/contacts/${selectedClient.id}`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { contact?: Record<string, unknown> };
        if (!data.contact || cancelled) return;
        const refreshed = mapContactRow(data.contact);
        setSelectedClient((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
        setClients((prev) => prev.map((c) => (c.id === refreshed.id ? { ...c, ...refreshed } : c)));
      } catch {
        /* פרטי מסמכים אופציונליים */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רענון לפי מזהה לקוח בלבד
  }, [selectedClient?.id]);

  useEffect(() => {
    if (!selectedClient?.projectId) {
      setProjectSyncMeta(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${selectedClient.projectId}`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          project?: { autoSyncCrm?: boolean; primaryContactId?: string | null };
        };
        if (!cancelled) {
          setProjectSyncMeta({
            autoSyncCrm: Boolean(data.project?.autoSyncCrm),
            primaryContactId: data.project?.primaryContactId ?? null,
          });
        }
      } catch {
        if (!cancelled) setProjectSyncMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient?.projectId, selectedClient?.id]);

  const crmSyncStatus: "unlinked" | "syncing" | "synced" | "linked" = (() => {
    if (savingProject) return "syncing";
    if (!selectedClient?.projectId) return "unlinked";
    if (projectSyncMeta?.autoSyncCrm) {
      if (projectSyncMeta.primaryContactId === selectedClient.id) return "synced";
      return "linked";
    }
    return "linked";
  })();

  const saveClientProject = async (projectId: string | null) => {
    if (!selectedClient || savingProject) return;
    if (projectId) {
      const check = await fetch(
        `/api/crm/contacts/${selectedClient.id}/project-change-check?nextProjectId=${encodeURIComponent(projectId)}`,
        { credentials: "include" },
      ).catch(() => null);
      if (check?.ok) {
        const j = (await check.json()) as { allowed?: boolean; warn?: string };
        if (j.allowed === false) {
          toast.error(j.warn ?? "שינוי שיוך חסום");
          return;
        }
        if (j.warn && !window.confirm(j.warn)) return;
      }
    }
    setSavingProject(true);
    try {
      const res = await fetch(`/api/crm/contacts/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error("patch failed");
      const json = await res.json();
      const contact = json.contact as Record<string, unknown> | undefined;
      const proj = contact?.project as { id?: string; name?: string } | null;
      const updated: Client = contact
        ? mapContactRow(contact)
        : {
            ...selectedClient,
            projectId: proj?.id ?? null,
            projectName: proj?.name ?? null,
            totalProjects: proj?.id ? 1 : 0,
          };
      setSelectedClient(updated);
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success("שיוך פרויקט עודכן");
    } catch {
      toast.error("עדכון שיוך פרויקט נכשל");
    } finally {
      setSavingProject(false);
    }
  };

  const handleCreateProjectForClient = async () => {
    if (!selectedClient) return;
    setCreatingProject(true);
    try {
      const result = await createProjectForContact({ contactId: selectedClient.id });
      if (!result.ok) {
        toast.error(result.error ?? "יצירת פרויקט נכשלה");
        return;
      }
      const updated: Client = {
        ...selectedClient,
        projectId: result.projectId,
        projectName: result.projectName,
        totalProjects: 1,
      };
      setSelectedClient(updated);
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      await loadProjectOptions();
      toast.success("פרויקט נוצר ושויך");
    } catch {
      toast.error("יצירת פרויקט נכשלה");
    } finally {
      setCreatingProject(false);
    }
  };

  const openProjectHub = (client?: Client) => {
    const target = client ?? selectedClient;
    if (!target?.projectId || !openWorkspaceWidget) return;
    const projectId = target.projectId;
    const name = target.projectName ?? undefined;
    if (!client) {
      setSelectedClient(null);
      setIsEditing(false);
    }
    openWorkspaceWidget(
      "project",
      { projectId, name },
      { maximize: true },
    );
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];
        if (data.length === 0) {
          toast.error('הקובץ ריק');
          setIsImporting(false);
          return;
        }

        try {
          const res = await fetch('/api/crm/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: data })
          });
          const result = await res.json();
          
          if (res.ok) {
            toast.success(result.message);
            fetchClients();
          } else {
            throw new Error(result.error || 'ייבוא נכשל');
          }
        } catch (err: any) {
          toast.error(err.message || 'שגיאה בתהליך הייבוא');
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (err) => {
        toast.error('שגיאה בקריאת קובץ ה-CSV');
        setIsImporting(false);
      }
    });
  };

  const fetchClients = async (append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setPage(0);
      }
      setLoadError(null);
      const skip = append ? (page + 1) * 50 : 0;
      const q = searchQuery.trim();
      const params = new URLSearchParams({ skip: String(skip), take: "50" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/crm/contacts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t("workspaceWidgets.crmTable.errorLoad"));
      }
      const rows = Array.isArray(data.contacts) ? data.contacts : [];
      const mapped = rows.map((c: Record<string, unknown>) => mapContactRow(c));
      const total = typeof data.total === "number" ? data.total : mapped.length;
      if (append) {
        setClients((prev) => [...prev, ...mapped]);
        setPage((p) => p + 1);
      } else {
        setClients(mapped);
        setPage(0);
      }
      setHasMore(skip + mapped.length < total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("workspaceWidgets.crmTable.errorLoad");
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleAddClient = async () => {
    if (!newClient.name || !newClient.email) {
      toast.error(t("workspaceWidgets.crmTable.nameEmailRequired"));
      return;
    }

    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClient),
      });

      if (res.ok) {
        toast.success(t("workspaceWidgets.crmTable.created"));
        setIsAddingClient(false);
        setNewClient({ name: '', email: '', phone: '', status: 'lead' });
        fetchClients();
      } else {
        throw new Error('Failed to create client');
      }
    } catch {
      toast.error(t("workspaceWidgets.crmTable.createFailed"));
    }
  };

  const filteredClients = clients.filter(c => {
    const matchesSearch = (c.name?.includes(searchQuery) || c.email?.includes(searchQuery) || c.notes?.includes(searchQuery));
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading && clients.length === 0) {
    return <WidgetState variant="loading" message={t("workspaceWidgets.crmTable.loading")} />;
  }
  if (loadError && clients.length === 0) {
    return (
      <WidgetState
        variant="error"
        message={loadError}
        onRetry={fetchClients}
        retryLabel={t("workspaceWidgets.crmTable.retry")}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 w-full min-w-0 flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      <OsConfirmDialog
        open={deleteTargetId !== null}
        title={t("workspaceWidgets.crmTable.deleteTitle")}
        message={t("workspaceWidgets.crmTable.deleteMessage")}
        destructive
        onConfirm={confirmDeleteClient}
        onCancel={() => setDeleteTargetId(null)}
      />
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">ניהול לקוחות CRM</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">מאגר לקוחות מאוחד עם סנכרן נתונים מה-DB</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-400 transition-all border border-slate-200 dark:border-white/5 flex items-center gap-2 text-xs font-bold"
          >
            {isImporting ? <Hash className="animate-spin" size={18} /> : <Upload size={18} />}
            <span>ייבוא CSV</span>
          </button>
          <button className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-400 transition-all border border-slate-200 dark:border-white/5">
            <Download size={18} />
          </button>
          <button 
            onClick={() => setIsAddingClient(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <UserPlus size={18} /> לקוח חדש
          </button>
        </div>
      </div>

      {/* Kanban Board / Table Area */}
      <div className="flex-1 min-w-0 overflow-auto custom-scrollbar relative">
        {isAddingClient && (
          <CrmOverlayPortal>
            <div className="w-full max-w-md shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl my-auto">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <UserPlus className="text-emerald-600 dark:text-emerald-400" size={24} /> הוספת לקוח חדש
                </h3>
                <button onClick={() => setIsAddingClient(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 mb-8">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">שם מלא</label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      placeholder="ישראל ישראלי"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200"
                      value={newClient.name}
                      onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">אימייל</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="email"
                      placeholder="israel@example.com"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200"
                      value={newClient.email}
                      onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">טלפון</label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      placeholder="050-0000000"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">סטטוס</label>
                  <select 
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 appearance-none text-slate-900 dark:text-slate-200"
                    value={newClient.status}
                    onChange={(e) => setNewClient({...newClient, status: e.target.value as any})}
                  >
                    <option value="lead">ליד (Lead)</option>
                    <option value="active">פעיל (Active)</option>
                    <option value="inactive">לא פעיל (Inactive)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleAddClient}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <Save size={18} /> שמור לקוח
                </button>
              </div>
            </div>
          </CrmOverlayPortal>
        )}

        {selectedClient && (
          <CrmOverlayPortal>
            <div className="my-auto flex w-full max-w-4xl max-h-[min(90vh,calc(100vh-2rem))] shrink-0 flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] shadow-2xl">
              {/* Modal Header */}
              <div className="p-8 border-b border-slate-100 dark:border-white/5 flex justify-between items-start">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-3xl font-black text-white shadow-xl">
                    {selectedClient.name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{selectedClient.name}</h3>
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        selectedClient.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        selectedClient.status === 'lead' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                        'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                      }`}>
                        {selectedClient.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-3 rounded-2xl transition-all ${isEditing ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'}`}
                  >
                    <Edit3 size={20} />
                  </button>
                  <button onClick={() => { setSelectedClient(null); setIsEditing(false); }} className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-2xl text-slate-500 transition-all">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Left Column: Details */}
                  <div className="md:col-span-1 space-y-8">
                    <section>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">פרטי התקשרות</h4>
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">אימייל</label>
                          {isEditing ? (
                            <input 
                              className="w-full bg-transparent border-b border-emerald-500/50 focus:outline-none text-sm py-1"
                              value={selectedClient.email || ''}
                              onChange={(e) => setSelectedClient({...selectedClient, email: e.target.value})}
                            />
                          ) : (
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                              <Mail size={14} className="text-slate-400" /> {selectedClient.email || 'אין אימייל'}
                            </div>
                          )}
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">טלפון</label>
                          {isEditing ? (
                            <input 
                              className="w-full bg-transparent border-b border-emerald-500/50 focus:outline-none text-sm py-1"
                              value={selectedClient.phone || ''}
                              onChange={(e) => setSelectedClient({...selectedClient, phone: e.target.value})}
                            />
                          ) : (
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                              <Phone size={14} className="text-slate-400" /> {selectedClient.phone || 'אין טלפון'}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    {isEditing && (
                      <button 
                        onClick={handleUpdateClient}
                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Save size={18} /> שמור שינויים
                      </button>
                    )}
                  </div>

                  {/* Right Column: Activity & Projects */}
                  <div className="md:col-span-2 space-y-8">
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">פרויקט משויך</h4>
                      </div>
                      <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[9px] font-bold text-slate-500 uppercase block">בחר פרויקט</label>
                          <span
                            className="inline-flex items-center gap-1.5 text-[10px] font-bold"
                            title={t("workspaceWidgets.crmTable.syncStatusHint")}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                crmSyncStatus === "syncing"
                                  ? "animate-pulse bg-amber-400"
                                  : crmSyncStatus === "synced"
                                    ? "bg-emerald-500"
                                    : crmSyncStatus === "linked"
                                      ? "bg-sky-500"
                                      : "bg-slate-400"
                              }`}
                            />
                            {crmSyncStatus === "syncing"
                              ? t("workspaceWidgets.crmTable.syncSyncing")
                              : crmSyncStatus === "synced"
                                ? t("workspaceWidgets.crmTable.syncSynced")
                                : crmSyncStatus === "linked"
                                  ? t("workspaceWidgets.crmTable.syncLinked")
                                  : t("workspaceWidgets.crmTable.syncUnlinked")}
                          </span>
                        </div>
                        <select
                          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 px-3 py-2 text-sm"
                          value={selectedClient.projectId ?? ""}
                          disabled={savingProject}
                          onChange={(e) => {
                            void saveClientProject(e.target.value || null);
                          }}
                        >
                          <option value="">ללא פרויקט</option>
                          {projectOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={creatingProject}
                            onClick={() => void handleCreateProjectForClient()}
                            className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {creatingProject ? "יוצר…" : "פרויקט חדש"}
                          </button>
                          {selectedClient.projectId && openWorkspaceWidget ? (
                            <button
                              type="button"
                              aria-label={t("workspaceWidgets.crmTable.openControlCenter")}
                              onClick={() => openProjectHub()}
                              className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                            >
                              {t("workspaceWidgets.crmTable.openControlCenter")}
                            </button>
                          ) : null}
                        </div>
                        {selectedClient.projectName ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            מקושר ל: <span className="font-bold">{selectedClient.projectName}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">אין פרויקט משויך</p>
                        )}
                      </div>
                    </section>

                    <section>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">היסטוריה פיננסית (כרטסת)</h4>
                      <div className="bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 overflow-x-auto min-w-0">
                        <table className="w-full min-w-[480px] text-right text-xs">
                          <thead>
                            <tr className="bg-slate-100 dark:bg-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              <th className="px-6 py-3">תאריך</th>
                              <th className="px-6 py-3">תיאור</th>
                              <th className="px-6 py-3">סכום</th>
                              <th className="px-6 py-3">סטטוס</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {selectedClient.issuedDocuments.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="px-6 py-8 text-center text-slate-500 dark:text-slate-400 font-medium"
                                >
                                  אין מסמכים פיננסיים ללקוח זה
                                </td>
                              </tr>
                            ) : (
                              selectedClient.issuedDocuments.map((doc) => (
                                <tr key={doc.id}>
                                  <td className="px-6 py-4 text-slate-500 font-medium">
                                    {doc.date ? formatShortDate(doc.date) : "—"}
                                  </td>
                                  <td className="px-6 py-4 text-slate-900 dark:text-slate-200 font-bold">
                                    {issuedDocumentDescription(doc)}
                                  </td>
                                  <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-black">
                                    {formatCurrencyILS(doc.total)}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span
                                      className={`px-2 py-0.5 rounded-[4px] text-[9px] font-bold ${issuedDocumentStatusClass(doc.status)}`}
                                    >
                                      {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </CrmOverlayPortal>
        )}

        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse min-w-[920px]">
          <thead className="sticky top-0 z-10 bg-[color:var(--background-main)]/80 backdrop-blur-md">
            <tr className="text-right text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-[0.15em] border-b border-[color:var(--border-main)]">
              <th className="px-6 py-4">לקוח / חברה</th>
              <th className="px-6 py-4">סטטוס</th>
              <th className="px-6 py-4">פרטי קשר</th>
              <th className="px-6 py-4">פרויקטים</th>
              <th className="px-6 py-4">קשר אחרון</th>
              <th className="px-6 py-4 min-w-[11rem]">{t("workspaceWidgets.crmTable.columnActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border-main)]/30">
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="px-6 py-4"><div className="h-12 bg-[color:var(--foreground-muted)]/10 rounded-xl w-full" /></td>
                </tr>
              ))
            ) : filteredClients.map(client => (
              <tr 
                key={client.id} 
                onClick={() => setSelectedClient(client)}
                className="group hover:bg-[color:var(--foreground-muted)]/5 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-xs font-bold border border-[color:var(--border-main)] text-[color:var(--foreground-main)]">
                      {client.name?.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-[color:var(--foreground-main)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{client.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                    client.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    client.status === 'lead' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                  }`}>
                    {client.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[11px] text-[color:var(--foreground-main)] opacity-80">
                      <Mail size={12} className="text-[color:var(--foreground-muted)]" /> {client.email || '---'}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[color:var(--foreground-main)] opacity-80">
                      <Phone size={12} className="text-[color:var(--foreground-muted)]" /> {client.phone || '---'}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[color:var(--foreground-muted)]/10 flex items-center justify-center text-xs font-bold text-[color:var(--foreground-main)] border border-[color:var(--border-main)]">
                        {client.totalProjects}
                      </div>
                      <span className="text-[10px] text-[color:var(--foreground-muted)] font-bold uppercase">פרויקטים</span>
                    </div>
                    {client.projectName ? (
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 truncate max-w-[12rem]" title={client.projectName}>
                        {client.projectName}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-[11px] text-[color:var(--foreground-main)] opacity-70 font-medium">
                    {new Date(client.lastContact).toLocaleDateString('he-IL')}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    {client.projectId && openWorkspaceWidget ? (
                      <button
                        type="button"
                        title={t("workspaceWidgets.crmTable.openControlCenter")}
                        aria-label={t("workspaceWidgets.crmTable.openControlCenter")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openProjectHub(client);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors shrink-0"
                      >
                        <LayoutDashboard size={12} className="shrink-0" />
                        <span className="hidden sm:inline">{t("workspaceWidgets.crmTable.openControlCenter")}</span>
                      </button>
                    ) : null}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedClient(client); setIsEditing(true); }}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleDeleteClient(client.id, e)}
                        className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <button
            type="button"
            onClick={() => void fetchClients(true)}
            disabled={loadingMore}
            className="mx-auto my-4 block rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/80 px-6 py-2 text-sm font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--foreground-muted)]/10 disabled:opacity-50"
          >
            {loadingMore ? t("workspaceWidgets.crmTable.loading") : "טען עוד"}
          </button>
        )}

        {!loading && filteredClients.length === 0 && (
          <WidgetState variant="empty" message={t("workspaceWidgets.crmTable.empty")} />
        )}
      </div>
    </div>
  );
}
