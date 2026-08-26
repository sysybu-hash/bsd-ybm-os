"use client";

import React from "react";
import { Users, UserPlus, Download, Hash, Upload, RefreshCw, Sparkles } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import WidgetState from "@/components/os/WidgetState";
import { OsButton, OsIconButton, OsSearchInput } from "@/components/os/ui";
import type { CrmTableWidgetProps } from "./crm-table/types";
import { useCrmTable } from "./crm-table/useCrmTable";
import { AddClientModal } from "./crm-table/AddClientModal";
import { ClientDetailModal } from "./crm-table/ClientDetailModal";
import { CrmContactsTable } from "./crm-table/CrmContactsTable";
import { CRM_PIPELINE_STATUSES } from "@/lib/crm/pipeline-status";
import { pipelineStatusLabel } from "./crm-table/constants";
import { GoogleImportModal } from "./crm-table/GoogleImportModal";

export type { CrmTableWidgetProps };
export type { OpenWorkspaceWidgetFn } from "./crm-table/types";

export default function CrmTableWidget({ openWorkspaceWidget }: CrmTableWidgetProps) {
  const { dir, t } = useI18n();
  /**
   * Destructured rather than kept as one `s` object.
   *
   * `useCrmTable` returns `fileInputRef` alongside its state, and the React
   * Compiler infers the whole returned object as ref-like because of it — so
   * every `loading` / `clients` read counted as accessing a ref during
   * render, and `react-hooks/refs` reported 43 violations in this one file.
   * Naming the values individually leaves exactly one ref, used the way a ref
   * is meant to be used: handed to `ref=` and read inside an event handler.
   */
  const { allClients, allTags, clients, confirmDeleteClient, creatingProject, crmSyncStatus,
    deleteTargetId, fetchClients, fetchGooglePreview, fileInputRef,
    handleCreateProjectForClient, handleExportCsv, handleGoogleImported, handleImportCSV,
    handleQuickStatusChange, handleUpdateClient, hasMore, isAddingClient, isEditing,
    isExporting, isImporting, loadError, loading, loadingMore, openProjectHub, projectOptions,
    runGoogleImport, saveClientProject, savingProject, searchQuery, selectedClient,
    semanticFallback, semanticMode, setDeleteTargetId, setIsAddingClient, setIsEditing,
    setSearchQuery, setSelectedClient, setSemanticMode, setShowGoogleImport, setStatusFilter,
    setTagFilter, showGoogleImport, statusFilter, tagFilter,
  } = useCrmTable({ openWorkspaceWidget, t });

  if (loading && allClients.length === 0)
    return <WidgetState variant="loading" message={t("workspaceWidgets.crmTable.loading")} />;
  if (loadError && allClients.length === 0)
    return (
      <WidgetState
        variant="error"
        message={loadError}
        onRetry={() => void fetchClients()}
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
        open={deleteTargetId !== null}
        title={t("workspaceWidgets.crmTable.deleteTitle")}
        message={t("workspaceWidgets.crmTable.deleteMessage")}
        destructive
        onConfirm={() => void confirmDeleteClient()}
        onCancel={() => setDeleteTargetId(null)}
      />

      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-[color:var(--accent)] dark:text-emerald-400">
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
            <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleImportCSV} />
            <OsIconButton
              label={t("common.refresh")}
              onClick={() => void fetchClients()}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden />
            </OsIconButton>
            <OsButton
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              icon={isImporting ? <Hash className="animate-spin" size={16} aria-hidden /> : <Upload size={16} aria-hidden />}
            >
              {t("workspaceWidgets.crmTable.importCsv")}
            </OsButton>
            <OsButton
              variant="secondary"
              onClick={() => setShowGoogleImport(true)}
              disabled={isImporting}
              icon={<Download size={16} aria-hidden />}
            >
              {t("workspaceWidgets.crmTable.importGoogle")}
            </OsButton>
            <OsButton
              variant="secondary"
              onClick={() => void handleExportCsv()}
              disabled={isExporting}
              icon={isExporting ? <Hash className="animate-spin" size={16} aria-hidden /> : <Download size={16} aria-hidden />}
            >
              {t("workspaceWidgets.crmTable.exportCsv")}
            </OsButton>
            <OsButton
              variant="primary"
              onClick={() => setIsAddingClient(true)}
              icon={<UserPlus size={16} aria-hidden />}
            >
              {t("workspaceWidgets.crmTable.newClient")}
            </OsButton>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <OsSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            label={t("workspaceWidgets.crmTable.searchPlaceholder")}
            className="flex-1 md:max-w-md"
          />
          <label className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={semanticMode}
              onChange={(e) => setSemanticMode(e.target.checked)}
              className="rounded border-[color:var(--border-main)]"
            />
            <Sparkles size={14} className="text-violet-500" aria-hidden />
            {t("workspaceWidgets.crmTable.semanticSearch")}
          </label>
          {semanticFallback && semanticMode ? (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              {t("workspaceWidgets.crmTable.semanticFallback")}
            </span>
          ) : null}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2 text-xs font-bold"
            aria-label={t("workspaceWidgets.crmTable.statusFilter")}
          >
            <option value="">{t("workspaceWidgets.crmTable.allStatuses")}</option>
            {CRM_PIPELINE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {pipelineStatusLabel(status, t)}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-3 py-2 text-xs font-bold"
            aria-label={t("workspaceWidgets.crmTable.tagFilter")}
          >
            <option value="">{t("workspaceWidgets.crmTable.allTags")}</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isAddingClient && (
        <AddClientModal onClose={() => setIsAddingClient(false)} onCreated={() => void fetchClients()} t={t} />
      )}
      {showGoogleImport && (
        <GoogleImportModal
          onClose={() => setShowGoogleImport(false)}
          onImported={handleGoogleImported}
          t={t}
          fetchPreview={fetchGooglePreview}
          runImport={runGoogleImport}
        />
      )}
      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          onChange={setSelectedClient}
          onClose={() => {
            setSelectedClient(null);
            setIsEditing(false);
          }}
          onSave={handleUpdateClient}
          onQuickStatusChange={handleQuickStatusChange}
          projectOptions={projectOptions}
          savingProject={savingProject}
          creatingProject={creatingProject}
          crmSyncStatus={crmSyncStatus}
          onSaveProject={saveClientProject}
          onCreateProject={handleCreateProjectForClient}
          onOpenProjectHub={() => openProjectHub()}
          openWorkspaceWidget={openWorkspaceWidget}
          t={t}
        />
      )}

      <div data-widget-scroll-pane className="flex-1 min-h-0 min-w-0 overflow-auto custom-scrollbar relative">
        <CrmContactsTable
          clients={clients}
          loading={loading}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onSelect={(client) => setSelectedClient(client)}
          onEdit={(client) => {
            setSelectedClient(client);
            setIsEditing(true);
          }}
          onDelete={(id, e) => {
            e.stopPropagation();
            setDeleteTargetId(id);
          }}
          onLoadMore={() => void fetchClients(true)}
          onOpenProjectHub={(client) => openProjectHub(client)}
          openWorkspaceWidget={openWorkspaceWidget}
          t={t}
        />
      </div>
    </div>
  );
}
