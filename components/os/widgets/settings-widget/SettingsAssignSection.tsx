"use client";

import React from "react";
import { Loader2, UserPlus } from "lucide-react";

type AssignRole = { value: string; label: string };

type SettingsAssignSectionProps = {
  assignEmail: string;
  setAssignEmail: (v: string) => void;
  assignRole: string;
  setAssignRole: (v: string) => void;
  assignRoles: AssignRole[];
  assigning: boolean;
  onAssign: () => void;
  t: (key: string) => string;
};

const S = "workspaceWidgets.settings";

export function SettingsAssignSection({
  assignEmail, setAssignEmail, assignRole, setAssignRole,
  assignRoles, assigning, onAssign, t,
}: SettingsAssignSectionProps) {
  return (
    <section className="pt-6 border-t border-[color:var(--border-main)]/30">
      <div className="flex items-center gap-2 mb-6">
        <UserPlus size={18} className="text-amber-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.assignSection`)}
        </h3>
      </div>
      <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
        {t(`${S}.assignIntro`)}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="space-y-2 md:col-span-1">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.assignEmail`)}</label>
          <input
            type="email"
            value={assignEmail}
            onChange={(e) => setAssignEmail(e.target.value)}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
            placeholder="user@example.com"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--foreground-muted)] pr-1">{t(`${S}.assignRole`)}</label>
          <select
            value={assignRole}
            onChange={(e) => setAssignRole(e.target.value)}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-[color:var(--foreground-main)]"
          >
            {assignRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <button
            type="button"
            onClick={onAssign}
            disabled={assigning}
            className="w-full md:w-auto bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
          >
            {assigning ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
            {t(`${S}.assignSubmit`)}
          </button>
        </div>
      </div>
    </section>
  );
}
