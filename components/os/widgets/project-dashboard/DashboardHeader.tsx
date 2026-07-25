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
  Scan,
  Sparkles,
  Upload,
} from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { OsButton, OsIconButton } from "@/components/os/ui";
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
  blueprintCustomEngines: string[];
  setBlueprintCustomEngines: (v: string[]) => void;
  blueprintUseOcr: boolean;
  setBlueprintUseOcr: (v: boolean) => void;
  openWorkspaceWidget?: ((type: WidgetType, data?: Record<string, unknown> | null) => void) | null;
};

const BLUEPRINT_ENGINE_CHIPS: { id: BlueprintEngineRunMode; label?: string; labelKey?: string; Icon?: typeof Sparkles }[] = [
  { id: "AUTO", labelKey: "projectDashboard.engineAuto", Icon: Sparkles },
  { id: "MULTI_PARALLEL", labelKey: "projectDashboard.engineMulti", Icon: Layers },
  { id: "CUSTOM_PARALLEL", labelKey: "projectDashboard.engineCustom", Icon: Layers },
  { id: "SINGLE_GEMINI", label: "Gemini" },
  { id: "SINGLE_OPENAI", label: "OpenAI" },
  { id: "SINGLE_ANTHROPIC", label: "Claude" },
  { id: "SINGLE_MISTRAL", label: "Mistral" },
];

const CUSTOM_ENGINE_OPTIONS: { key: string; label: string }[] = [
  { key: "gemini",    label: "Gemini" },
  { key: "openai",   label: "OpenAI" },
  { key: "anthropic", label: "Claude" },
  { key: "mistral",  label: "Mistral" },
];

export function DashboardHeader({
  t, data, resolvedId, isCompanyMgmt, hasConstructionPlan, pushEnabled, uploadingBlueprint,
  fileRef, activeTab, tabs, setActiveTab,
  clearProjectSelection, resetWorkspace, togglePush, onBlueprintFile,
  blueprintEngineRunMode, setBlueprintEngineRunMode,
  blueprintInstruction, setBlueprintInstruction,
  blueprintCustomEngines, setBlueprintCustomEngines,
  blueprintUseOcr, setBlueprintUseOcr,
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
          <OsButton
            variant="secondary"
            size="sm"
            icon={<ArrowRight size={12} aria-hidden />}
            onClick={clearProjectSelection}
          >
            {t("projectDashboard.switchProject")}
          </OsButton>
          <OsButton variant="secondary" size="sm" onClick={resetWorkspace}>
            {t("projectDashboard.resetWorkspace")}
          </OsButton>
          <OsIconButton
            label={t("projectDashboard.pushNote")}
            size="sm"
            active={pushEnabled}
            onClick={togglePush}
          >
            {pushEnabled ? <Bell size={12} aria-hidden /> : <BellOff size={12} aria-hidden />}
          </OsIconButton>
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
              <OsIconButton
                label={t("projectDashboard.blueprintSettings")}
                size="sm"
                active={blueprintOptionsOpen}
                onClick={() => setBlueprintOptionsOpen((v) => !v)}
              >
                <ChevronDown size={12} aria-hidden className={blueprintOptionsOpen ? "rotate-180" : ""} />
              </OsIconButton>
              <OsButton
                variant="primary"
                size="sm"
                loading={uploadingBlueprint}
                icon={<Upload size={12} aria-hidden />}
                onClick={() => (fileRef.current as HTMLInputElement | null)?.click()}
              >
                {t("projectDashboard.uploadBlueprint")}
              </OsButton>
            </>
          ) : null}
        </div>
      </div>

      {hasConstructionPlan && blueprintOptionsOpen ? (
        <div className="mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-[10px]">
          <p className="mb-1.5 font-bold text-amber-700 dark:text-amber-300">{t("projectDashboard.blueprintEngine")}</p>
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
                  {chip.labelKey ? t(chip.labelKey) : chip.label}
                </button>
              );
            })}
          </div>
          {blueprintEngineRunMode === "CUSTOM_PARALLEL" ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {CUSTOM_ENGINE_OPTIONS.map((opt) => {
                const checked = blueprintCustomEngines.includes(opt.key);
                return (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 px-2 py-1 text-[11px] font-bold hover:bg-[color:var(--surface-soft)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setBlueprintCustomEngines(
                          checked
                            ? blueprintCustomEngines.filter((k) => k !== opt.key)
                            : [...blueprintCustomEngines, opt.key],
                        )
                      }
                      className="accent-amber-500"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          ) : null}
          <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 px-2.5 py-1.5 text-[11px] font-bold hover:bg-[color:var(--surface-soft)]">
            <input
              type="checkbox"
              checked={blueprintUseOcr}
              onChange={(e) => setBlueprintUseOcr(e.target.checked)}
              className="accent-amber-500"
            />
            <span>Mistral OCR 4 pre-pass</span>
            <span className="ms-auto font-normal text-[color:var(--foreground-muted)]">{t("projectDashboard.hebrewExtractHint")}</span>
          </label>
          <textarea
            rows={2}
            maxLength={800}
            placeholder={t("projectDashboard.blueprintExtraPrompt")}
            value={blueprintInstruction}
            onChange={(e) => setBlueprintInstruction(e.target.value)}
            className="w-full resize-none rounded-lg border border-[color:var(--border-main)]/60 bg-transparent px-2 py-1.5 text-[10px] placeholder:text-[color:var(--foreground-muted)]/50 focus:border-amber-500/60 focus:outline-none"
          />
        </div>
      ) : null}

      {openWorkspaceWidget && resolvedId ? (
        <div className="mt-1">
          <OsButton
            variant="quiet"
            size="sm"
            className="!px-0 text-[10px] text-[color:var(--foreground-muted)]"
            icon={<ChevronDown size={12} aria-hidden className={shortcutsOpen ? "rotate-180" : ""} />}
            onClick={() => setShortcutsOpen((v) => !v)}
          >
            {t("projectDashboard.shortcuts")}
          </OsButton>
          {shortcutsOpen ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {hasConstructionPlan ? (
                <OsButton
                  variant="secondary"
                  size="sm"
                  className="py-0.5"
                  icon={<Scan size={10} aria-hidden />}
                  onClick={() =>
                    openWorkspaceWidget("documentsHub", {
                      tab: "scan",
                      projectId: resolvedId,
                      scanMode: "DRAWING_BOQ",
                      source: "project",
                    })
                  }
                >
                  {t("projectDashboard.shortcutScanner")}
                </OsButton>
              ) : null}
              <OsButton
                variant="secondary"
                size="sm"
                className="py-0.5"
                icon={<BookOpen size={10} aria-hidden />}
                onClick={() => openWorkspaceWidget("notebookLM", { projectId: resolvedId, title: data.name })}
              >
                {t("projectDashboard.shortcutNotebook")}
              </OsButton>
              <OsButton
                variant="secondary"
                size="sm"
                className="py-0.5"
                icon={<FolderOpen size={10} aria-hidden />}
                onClick={() => openWorkspaceWidget("googleDrive", { projectId: resolvedId })}
              >
                Drive
              </OsButton>
              <OsButton
                variant="secondary"
                size="sm"
                className="py-0.5"
                onClick={() => openWorkspaceWidget("crmTable", null)}
              >
                CRM
              </OsButton>
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
