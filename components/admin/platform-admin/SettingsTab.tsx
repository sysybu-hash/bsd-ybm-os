"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import { CONSTRUCTION_TRADE_IDS } from "@/lib/construction-trades";
import { INDUSTRY_CONFIGS, type IndustryType } from "@/lib/professions/config";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { PlatformConfig } from "@/lib/platform-settings";
import {
  NumberField,
  Section,
  SelectField,
  ToggleRow,
} from "@/components/admin/platform-admin/SettingsControls";
import { AutomationsPanel } from "@/components/admin/platform-admin/AutomationsPanel";

type FlagKey = keyof PlatformConfig["featureFlags"];

/** Feature flags in display order. `requires` greys out the row until its parent flag is on. */
const FEATURE_FLAGS: Array<{
  key: FlagKey;
  labelKey: string;
  hintKey: string;
  requires?: FlagKey;
}> = [
  { key: "meckanoGlobal", labelKey: "flagMeckanoGlobal", hintKey: "flagMeckanoGlobalHint" },
  { key: "geminiLiveEnabled", labelKey: "flagGeminiLive", hintKey: "flagGeminiLiveHint" },
  {
    key: "aiChatLiveDefault",
    labelKey: "flagAiChatLive",
    hintKey: "flagAiChatLiveHint",
    requires: "geminiLiveEnabled",
  },
  {
    key: "geminiLiveAdvancedFeatures",
    labelKey: "flagGeminiLiveAdvanced",
    hintKey: "flagGeminiLiveAdvancedHint",
    requires: "geminiLiveEnabled",
  },
  { key: "driveSyncDefault", labelKey: "flagDriveSync", hintKey: "flagDriveSyncHint" },
  {
    key: "knowledgeVaultEnabled",
    labelKey: "flagKnowledgeVault",
    hintKey: "flagKnowledgeVaultHint",
  },
  { key: "fieldCopilotEnabled", labelKey: "flagFieldCopilot", hintKey: "flagFieldCopilotHint" },
];

type SettingsTabProps = {
  platformConfig: PlatformConfig;
  setPlatformConfig: (v: PlatformConfig) => void;
  savingSettings: boolean;
  onSave: () => void;
};

export function SettingsTab({
  platformConfig,
  setPlatformConfig,
  savingSettings,
  onSave,
}: SettingsTabProps) {
  const { t, locale } = useI18n();
  /** Scoped translator for this tab's namespace. */
  const ts = (suffix: string, params?: Record<string, string>) =>
    t(`platformAdmin.settings.${suffix}`, params);

  const industryOptions = (Object.keys(INDUSTRY_CONFIGS) as IndustryType[]).map((id) => ({
    id,
    label: t(`professions.${id}.label`),
  }));
  const tradeOptions = CONSTRUCTION_TRADE_IDS.map((id) => ({
    id,
    label: t(`constructionTradeLabels.${id}`),
  }));

  const patch = (p: Partial<PlatformConfig>) => setPlatformConfig({ ...platformConfig, ...p });
  const patchFlag = (flag: FlagKey, value: boolean) =>
    patch({ featureFlags: { ...platformConfig.featureFlags, [flag]: value } });

  const maintenance = platformConfig.maintenanceMode;

  /**
   * Dirty tracking: snapshot on mount, re-snapshot once a save finishes.
   *
   * The snapshot is state, not a ref. `isDirty` decides whether the unsaved-
   * changes banner renders, and a ref written from an effect does not trigger a
   * render — so the banner could survive a save until something unrelated
   * re-rendered the tab. Adjusting during render also retires the effect.
   */
  const serialized = JSON.stringify(platformConfig);
  const [savedSnapshot, setSavedSnapshot] = useState(serialized);
  const [wasSaving, setWasSaving] = useState(savingSettings);
  if (savingSettings !== wasSaving) {
    setWasSaving(savingSettings);
    if (wasSaving && !savingSettings) setSavedSnapshot(serialized);
  }
  const isDirty = serialized !== savedSnapshot;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4" dir="auto">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black">
          <SettingsIcon size={20} aria-hidden />
          {ts("title")}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{ts("subtitle")}</p>
      </div>

      {/* Maintenance — status card, colour reflects live/blocked state */}
      <div
        className={`rounded-2xl border p-4 ${
          maintenance
            ? "border-rose-500/40 bg-rose-500/10"
            : "border-emerald-500/40 bg-emerald-500/10"
        }`}
      >
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="flex items-center gap-2 text-base font-black">
              {maintenance ? (
                <AlertTriangle size={18} aria-hidden />
              ) : (
                <ShieldCheck size={18} aria-hidden />
              )}
              {maintenance ? ts("maintenanceOn") : ts("maintenanceOff")}
            </span>
            <span className="mt-0.5 block text-xs text-[color:var(--foreground-muted)]">
              {maintenance ? ts("maintenanceOnHint") : ts("maintenanceOffHint")}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 accent-rose-600"
            checked={maintenance}
            onChange={(e) => patch({ maintenanceMode: e.target.checked })}
          />
        </label>
        {maintenance ? (
          <label className="mt-3 block">
            <span className="text-xs font-bold">{ts("maintenanceMessageLabel")}</span>
            <textarea
              value={platformConfig.maintenanceMessage}
              onChange={(e) => patch({ maintenanceMessage: e.target.value })}
              placeholder={ts("maintenanceMessagePlaceholder")}
              rows={2}
              className="mt-1 w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-3 text-sm"
            />
          </label>
        ) : null}
      </div>

      <Section icon={<UserPlus size={16} aria-hidden />} title={ts("accessTitle")}>
        <div className="space-y-3">
          <ToggleRow
            label={ts("registrationOpen")}
            hint={ts("registrationOpenHint")}
            checked={platformConfig.registrationOpen}
            onChange={(v) => patch({ registrationOpen: v })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={ts("industryLabel")}
              hint={ts("industryHint")}
              value={platformConfig.defaultIndustryForRegistration}
              options={industryOptions}
              onChange={(v) => patch({ defaultIndustryForRegistration: v })}
            />
            <SelectField
              label={ts("tradeLabel")}
              hint={ts("tradeHint")}
              value={platformConfig.defaultConstructionTrade}
              options={tradeOptions}
              onChange={(v) => patch({ defaultConstructionTrade: v })}
            />
          </div>
        </div>
      </Section>

      <Section icon={<Sparkles size={16} aria-hidden />} title={ts("trialTitle")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label={ts("trialDays")}
            hint={ts("trialDaysHint")}
            value={platformConfig.defaultTrialDays}
            min={1}
            max={365}
            fallback={30}
            onChange={(v) => patch({ defaultTrialDays: v })}
          />
          <NumberField
            label={ts("trialScans")}
            hint={ts("trialScansHint")}
            value={platformConfig.defaultTrialScans}
            min={0}
            max={10_000}
            fallback={30}
            onChange={(v) => patch({ defaultTrialScans: v })}
          />
        </div>
      </Section>

      <Section
        icon={<Zap size={16} aria-hidden />}
        title={ts("flagsTitle")}
        subtitle={ts("flagsSubtitle")}
      >
        <div className="space-y-2">
          {FEATURE_FLAGS.map((flag) => {
            const blocked = flag.requires ? !platformConfig.featureFlags[flag.requires] : false;
            return (
              <ToggleRow
                key={flag.key}
                label={ts(flag.labelKey)}
                hint={blocked ? ts("requiresGeminiLive") : ts(flag.hintKey)}
                checked={Boolean(platformConfig.featureFlags[flag.key]) && !blocked}
                disabled={blocked}
                onChange={(v) => patchFlag(flag.key, v)}
              />
            );
          })}
        </div>
      </Section>

      <AutomationsPanel
        automationEnabled={platformConfig.automationEnabled}
        onChange={(next) => patch({ automationEnabled: next })}
        t={ts}
        locale={locale}
      />

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/95 px-1 py-3 backdrop-blur">
        {isDirty ? (
          <p className="me-auto flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
            <AlertTriangle size={14} aria-hidden />
            {ts("unsaved")}
          </p>
        ) : null}
        <button
          type="button"
          disabled={savingSettings}
          onClick={onSave}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {savingSettings ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Save size={16} aria-hidden />
          )}
          {savingSettings ? ts("saving") : ts("save")}
        </button>
      </div>
    </div>
  );
}
