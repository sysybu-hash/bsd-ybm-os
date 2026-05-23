"use client";

import React from "react";
import { Building2, Globe, Hash, Mail } from "lucide-react";
import type { OrgSettings } from "./useSettingsWidget";

type SettingsBusinessProfileProps = {
  settings: OrgSettings;
  onChange: (patch: Partial<OrgSettings>) => void;
  t: (key: string) => string;
};

const S = "workspaceWidgets.settings";

export function SettingsBusinessProfile({ settings, onChange, t }: SettingsBusinessProfileProps) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <Building2 size={18} className="text-indigo-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.businessProfile`)}
        </h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.businessName`)}</label>
          <div className="relative">
            <Building2 className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
            <input
              value={settings.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
              placeholder={t(`${S}.businessNamePlaceholder`)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.taxId`)}</label>
          <div className="relative">
            <Hash className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
            <input
              value={settings.taxId}
              onChange={(e) => onChange({ taxId: e.target.value })}
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
              placeholder={t(`${S}.taxIdPlaceholder`)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.vatRate`)}</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={settings.vatRatePercent}
            onChange={(e) =>
              onChange({ vatRatePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
            }
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
          />
          <p className="text-[10px] text-[color:var(--foreground-muted)] pr-1">{t(`${S}.vatHint`)}</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.notificationEmail`)}</label>
          <div className="relative">
            <Mail className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
            <input
              value={settings.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
              placeholder="your@email.com"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.website`)}</label>
          <div className="relative">
            <Globe className="absolute right-3 top-3 text-[color:var(--foreground-muted)]" size={16} />
            <input
              value={settings.website}
              onChange={(e) => onChange({ website: e.target.value })}
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
              placeholder="www.example.com"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
