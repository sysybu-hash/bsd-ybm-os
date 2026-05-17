"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import WidgetState from "@/components/os/WidgetState";
import React, { useState, useEffect } from 'react';
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
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: 'active' | 'lead' | 'inactive';
  lastContact: string;
  totalProjects: number;
}

export default function CrmTableWidget() {
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClients();
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
        }),
      });

      if (res.ok) {
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

  const fetchClients = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch("/api/crm/contacts");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || t("workspaceWidgets.crmTable.errorLoad"));
      }
      const rows = Array.isArray(data.contacts) ? data.contacts : [];
      setClients(
        rows.map((c: Record<string, unknown>) => ({
          id: String(c.id),
          name: String(c.name ?? ""),
          email: (c.email as string | null) ?? null,
          phone: (c.phone as string | null) ?? null,
          notes: (c.notes as string | null) ?? null,
          status: (String(c.status ?? "active").toLowerCase() as Client["status"]) || "active",
          lastContact: String(c.createdAt ?? new Date().toISOString()),
          totalProjects: 0,
        })),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("workspaceWidgets.crmTable.errorLoad");
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
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
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
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
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
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
          </div>
        )}

        {selectedClient && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-6 overflow-auto custom-scrollbar">
            <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh]">
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
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">פרויקטים פעילים</h4>
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-[10px] font-bold text-slate-500">{selectedClient.totalProjects} פרויקטים</span>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {/* Placeholder for real projects */}
                        <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-emerald-500/30 transition-all cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                              <Hash size={20} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">שיפוץ וילה הרצליה</div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase">סטטוס: בביצוע</div>
                            </div>
                          </div>
                          <ChevronDown size={16} className="text-slate-400 -rotate-90 group-hover:translate-x-1 transition-all" />
                        </div>
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
                            <tr>
                              <td className="px-6 py-4 text-slate-500 font-medium">12/05/2026</td>
                              <td className="px-6 py-4 text-slate-900 dark:text-slate-200 font-bold">מקדמה פרויקט הרצליה</td>
                              <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-black">₪45,000</td>
                              <td className="px-6 py-4"><span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-[4px] text-[9px] font-bold">שולם</span></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto min-w-0">
          <table className="w-full border-collapse min-w-[800px]">
          <thead className="sticky top-0 z-10 bg-[color:var(--background-main)]/80 backdrop-blur-md">
            <tr className="text-right text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-[0.15em] border-b border-[color:var(--border-main)]">
              <th className="px-6 py-4">לקוח / חברה</th>
              <th className="px-6 py-4">סטטוס</th>
              <th className="px-6 py-4">פרטי קשר</th>
              <th className="px-6 py-4">פרויקטים</th>
              <th className="px-6 py-4">קשר אחרון</th>
              <th className="px-6 py-4 w-20"></th>
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
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[color:var(--foreground-muted)]/10 flex items-center justify-center text-xs font-bold text-[color:var(--foreground-main)] border border-[color:var(--border-main)]">
                      {client.totalProjects}
                    </div>
                    <span className="text-[10px] text-[color:var(--foreground-muted)] font-bold uppercase">פרויקטים</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-[11px] text-[color:var(--foreground-main)] opacity-70 font-medium">
                    {new Date(client.lastContact).toLocaleDateString('he-IL')}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedClient(client); setIsEditing(true); }}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteClient(client.id, e)}
                      className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
        
        {!loading && filteredClients.length === 0 && (
          <WidgetState variant="empty" message={t("workspaceWidgets.crmTable.empty")} />
        )}
      </div>
    </div>
  );
}
