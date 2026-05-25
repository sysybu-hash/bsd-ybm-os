"use client";

import React from "react";
import { Mail, Phone, Edit3, Trash2, LayoutDashboard, HardHat } from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import type { Client, OpenWorkspaceWidgetFn } from "./types";

type CrmContactsTableProps = {
  clients: Client[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (client: Client) => void;
  onEdit: (client: Client) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onLoadMore: () => void;
  onOpenProjectHub: (client: Client) => void;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
  t: (key: string) => string;
};

export function CrmContactsTable({
  clients,
  loading,
  hasMore,
  loadingMore,
  onSelect,
  onEdit,
  onDelete,
  onLoadMore,
  onOpenProjectHub,
  openWorkspaceWidget,
  t,
}: CrmContactsTableProps) {
  return (
    <>
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
            {loading
              ? [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-12 bg-[color:var(--foreground-muted)]/10 rounded-xl w-full" />
                    </td>
                  </tr>
                ))
              : clients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => onSelect(client)}
                    className="group hover:bg-[color:var(--foreground-muted)]/5 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-xs font-bold border border-[color:var(--border-main)] text-[color:var(--foreground-main)]">
                          {client.name?.charAt(0)}
                        </div>
                        <div className="font-bold text-[color:var(--foreground-main)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {client.name}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                          client.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : client.status === "lead"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[11px] text-[color:var(--foreground-main)] opacity-80">
                          <Mail size={12} className="text-[color:var(--foreground-muted)]" />{" "}
                          {client.email || "---"}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[color:var(--foreground-main)] opacity-80">
                          <Phone size={12} className="text-[color:var(--foreground-muted)]" />{" "}
                          {client.phone || "---"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-[color:var(--foreground-muted)]/10 flex items-center justify-center text-xs font-bold text-[color:var(--foreground-main)] border border-[color:var(--border-main)]">
                            {client.totalProjects}
                          </div>
                          <span className="text-[10px] text-[color:var(--foreground-muted)] font-bold uppercase">
                            פרויקטים
                          </span>
                        </div>
                        {client.projectName ? (
                          <span
                            className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 truncate max-w-[12rem]"
                            title={client.projectName}
                          >
                            {client.projectName}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[11px] text-[color:var(--foreground-main)] opacity-70 font-medium">
                        {new Date(client.lastContact).toLocaleDateString("he-IL")}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {openWorkspaceWidget ? (
                          <button
                            type="button"
                            title={t("workspaceWidgets.crmTable.openFieldCopilot")}
                            aria-label={t("workspaceWidgets.crmTable.openFieldCopilot")}
                            onClick={(e) => {
                              e.stopPropagation();
                              openWorkspaceWidget("fieldCopilot", {
                                contactId: client.id,
                                contactName: client.name,
                                projectId: client.projectId ?? undefined,
                                projectName: client.projectName ?? undefined,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 transition-colors shrink-0"
                          >
                            <HardHat size={12} className="shrink-0" />
                            <span className="hidden sm:inline">
                              {t("workspaceWidgets.crmTable.openFieldCopilot")}
                            </span>
                          </button>
                        ) : null}
                        {client.projectId && openWorkspaceWidget ? (
                          <button
                            type="button"
                            title={t("workspaceWidgets.crmTable.openControlCenter")}
                            aria-label={t("workspaceWidgets.crmTable.openControlCenter")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenProjectHub(client);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors shrink-0"
                          >
                            <LayoutDashboard size={12} className="shrink-0" />
                            <span className="hidden sm:inline">
                              {t("workspaceWidgets.crmTable.openControlCenter")}
                            </span>
                          </button>
                        ) : null}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(client);
                            }}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => onDelete(client.id, e)}
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
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-auto my-4 block rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/80 px-6 py-2 text-sm font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--foreground-muted)]/10 disabled:opacity-50"
        >
          {loadingMore ? t("workspaceWidgets.crmTable.loading") : "טען עוד"}
        </button>
      )}

      {!loading && clients.length === 0 && (
        <WidgetState variant="empty" message={t("workspaceWidgets.crmTable.empty")} />
      )}
    </>
  );
}
