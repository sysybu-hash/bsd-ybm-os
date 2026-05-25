"use client";

import React from "react";
import { Users, UserPlus, Download, Hash, Upload } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import WidgetState from "@/components/os/WidgetState";
import type { CrmTableWidgetProps } from "./crm-table/types";
import { useCrmTable } from "./crm-table/useCrmTable";
import { AddClientModal } from "./crm-table/AddClientModal";
import { ClientDetailModal } from "./crm-table/ClientDetailModal";
import { CrmContactsTable } from "./crm-table/CrmContactsTable";

export type { CrmTableWidgetProps };
export type { OpenWorkspaceWidgetFn } from "./crm-table/types";

export default function CrmTableWidget({ openWorkspaceWidget }: CrmTableWidgetProps) {
  const { dir, t } = useI18n();
  const s = useCrmTable({ openWorkspaceWidget, t });

  if (s.loading && s.clients.length === 0)
    return <WidgetState variant="loading" message={t("workspaceWidgets.crmTable.loading")} />;
  if (s.loadError && s.clients.length === 0)
    return <WidgetState variant="error" message={s.loadError} onRetry={() => void s.fetchClients()} retryLabel={t("workspaceWidgets.crmTable.retry")} />;

  return (
    <div className="flex min-h-0 flex-1 w-full min-w-0 flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir={dir}>
      <OsConfirmDialog
        open={s.deleteTargetId !== null}
        title={t("workspaceWidgets.crmTable.deleteTitle")}
        message={t("workspaceWidgets.crmTable.deleteMessage")}
        destructive
        onConfirm={() => void s.confirmDeleteClient()}
        onCancel={() => s.setDeleteTargetId(null)}
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
          <input type="file" accept=".csv" className="hidden" ref={s.fileInputRef} onChange={s.handleImportCSV} />
          <button
            type="button"
            onClick={() => s.fileInputRef.current?.click()}
            disabled={s.isImporting}
            className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-400 transition-all border border-slate-200 dark:border-white/5 flex items-center gap-2 text-xs font-bold"
          >
            {s.isImporting ? <Hash className="animate-spin" size={18} /> : <Upload size={18} />}
            <span>ייבוא CSV</span>
          </button>
          <button
            type="button"
            aria-label={t("workspaceWidgets.crmTable.exportCsv")}
            className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-400 transition-all border border-slate-200 dark:border-white/5"
          >
            <Download size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => s.setIsAddingClient(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
          >
            <UserPlus size={18} /> לקוח חדש
          </button>
        </div>
      </div>

      {/* Modals */}
      {s.isAddingClient && (
        <AddClientModal
          onClose={() => s.setIsAddingClient(false)}
          onCreated={() => void s.fetchClients()}
          t={t}
        />
      )}
      {s.selectedClient && (
        <ClientDetailModal
          client={s.selectedClient}
          isEditing={s.isEditing}
          setIsEditing={s.setIsEditing}
          onChange={s.setSelectedClient}
          onClose={() => { s.setSelectedClient(null); s.setIsEditing(false); }}
          onSave={s.handleUpdateClient}
          projectOptions={s.projectOptions}
          savingProject={s.savingProject}
          creatingProject={s.creatingProject}
          crmSyncStatus={s.crmSyncStatus}
          onSaveProject={s.saveClientProject}
          onCreateProject={s.handleCreateProjectForClient}
          onOpenProjectHub={() => s.openProjectHub()}
          openWorkspaceWidget={openWorkspaceWidget}
          t={t}
        />
      )}

      {/* Table */}
      <div className="flex-1 min-w-0 overflow-auto custom-scrollbar relative">
        <CrmContactsTable
          clients={s.filteredClients}
          loading={s.loading}
          hasMore={s.hasMore}
          loadingMore={s.loadingMore}
          onSelect={(client) => s.setSelectedClient(client)}
          onEdit={(client) => { s.setSelectedClient(client); s.setIsEditing(true); }}
          onDelete={(id, e) => { e.stopPropagation(); s.setDeleteTargetId(id); }}
          onLoadMore={() => void s.fetchClients(true)}
          onOpenProjectHub={(client) => s.openProjectHub(client)}
          openWorkspaceWidget={openWorkspaceWidget}
          t={t}
        />
      </div>
    </div>
  );
}
