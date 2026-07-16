"use client";

import React from "react";
import { Loader2, Save } from "lucide-react";
import { AUTOMATION_CATALOG } from "@/lib/os-automations/catalog";
import { CONSTRUCTION_TRADE_IDS, constructionTradeLabelHe } from "@/lib/construction-trades";
import type { PlatformConfig } from "@/lib/platform-settings";

const FEATURE_FLAG_LABELS: Record<
  keyof PlatformConfig["featureFlags"],
  { label: string; hint?: string }
> = {
  meckanoGlobal: { label: "Meckano גלובלי" },
  geminiLiveEnabled: { label: "Gemini Live" },
  driveSyncDefault: { label: "Drive sync ברירת מחדל" },
  knowledgeVaultEnabled: { label: "מאגר ידע (Knowledge Vault)" },
  aiChatLiveDefault: { label: "Live כברירת מחדל ב-AI Chat" },
  geminiLiveAdvancedFeatures: {
    label: "Gemini Live מתקדם (proactiveAudio + affectiveDialog)",
    hint: "מאפשר affectiveDialog, proactiveAudio ו-session resumption בהגדרות Live",
  },
  fieldCopilotEnabled: { label: "קופיילוט שטח" },
};

type SettingsTabProps = {
  platformConfig: PlatformConfig;
  setPlatformConfig: (v: PlatformConfig) => void;
  savingSettings: boolean;
  onSave: () => void;
};

export function SettingsTab({ platformConfig, setPlatformConfig, savingSettings, onSave }: SettingsTabProps) {
  return (
    <div className="max-w-2xl space-y-4">
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={platformConfig.maintenanceMode}
          onChange={(e) => setPlatformConfig({ ...platformConfig, maintenanceMode: e.target.checked })} />
        מצב תחזוקה
      </label>
      <textarea value={platformConfig.maintenanceMessage}
        onChange={(e) => setPlatformConfig({ ...platformConfig, maintenanceMessage: e.target.value })}
        placeholder="הודעת תחזוקה" rows={2}
        className="w-full rounded-xl border border-[color:var(--border-main)] p-3 text-sm" />
      <label className="flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={platformConfig.registrationOpen}
          onChange={(e) => setPlatformConfig({ ...platformConfig, registrationOpen: e.target.checked })} />
        הרשמה פתוחה
      </label>
      <label className="block text-xs font-bold">
        מקצוע ברירת מחדל להרשמה
        <select value={platformConfig.defaultConstructionTrade}
          onChange={(e) => setPlatformConfig({ ...platformConfig, defaultConstructionTrade: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm">
          {CONSTRUCTION_TRADE_IDS.map((id) => <option key={id} value={id}>{constructionTradeLabelHe(id)}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-bold">
          ימי ניסיון
          <input type="number" value={platformConfig.defaultTrialDays}
            onChange={(e) => setPlatformConfig({ ...platformConfig, defaultTrialDays: Number(e.target.value) || 30 })}
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm" />
        </label>
        <label className="text-xs font-bold">
          סריקות ניסיון
          <input type="number" value={platformConfig.defaultTrialScans}
            onChange={(e) => setPlatformConfig({ ...platformConfig, defaultTrialScans: Number(e.target.value) || 30 })}
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm" />
        </label>
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">דגלי תכונות</p>
      {(Object.keys(FEATURE_FLAG_LABELS) as Array<keyof PlatformConfig["featureFlags"]>).map((flag) => (
        <label key={flag} className="flex flex-col gap-0.5 text-sm">
          <span className="flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={platformConfig.featureFlags[flag]}
              onChange={(e) =>
                setPlatformConfig({
                  ...platformConfig,
                  featureFlags: { ...platformConfig.featureFlags, [flag]: e.target.checked },
                })
              }
            />
            {FEATURE_FLAG_LABELS[flag].label}
          </span>
          {FEATURE_FLAG_LABELS[flag].hint ? (
            <span className="pe-6 text-[11px] text-[color:var(--foreground-muted)]">
              {FEATURE_FLAG_LABELS[flag].hint}
            </span>
          ) : null}
        </label>
      ))}
      <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">אוטומציות (כיבוי = חסום)</p>
      <div className="max-h-48 overflow-y-auto rounded-xl border border-[color:var(--border-main)] p-2">
        {AUTOMATION_CATALOG.map((entry) => (
          <label key={entry.id} className="flex items-center gap-2 py-1 text-xs">
            <input type="checkbox" checked={platformConfig.automationEnabled[entry.id] !== false}
              onChange={(e) => setPlatformConfig({ ...platformConfig, automationEnabled: { ...platformConfig.automationEnabled, [entry.id]: e.target.checked } })} />
            {entry.labelHe}
          </label>
        ))}
      </div>
      <button type="button" disabled={savingSettings} onClick={onSave}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">
        {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        שמור הגדרות
      </button>
    </div>
  );
}
