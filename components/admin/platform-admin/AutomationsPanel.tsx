"use client";

import React, { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { AUTOMATION_CATALOG } from "@/lib/os-automations/catalog";
import { Section } from "@/components/admin/platform-admin/SettingsControls";

type AutomationsPanelProps = {
  /** Map of intent id → enabled. A missing entry counts as enabled. */
  automationEnabled: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  /** Scoped translator — receives a key under `platformAdmin.settings`. */
  t: (suffix: string, params?: Record<string, string>) => string;
};

export function AutomationsPanel({ automationEnabled, onChange, t }: AutomationsPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AUTOMATION_CATALOG;
    return AUTOMATION_CATALOG.filter(
      (e) =>
        e.labelHe.toLowerCase().includes(q) ||
        e.labelEn.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.keywords.some((w) => w.toLowerCase().includes(q)),
    );
  }, [query]);

  const enabledCount = AUTOMATION_CATALOG.filter((e) => automationEnabled[e.id] !== false).length;

  const setAll = (value: boolean) =>
    onChange(Object.fromEntries(AUTOMATION_CATALOG.map((e) => [e.id, value])));

  return (
    <Section
      icon={<Sparkles size={16} aria-hidden />}
      title={t("automationsTitle")}
      subtitle={t("automationsSubtitle")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 my-auto start-3 text-[color:var(--foreground-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("automationsSearch")}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] py-2 pe-3 ps-9 text-sm"
          />
        </span>
        <button
          type="button"
          onClick={() => setAll(true)}
          className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold"
        >
          {t("automationsEnableAll")}
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold"
        >
          {t("automationsDisableAll")}
        </button>
      </div>

      <p className="mb-2 text-xs font-bold text-[color:var(--foreground-muted)]">
        {t("automationsCount", {
          enabled: String(enabledCount),
          total: String(AUTOMATION_CATALOG.length),
        })}
      </p>

      <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[color:var(--border-main)] p-2">
        {filtered.length === 0 ? (
          <p className="p-3 text-center text-xs text-[color:var(--foreground-muted)]">
            {t("automationsEmpty")}
          </p>
        ) : (
          filtered.map((entry) => (
            <label
              key={entry.id}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[color:var(--surface-soft)]"
            >
              <span className="min-w-0 truncate font-bold">{entry.labelHe}</span>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-blue-600"
                checked={automationEnabled[entry.id] !== false}
                onChange={(e) => onChange({ ...automationEnabled, [entry.id]: e.target.checked })}
              />
            </label>
          ))
        )}
      </div>
    </Section>
  );
}
