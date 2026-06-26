"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Bell,
  BellOff,
  BookOpen,
  ChevronDown,
  FolderOpen,
  Layers,
  Loader2,
  Scan,
  Sparkles,
  Upload,
} from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { TabId, DashboardData } from "./types";
import type { BlueprintEngineRunMode } from "@/lib/projects/blueprint-analyze";

type Tab = { id: TabId; label: string; icon: typeof BookOpen };

type DashboardHeaderProps = {
  t: (key: string) => string;
  data: DashboardData;
  resolvedId: string;
  isCompanyMgmt: boolean;
  hasConstructionPlan: boolean;
  pushEnabled: boolean;
  uploadingBlueprint: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  activeTab: TabId;
  tabs: Tab[];
  setActiveTab: (id: TabId) => void;
  clearProjectSelection: () => void;
  resetWorkspace: () => void;
  togglePush: () => void;
  onBlueprintFile: (file: File) => void;
  blueprintEngineRunMode: BlueprintEngineRunMode;
  setBlueprintEngineRunMode: (m: BlueprintEngineRunMode) => void;
  blueprintInstruction: string;
  setBlueprintInstruction: (v: string) => void;
  openWorkspaceWidget?: ((type: WidgetType, data?: Record<string, unknown> | null) => void) | null;
};

const BLUEPRINT_ENGINE_CHIPS: { id: BlueprintEngineRunMode; label: string; Icon?: typeof Sparkles }[] = [
  { id: "AUTO", label: "אוטומטי", Icon: Sparkles },
  { id: "MULTI_PARALLEL", label: "ריבוי מנועים", Icon: Layers },
  { id: "SINGLE_GEMINI", label: "Gemini" },
  { id: "SINGLE_OPENAI", label: "OpenAI" },
  { id: "SINGLE_ANTHROPIC", label: "Claude" },
];

export function DashboardHeader({
  t, data, resolvedId, isCompanyMgmt, hasConstructionPlan, pushEnabled, uploadingBlueprint,
  fileRef, activeTab, tabs, setActiveTab,
  clearProjectSelection, resetWorkspace, togglePush, onBlueprintFile,
  blueprintEngineRunMode, setBlueprintEngineRunMode,
  blueprintInstruction, setBlueprintInstruction,
  openWorkspaceWidget,
}: DashboardHeaderProps) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [blueprintOptionsOpen, setBlueprintOptionsOpen] = useState(false);

  return (
    <header className="shrink-0 border-b border-[color:var(--border-main)] px-2 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">{data.name}</h2>
          <p className="truncate text-[10px] text-[color:var(--foreground-muted)]">
            {data.client ?? t("projectDashboard.noClient")} · {data.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={clearProjectSelection}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
          >
            <ArrowRight size={12} aria-hidden />
            {t("projectDashboard.switchProject")}
          </button>
          <button
            type="button"
            onClick={resetWorkspace}
            className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)]"
          >
            {t("projectDashboard.resetWorkspace")}
          </button>
          <button
            type="button"
            onClick={togglePush}
            className="rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-[10px]"
            title={t("projectDashboard.pushNote")}
          >
            {pushEnabled ? <Bell size={12} /> : <BellOff size={12} />}
          </button>
          {hasConstructionPlan ? (
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
                onClick={() => setBlueprintOptionsOpen((v) => !v)}
                className="rounded-lg border border-amber-500/50 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300"
                title="הגדרות פענוח גרמושקה"
              >
                <ChevronDown size={12} className={blueprintOptionsOpen ? "rotate-180" : ""} />
              </button>
              <button
                type="button"
                disabled={uploadingBlueprint}
                onClick={() => (fileRef.current as HTMLInputElement | null)?.click()}
                className="flex items-center gap-1 rounded-lg bg-amber-600/90 px-2 py-1 text-[10px] text-white disabled:opacity-50"
              >
                {uploadingBlueprint ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {t("projectDashboard.uploadBlueprint")}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {hasConstructionPlan && blueprintOptionsOpen ? (
        <div className="mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-[10px]">
          <p className="mb-1.5 font-bold text-amber-700 dark:text-amber-300">מנוע פענוח גרמושקה</p>
          <div className="no-scrollbar mb-2 flex gap-1 overflow-x-auto">
            {BLUEPRINT_ENGINE_CHIPS.map((chip) => {
              const active = blueprintEngineRunMode === chip.id;
              const Icon = chip.Icon;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setBlueprintEngineRunMode(chip.id)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                    active
                      ? "border-amber-500/60 bg-amber-500/20 text-amber-700 dark:text-amber-300"
                      : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                  }`}
                >
                  {Icon ? <Icon size={11} aria-hidden /> : null}
                  {chip.label}
                </button>
              );
            })}
          </div>
          <textarea
            rows={2}
            maxLength={800}
            placeholder="הוראות נוספות למנוע: סוג הבניין, יחידת מטבע, התמקד ב..."
            value={blueprintInstruction}
            onChange={(e) => setBlueprintInstruction(e.target.value)}
            className="w-full resize-none rounded-lg border border-[color:var(--border-main)]/60 bg-transparent px-2 py-1.5 text-[10px] placeholder:text-[color:var(--foreground-muted)]/50 focus:border-amber-500/60 focus:outline-none"
          />
        </div>
      ) : null}

      {openWorkspaceWidget && resolvedId ? (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShortcutsOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-bold text-[color:var(--foreground-muted)]"
          >
            <ChevronDown size={12} className={shortcutsOpen ? "rotate-180" : ""} />
            קיצורי דרך
          </button>
          {shortcutsOpen ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {hasConstructionPlan ? (
                <button
                  type="button"
                  onClick={() =>
                    openWorkspaceWidget("documentsHub", {
                      tab: "scan",
                      projectId: resolvedId,
                      scanMode: "DRAWING_BOQ",
                      source: "project",
                    })
                  }
                  className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-0.5 text-[10px] font-bold"
                >
                  <Scan size={10} aria-hidden /> סורק AI
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => openWorkspaceWidget("notebookLM", { projectId: resolvedId, title: data.name })}
                className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-0.5 text-[10px] font-bold"
              >
                <BookOpen size={10} aria-hidden /> מחברת
              </button>
              <button
                type="button"
                onClick={() => openWorkspaceWidget("googleDrive", { projectId: resolvedId })}
                className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-0.5 text-[10px] font-bold"
              >
                <FolderOpen size={10} aria-hidden /> Drive
              </button>
              <button
                type="button"
                onClick={() => openWorkspaceWidget("crmTable", null)}
                className="rounded-lg border border-[color:var(--border-main)] px-2 py-0.5 text-[10px] font-bold"
              >
                CRM
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1.5 flex gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                activeTab === tab.id
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-200"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
              }`}
            >
              <Icon size={11} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
