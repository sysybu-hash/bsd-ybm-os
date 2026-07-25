"use client";

import React from "react";
import { Mail, Phone, Edit3, Trash2, LayoutDashboard, HardHat, ChevronRight } from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useMediaQuery } from "@/hooks/use-media-query";
import { intlLocaleForApp } from "@/lib/i18n/intl-locale";
import type { AppLocale } from "@/lib/i18n/config";
import type { Client, OpenWorkspaceWidgetFn } from "./types";

const STATUS_CLASS: Record<string, string> = {
  active: "bg-emerald-500/10 text-[color:var(--accent)] dark:text-emerald-400",
  lead: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};
const STATUS_FALLBACK_CLASS = "bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]";

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
  const { locale } = useI18n();
  const dateLocale = intlLocaleForApp(locale as AppLocale);
  const isMobile = useMediaQuery("(max-width: 639px)");

  if (isMobile) {
    return (
      <>
        <ul className="divide-y divide-[color:var(--border-main)]/30">
          {loading
            ? [1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="animate-pulse px-3 py-3">
                  <div className="h-14 rounded-xl bg-[color:var(--foreground-muted)]/10" />
                </li>
              ))
            : clients.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(client)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-start active:bg-[color:var(--foreground-muted)]/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] text-xs font-bold text-[color:var(--foreground-main)]">
                      {client.name?.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-bold text-[color:var(--foreground-main)]">{client.name}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                            STATUS_CLASS[client.status] ?? STATUS_FALLBACK_CLASS
                          }`}
                        >
                          {client.status}
                        </span>
                      </div>
                      {client.phone ? (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[color:var(--foreground-muted)]">
                          <Phone size={11} aria-hidden />
                          {client.phone}
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight size={16} className="shrink-0 rtl:rotate-180 text-[color:var(--foreground-muted)]" aria-hidden />
                  </button>
                </li>
              ))}
        </ul>

        {hasMore && !loading && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="mx-auto my-4 block rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/80 px-6 py-2 text-sm font-bold text-[color:var(--foreground-main)] hover:bg-[color:var(--foreground-muted)]/10 disabled:opacity-50"
          >
            {loadingMore ? t("workspaceWidgets.crmTable.loading") : t("workspaceWidgets.crmTable.loadMore")}
          </button>
        )}

        {!loading && clients.length === 0 && (
          <WidgetState variant="empty" message={t("workspaceWidgets.crmTable.empty")} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="overflow-x-auto min-w-0">
        <table className="w-full border-collapse min-w-[480px]">
          <thead className="sticky top-0 z-10 bg-[color:var(--background-main)]/80 backdrop-blur-md">
            <tr className="text-start text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-[0.15em] border-b border-[color:var(--border-main)]">
              <th className="px-3 py-3 sm:px-6 sm:py-4">{t("workspaceWidgets.crmTable.columnClient")}</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">{t("workspaceWidgets.crmTable.columnStatus")}</th>
              <th className="hidden px-3 py-3 sm:table-cell sm:px-6 sm:py-4">{t("workspaceWidgets.crmTable.columnContact")}</th>
              <th className="hidden px-3 py-3 md:table-cell md:px-6 md:py-4">{t("workspaceWidgets.crmTable.columnProjects")}</th>
              <th className="hidden px-3 py-3 md:table-cell md:px-6 md:py-4">{t("workspaceWidgets.crmTable.columnLastContact")}</th>
              <th className="px-3 py-3 sm:px-6 sm:py-4">{t("workspaceWidgets.crmTable.columnActions")}</th>
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
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[color:var(--surface-soft)] flex items-center justify-center text-xs font-bold border border-[color:var(--border-main)] text-[color:var(--foreground-main)]">
                          {client.name?.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-[color:var(--foreground-main)] group-hover:text-[color:var(--accent)] dark:group-hover:text-emerald-400 transition-colors">
                            {client.name}
                          </div>
                          {(client.tags ?? []).length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(client.tags ?? []).slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                          STATUS_CLASS[client.status] ?? STATUS_FALLBACK_CLASS
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell sm:px-6 sm:py-4">
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
                    <td className="hidden px-3 py-3 md:table-cell md:px-6 md:py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-[color:var(--foreground-muted)]/10 flex items-center justify-center text-xs font-bold text-[color:var(--foreground-main)] border border-[color:var(--border-main)]">
                            {client.totalProjects}
                          </div>
                          <span className="text-[10px] text-[color:var(--foreground-muted)] font-bold uppercase">
                            {t("workspaceWidgets.crmTable.columnProjects")}
                          </span>
                        </div>
                        {client.projectName ? (
                          <span
                            className="text-[10px] font-bold text-[color:var(--accent)] dark:text-emerald-300 truncate max-w-[12rem]"
                            title={client.projectName}
                          >
                            {client.projectName}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell md:px-6 md:py-4">
                      <div className="text-[11px] text-[color:var(--foreground-main)] opacity-70 font-medium">
                        {new Date(client.lastContact).toLocaleDateString(dateLocale)}
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4">
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
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--accent)]/40 bg-[color:var(--accent-soft)] px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--accent)] dark:text-emerald-300 hover:bg-[color:var(--accent-soft)] transition-colors shrink-0"
                          >
                            <LayoutDashboard size={12} className="shrink-0" />
                            <span className="hidden sm:inline">
                              {t("workspaceWidgets.crmTable.openControlCenter")}
                            </span>
                          </button>
                        ) : null}
                        <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            aria-label={t("workspaceWidgets.itemActions.edit")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(client);
                            }}
                            className="p-2 hover:bg-[color:var(--surface-soft)] rounded-lg text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all"
                          >
                            <Edit3 size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={t("workspaceWidgets.itemActions.delete")}
                            onClick={(e) => onDelete(client.id, e)}
                            className="p-2 hover:bg-rose-500/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-rose-600 dark:hover:text-rose-400 transition-all"
                          >
                            <Trash2 size={14} aria-hidden />
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
          {loadingMore ? t("workspaceWidgets.crmTable.loading") : t("workspaceWidgets.crmTable.loadMore")}
        </button>
      )}

      {!loading && clients.length === 0 && (
        <WidgetState variant="empty" message={t("workspaceWidgets.crmTable.empty")} />
      )}
    </>
  );
}
