"use client";

import React from "react";
import { X, Edit3, Mail, Phone, Save } from "lucide-react";
import { formatCurrencyILS, formatShortDate } from "@/lib/ui-formatters";
import type { Client, ProjectOption, OpenWorkspaceWidgetFn } from "./types";
import { DOC_STATUS_LABELS, issuedDocumentDescription, issuedDocumentStatusClass } from "./constants";
import { CrmOverlayPortal } from "./CrmOverlayPortal";

type CrmSyncStatus = "unlinked" | "syncing" | "synced" | "linked";

type ClientDetailModalProps = {
  client: Client;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  onChange: (updated: Client) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  projectOptions: ProjectOption[];
  savingProject: boolean;
  creatingProject: boolean;
  crmSyncStatus: CrmSyncStatus;
  onSaveProject: (projectId: string | null) => Promise<void>;
  onCreateProject: () => Promise<void>;
  onOpenProjectHub: () => void;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
  t: (key: string) => string;
};

export function ClientDetailModal({
  client,
  isEditing,
  setIsEditing,
  onChange,
  onClose,
  onSave,
  projectOptions,
  savingProject,
  creatingProject,
  crmSyncStatus,
  onSaveProject,
  onCreateProject,
  onOpenProjectHub,
  openWorkspaceWidget,
  t,
}: ClientDetailModalProps) {
  return (
    <CrmOverlayPortal>
      <div className="my-auto flex w-full max-w-4xl max-h-[min(90vh,calc(100vh-2rem))] shrink-0 flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] shadow-2xl">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 dark:border-white/5 flex justify-between items-start">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-3xl font-black text-white shadow-xl">
              {client.name?.charAt(0)}
            </div>
            <div>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">{client.name}</h3>
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  client.status === "active"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : client.status === "lead"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                }`}
              >
                {client.status}
              </span>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`p-3 rounded-2xl transition-all ${
                isEditing
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
              }`}
            >
              <Edit3 size={20} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-2xl text-slate-500 transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Contact details column */}
            <div className="md:col-span-1 space-y-8">
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">פרטי התקשרות</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">אימייל</label>
                    {isEditing ? (
                      <input
                        className="w-full bg-transparent border-b border-emerald-500/50 focus:outline-none text-sm py-1"
                        value={client.email || ""}
                        onChange={(e) => onChange({ ...client, email: e.target.value })}
                      />
                    ) : (
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                        <Mail size={14} className="text-slate-400" /> {client.email || "אין אימייל"}
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">טלפון</label>
                    {isEditing ? (
                      <input
                        className="w-full bg-transparent border-b border-emerald-500/50 focus:outline-none text-sm py-1"
                        value={client.phone || ""}
                        onChange={(e) => onChange({ ...client, phone: e.target.value })}
                      />
                    ) : (
                      <div className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                        <Phone size={14} className="text-slate-400" /> {client.phone || "אין טלפון"}
                      </div>
                    )}
                  </div>
                </div>
              </section>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => void onSave()}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={18} /> שמור שינויים
                </button>
              )}
            </div>

            {/* Project + financials column */}
            <div className="md:col-span-2 space-y-8">
              {/* Project assignment */}
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">פרויקט משויך</h4>
                <div className="space-y-3 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">בחר פרויקט</label>
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
                    value={client.projectId ?? ""}
                    disabled={savingProject}
                    onChange={(e) => void onSaveProject(e.target.value || null)}
                  >
                    <option value="">ללא פרויקט</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={creatingProject}
                      onClick={() => void onCreateProject()}
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {creatingProject ? "יוצר…" : "פרויקט חדש"}
                    </button>
                    {client.projectId && openWorkspaceWidget ? (
                      <button
                        type="button"
                        onClick={onOpenProjectHub}
                        className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                      >
                        {t("workspaceWidgets.crmTable.openControlCenter")}
                      </button>
                    ) : null}
                  </div>
                  {client.projectName ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      מקושר ל: <span className="font-bold">{client.projectName}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">אין פרויקט משויך</p>
                  )}
                </div>
              </section>

              {/* Financial history */}
              <section>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                  היסטוריה פיננסית (כרטסת)
                </h4>
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
                      {client.issuedDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400 font-medium">
                            אין מסמכים פיננסיים ללקוח זה
                          </td>
                        </tr>
                      ) : (
                        client.issuedDocuments.map((doc) => (
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
                              <span className={`px-2 py-0.5 rounded-[4px] text-[9px] font-bold ${issuedDocumentStatusClass(doc.status)}`}>
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
  );
}
