"use client";

import React from "react";
import { Users, UserPlus, Download, Hash, Upload, Search, Sparkles } from "lucide-react";
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
    return (
      <WidgetState
        variant="error"
        message={s.loadError}
        onRetry={() => void s.fetchClients()}
        retryLabel={t("workspaceWidgets.crmTable.retry")}
      />
    );

  return (
    <div
      data-widget-sticky-chrome
      className="flex h-full min-h-0 w-full min-w-0 flex-col bg-transparent text-[color:var(--foreground-main)] overflow-x-hidden"
      dir={dir}
    >
      <OsConfirmDialog
        open={s.deleteTargetId !== null}
        title={t("workspaceWidgets.crmTable.deleteTitle")}
        message={t("workspaceWidgets.crmTable.deleteMessage")}
        destructive
        onConfirm={() => void s.confirmDeleteClient()}
        onCancel={() => s.setDeleteTargetId(null)}
      />

      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Users size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">{t("workspaceWidgets.quickActions.crmTable.title")}</h2>
              <p className="text-xs text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.quickActions.crmTable.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <input type="file" accept=".csv" className="hidden" ref={s.fileInputRef} onChange={s.handleImportCSV} />
            <button
              type="button"
              onClick={() => s.fileInputRef.current?.click()}
              disabled={s.isImporting}
              className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-400 transition-all border border-slate-200 dark:border-white/5 flex items-center gap-2 text-xs font-bold"
            >
              {s.isImporting ? <Hash className="animate-spin" size={18} /> : <Upload size={18} />}
              <span>{t("workspaceWidgets.crmTable.importCsv")}</span>
            </button>
            <button
              type="button"
              onClick={() => void s.handleExportCsv()}
              disabled={s.isExporting}
              aria-label={t("workspaceWidgets.crmTable.exportCsv")}
              className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-slate-500 dark:text-slate-400 transition-all border border-slate-200 dark:border-white/5 flex items-center gap-2 text-xs font-bold"
            >
              {s.isExporting ? <Hash className="animate-spin" size={18} /> : <Download size={18} aria-hidden />}
              <span>{t("workspaceWidgets.crmTable.exportCsv")}</span>
            </button>
            <button
              type="button"
              onClick={() => s.setIsAddingClient(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
            >
              <UserPlus size={18} /> {t("workspaceWidgets.crmTable.newClient")}
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1 md:max-w-md">
            <Search
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]"
              size={16}
              aria-hidden
            />
            <input
              type="search"
              value={s.searchQuery}
              onChange={(e) => s.setSearchQuery(e.target.value)}
              placeholder={t("workspaceWidgets.crmTable.searchPlaceholder")}
              className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] py-2 pe-10 ps-3 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={s.semanticMode}
              onChange={(e) => s.setSemanticMode(e.target.checked)}
              className="rounded border-[color:var(--border-main)]"
            />
            <Sparkles size={14} className="text-violet-500" aria-hidden />
            {t("workspaceWidgets.crmTable.semanticSearch")}
          </label>
          {s.semanticFallback && s.semanticMode ? (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              {t("workspaceWidgets.crmTable.semanticFallback")}
            </span>
          ) : null}
          <select
            value={s.tagFilter}
            onChange={(e) => s.setTagFilter(e.target.value)}
            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2 text-xs font-bold"
            aria-label={t("workspaceWidgets.crmTable.tagFilter")}
          >
            <option value="">{t("workspaceWidgets.crmTable.allTags")}</option>
            {s.allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      </div>

      {s.isAddingClient && (
        <AddClientModal onClose={() => s.setIsAddingClient(false)} onCreated={() => void s.fetchClients()} t={t} />
      )}
      {s.selectedClient && (
        <ClientDetailModal
          client={s.selectedClient}
          isEditing={s.isEditing}
          setIsEditing={s.setIsEditing}
          onChange={s.setSelectedClient}
          onClose={() => {
            s.setSelectedClient(null);
            s.setIsEditing(false);
          }}
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

      <div data-widget-scroll-pane className="flex-1 min-h-0 min-w-0 overflow-auto custom-scrollbar relative">
        <CrmContactsTable
          clients={s.clients}
          loading={s.loading}
          hasMore={s.hasMore}
          loadingMore={s.loadingMore}
          onSelect={(client) => s.setSelectedClient(client)}
          onEdit={(client) => {
            s.setSelectedClient(client);
            s.setIsEditing(true);
          }}
          onDelete={(id, e) => {
            e.stopPropagation();
            s.setDeleteTargetId(id);
          }}
          onLoadMore={() => void s.fetchClients(true)}
          onOpenProjectHub={(client) => s.openProjectHub(client)}
          openWorkspaceWidget={openWorkspaceWidget}
          t={t}
        />
      </div>
    </div>
  );
}
