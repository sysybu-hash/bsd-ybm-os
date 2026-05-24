"use client";

import React from "react";
import {
  ArrowRight,
  Bell,
  BellOff,
  BookOpen,
  FolderOpen,
  Loader2,
  Scan,
  Upload,
} from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { TabId, DashboardData } from "./types";

type Tab = { id: TabId; label: string; icon: typeof BookOpen };

type DashboardHeaderProps = {
  t: (key: string) => string;
  data: DashboardData;
  resolvedId: string;
  isCompanyMgmt: boolean;
  pushEnabled: boolean;
  uploadingBlueprint: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  activeTab: TabId;
  tabs: Tab[];
  setActiveTab: (id: TabId) => void;
  clearProjectSelection: () => void;
  togglePush: () => void;
  onBlueprintFile: (file: File) => void;
  openWorkspaceWidget?: ((type: WidgetType, data?: Record<string, unknown> | null) => void) | null;
};

export function DashboardHeader({
  t, data, resolvedId, isCompanyMgmt, pushEnabled, uploadingBlueprint,
  fileRef, activeTab, tabs, setActiveTab,
  clearProjectSelection, togglePush, onBlueprintFile, openWorkspaceWidget,
}: DashboardHeaderProps) {
  return (
    <header className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">{data.name}</h2>
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {data.client ?? t("projectDashboard.noClient")} · {data.status}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={clearProjectSelection}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
          >
            <ArrowRight size={14} aria-hidden />
            {t("projectDashboard.switchProject")}
          </button>
          <button
            type="button"
            onClick={togglePush}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
            title={t("projectDashboard.pushToggle")}
          >
            {pushEnabled ? <Bell size={14} /> : <BellOff size={14} />}
            <span className="sr-only">{t("projectDashboard.pushToggle")}</span>
            {t("projectDashboard.pushToggle")}
          </button>
          <p className="w-full text-[10px] text-[color:var(--foreground-muted)]">
            {t("projectDashboard.pushNote")}
          </p>
          {!isCompanyMgmt ? (
            <>
              <input
                ref={fileRef as React.RefObject<HTMLInputElement>}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onBlueprintFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploadingBlueprint}
                onClick={() => (fileRef.current as HTMLInputElement | null)?.click()}
                className="flex items-center gap-1 rounded-lg bg-amber-600/90 px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                {uploadingBlueprint ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {t("projectDashboard.uploadBlueprint")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {openWorkspaceWidget && resolvedId ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {!isCompanyMgmt ? (
            <button
              type="button"
              onClick={() => openWorkspaceWidget("aiScanner", { projectId: resolvedId, scanMode: "DRAWING_BOQ" })}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
            >
              <Scan size={12} aria-hidden /> סורק AI
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => openWorkspaceWidget("notebookLM", { projectId: resolvedId, title: data.name })}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
          >
            <BookOpen size={12} aria-hidden /> מחברת
          </button>
          <button
            type="button"
            onClick={() => openWorkspaceWidget("googleDrive", { projectId: resolvedId })}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
          >
            <FolderOpen size={12} aria-hidden /> Drive
          </button>
          <button
            type="button"
            onClick={() => openWorkspaceWidget("crmTable", null)}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold"
          >
            CRM
          </button>
        </div>
      ) : null}

      <div className="mt-2 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                activeTab === tab.id
                  ? "bg-amber-500/20 text-amber-200"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
              }`}
            >
              <Icon size={12} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
