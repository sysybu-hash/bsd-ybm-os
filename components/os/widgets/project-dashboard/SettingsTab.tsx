"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { DashboardData } from "./types";

type SettingsTabProps = {
  data: DashboardData;
  resolvedId: string;
  refresh: () => Promise<void>;
  t: (key: string) => string;
};

export function SettingsTab({ data, resolvedId, refresh, t }: SettingsTabProps) {
  const [status, setStatus] = useState(data.status);
  const [budget, setBudget] = useState(String(data.budget));
  const [primaryContactId, setPrimaryContactId] = useState(data.primaryContactId ?? "");
  const [autoSyncCrm, setAutoSyncCrm] = useState(data.autoSyncCrm);
  const [crmContacts, setCrmContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  // Sync when data changes (e.g. after refresh)
  useEffect(() => {
    setStatus(data.status);
    setBudget(String(data.budget));
    setPrimaryContactId(data.primaryContactId ?? "");
    setAutoSyncCrm(data.autoSyncCrm);
  }, [data]);

  // Load CRM contacts on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/crm/contacts?take=200", { credentials: "include" });
        const json = await res.json();
        if (!res.ok) return;
        const list = Array.isArray(json.contacts) ? json.contacts : json.items ?? [];
        setCrmContacts(list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <form
      className="max-w-md space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(resolvedId)}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status,
              budget: Number(budget) || 0,
              primaryContactId: primaryContactId || null,
              autoSyncCrm,
            }),
          });
          if (!res.ok) {
            toast.error(t("projectDashboard.errors.saveSettings"));
            return;
          }
          toast.success(t("projectDashboard.settingsSaved"));
          await refresh();
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="block text-xs">
        <span className="text-[color:var(--foreground-muted)]">
          {t("projectDashboard.settingsStatus")}
        </span>
        <input
          className={`${osFieldClassName} mt-1 w-full`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        <span className="text-[color:var(--foreground-muted)]">
          {t("projectDashboard.settingsBudget")}
        </span>
        <input
          type="number"
          min={0}
          className={`${osFieldClassName} mt-1 w-full`}
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        <span className="text-[color:var(--foreground-muted)]">
          {t("projectDashboard.settingsPrimaryContact")}
        </span>
        <select
          className={`${osFieldClassName} mt-1 w-full`}
          value={primaryContactId}
          onChange={(e) => setPrimaryContactId(e.target.value)}
        >
          <option value="">{t("projectDashboard.noPrimaryContact")}</option>
          {crmContacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={autoSyncCrm}
          onChange={(e) => setAutoSyncCrm(e.target.checked)}
        />
        {t("projectDashboard.settingsAutoSyncCrm")}
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {saving ? t("projectDashboard.saving") : t("projectDashboard.saveSettings")}
      </button>
    </form>
  );
}
