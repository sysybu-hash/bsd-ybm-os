"use client";

import React from "react";
import { Mail, Phone, Save } from "lucide-react";
import { formatCurrencyILS, formatShortDate } from "@/lib/ui-formatters";
import type { Client, ProjectOption, OpenWorkspaceWidgetFn } from "./types";
import { DOC_STATUS_LABELS, issuedDocumentDescription, issuedDocumentStatusClass } from "./constants";

type CrmSyncStatus = "unlinked" | "syncing" | "synced" | "linked";

type Props = {
  client: Client;
  isEditing: boolean;
  tagsString: string;
  crmSyncStatus: CrmSyncStatus;
  projectOptions: ProjectOption[];
  savingProject: boolean;
  creatingProject: boolean;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
  t: (key: string) => string;
  onChange: (updated: Client) => void;
  onSave: () => Promise<void>;
  onSaveProject: (projectId: string | null) => Promise<void>;
  onCreateProject: () => Promise<void>;
  onOpenProjectHub: () => void;
};

export function ClientDetailsSection({
  client, isEditing, tagsString, crmSyncStatus, projectOptions,
  savingProject, creatingProject, openWorkspaceWidget, t,
  onChange, onSave, onSaveProject, onCreateProject, onOpenProjectHub,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
      {/* Left col — contact + save */}
      <div className="space-y-8 md:col-span-1">
        <section>
          <h4 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t("workspaceWidgets.crmTable.contactDetails")}</h4>
          <div className="space-y-4">
            {(["email", "phone"] as const).map((field) => (
              <div key={field} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                <label className="mb-1 block text-[9px] font-bold uppercase text-slate-500">
                  {t(`workspaceWidgets.crmTable.${field}Label`)}
                </label>
                {isEditing ? (
                  <input className="w-full border-b border-emerald-500/50 bg-transparent py-1 text-sm focus:outline-none"
                    value={client[field] || ""}
                    onChange={(e) => onChange({ ...client, [field]: e.target.value })} />
                ) : (
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-200">
                    {field === "email" ? <Mail size={14} className="text-slate-400" /> : <Phone size={14} className="text-slate-400" />}
                    {client[field] || t(`workspaceWidgets.crmTable.no${field.charAt(0).toUpperCase()}${field.slice(1)}`)}
                  </div>
                )}
              </div>
            ))}
            {isEditing ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                <label className="mb-1 block text-[9px] font-bold uppercase text-slate-500">{t("workspaceWidgets.crmTable.tagsLabel")}</label>
                <input className="w-full border-b border-emerald-500/50 bg-transparent py-1 text-sm focus:outline-none"
                  value={tagsString} placeholder={t("workspaceWidgets.crmTable.tagsPlaceholder")}
                  onChange={(e) => onChange({ ...client, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
            ) : null}
          </div>
        </section>
        {isEditing && (
          <button type="button" onClick={() => void onSave()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--accent)] font-black text-white shadow-xl shadow-emerald-900/20 transition-all hover:bg-emerald-500">
            <Save size={18} /> {t("workspaceWidgets.crmTable.saveChanges")}
          </button>
        )}
      </div>

      {/* Right col — project + financial */}
      <div className="space-y-8 md:col-span-2">
        <section>
          <h4 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t("workspaceWidgets.crmTable.linkedProject")}</h4>
          <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[9px] font-bold uppercase text-slate-500">{t("workspaceWidgets.crmTable.selectProject")}</label>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold" title={t("workspaceWidgets.crmTable.syncStatusHint")}>
                <span className={`h-2 w-2 rounded-full ${crmSyncStatus === "syncing" ? "animate-pulse bg-amber-400" : crmSyncStatus === "synced" ? "bg-emerald-500" : crmSyncStatus === "linked" ? "bg-sky-500" : "bg-slate-400"}`} />
                {crmSyncStatus === "syncing" ? t("workspaceWidgets.crmTable.syncSyncing") : crmSyncStatus === "synced" ? t("workspaceWidgets.crmTable.syncSynced") : crmSyncStatus === "linked" ? t("workspaceWidgets.crmTable.syncLinked") : t("workspaceWidgets.crmTable.syncUnlinked")}
              </span>
            </div>
            <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-black/20"
              value={client.projectId ?? ""} disabled={savingProject} onChange={(e) => void onSaveProject(e.target.value || null)}>
              <option value="">{t("workspaceWidgets.crmTable.noProject")}</option>
              {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={creatingProject} onClick={() => void onCreateProject()}
                className="rounded-xl bg-[color:var(--accent)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {creatingProject ? t("workspaceWidgets.crmTable.creatingProject") : t("workspaceWidgets.crmTable.newProject")}
              </button>
              {client.projectId && openWorkspaceWidget ? (
                <button type="button" onClick={onOpenProjectHub}
                  className="rounded-xl border border-[color:var(--accent)]/40 bg-[color:var(--accent-soft)] px-3 py-2 text-xs font-bold text-[color:var(--accent)] dark:text-emerald-300">
                  {t("workspaceWidgets.crmTable.openControlCenter")}
                </button>
              ) : null}
            </div>
            {client.projectName ? (
              <p className="text-xs text-slate-600 dark:text-slate-300">{t("workspaceWidgets.crmTable.linkedTo")}: <span className="font-bold">{client.projectName}</span></p>
            ) : (
              <p className="text-xs text-slate-500">{t("workspaceWidgets.crmTable.noLinkedProject")}</p>
            )}
          </div>
        </section>

        <section>
          <h4 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t("workspaceWidgets.crmTable.financialHistory")}</h4>
          <div className="min-w-0 overflow-x-auto rounded-[2rem] border border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5">
            <table className="w-full min-w-[480px] text-start text-xs">
              <thead>
                <tr className="bg-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:bg-white/5">
                  <th className="px-6 py-3">{t("workspaceWidgets.crmTable.colDate")}</th>
                  <th className="px-6 py-3">{t("workspaceWidgets.crmTable.colDescription")}</th>
                  <th className="px-6 py-3">{t("workspaceWidgets.crmTable.colAmount")}</th>
                  <th className="px-6 py-3">{t("workspaceWidgets.crmTable.colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {client.issuedDocuments.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center font-medium text-slate-500 dark:text-slate-400">{t("workspaceWidgets.crmTable.noFinancialDocs")}</td></tr>
                ) : client.issuedDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-6 py-4 font-medium text-slate-500">{doc.date ? formatShortDate(doc.date) : "—"}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-200">{issuedDocumentDescription(doc)}</td>
                    <td className="px-6 py-4 font-black text-[color:var(--accent)] dark:text-emerald-400">{formatCurrencyILS(doc.total)}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-[4px] px-2 py-0.5 text-[9px] font-bold ${issuedDocumentStatusClass(doc.status)}`}>
                        {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
