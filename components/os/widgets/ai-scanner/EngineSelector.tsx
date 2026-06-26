"use client";

import React, { useState } from "react";
import { Sparkles, Layers, Settings2 } from "lucide-react";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { EngineMeta } from "./types";

type EngineSelectorProps = {
  value: TriEngineRunMode;
  onChange: (mode: TriEngineRunMode) => void;
  customEngines?: string[];
  onCustomEnginesChange?: (engines: string[]) => void;
  engineMeta: EngineMeta | null;
  tr: (key: string, fallback: string) => string;
};

type ChipDef = {
  id: TriEngineRunMode;
  label: string;
  /** key into engineMeta.configured; undefined = always available */
  cfg?: keyof EngineMeta["configured"];
  tone: string; // active classes
};

function missingVars(engineMeta: EngineMeta | null, cfg: keyof EngineMeta["configured"] | undefined): string[] {
  if (!cfg || !engineMeta?.missingConfig) return [];
  return engineMeta.missingConfig[cfg] ?? [];
}

/**
 * Clickable engine chips — one compact, horizontally-scrollable row that
 * replaces both the engine dropdown and the old decorative status tiles.
 * "אוטומטי" lets the classifier pick; "ריבוי מנועים" runs every configured
 * engine in parallel; the rest pin a single engine. Unconfigured engines are
 * shown disabled so the user sees the full roster.
 */
const CUSTOM_ENGINE_OPTIONS: { id: string; label: string; cfg: keyof EngineMeta["configured"] }[] = [
  { id: "gemini", label: "Gemini", cfg: "gemini" },
  { id: "openai", label: "OpenAI", cfg: "openai" },
  { id: "anthropic", label: "Claude", cfg: "anthropic" },
  { id: "docai", label: "Document AI", cfg: "documentAI" },
  { id: "mistral", label: "Pixtral", cfg: "mistral" },
];

export function EngineSelector({ value, onChange, customEngines = [], onCustomEnginesChange, engineMeta, tr }: EngineSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const chips: ChipDef[] = [
    { id: "AUTO", label: tr("scanner.modeAuto", "אוטומטי"), tone: "border-indigo-500/50 bg-indigo-500/15 text-[color:var(--accent)] dark:text-indigo-300" },
    { id: "SINGLE_GEMINI", label: "Gemini", cfg: "gemini", tone: "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300" },
    { id: "SINGLE_OPENAI", label: "OpenAI", cfg: "openai", tone: "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    { id: "SINGLE_ANTHROPIC", label: "Claude", cfg: "anthropic", tone: "border-orange-500/50 bg-orange-500/15 text-[color:var(--accent)] dark:text-orange-300" },
    { id: "SINGLE_DOCUMENT_AI", label: "Document AI", cfg: "documentAI", tone: "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300" },
    { id: "SINGLE_MISTRAL", label: "Pixtral", cfg: "mistral", tone: "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    { id: "MULTI_PARALLEL", label: tr("scanner.modeMulti", "ריבוי מנועים"), tone: "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300" },
    { id: "CUSTOM_PARALLEL", label: tr("scanner.modeCustom", "בחירה ידנית"), tone: "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  ];

  return (
    <div className="space-y-2">
    <div
      className="no-scrollbar flex items-center gap-1.5 overflow-x-auto"
      role="group"
      aria-label={tr("scanner.configAi", "מנועים")}
    >
      {chips.map((chip) => {
        const configured = chip.cfg ? Boolean(engineMeta?.configured[chip.cfg]) : true;
        const active = value === chip.id;
        const Icon = chip.id === "AUTO" ? Sparkles : chip.id === "MULTI_PARALLEL" ? Layers : chip.id === "CUSTOM_PARALLEL" ? Settings2 : null;
        const missing = missingVars(engineMeta, chip.cfg);
        const tooltip = configured
          ? chip.label
          : missing.length
            ? `${chip.label} — חסר: ${missing.join(", ")}`
            : `${chip.label} — ${tr("scanner.engineNotConfigured", "לא מוגדר")}`;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={!configured}
            aria-pressed={active}
            onClick={() => onChange(chip.id)}
            title={tooltip}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
              active
                ? chip.tone
                : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
            } disabled:cursor-not-allowed disabled:opacity-35`}
          >
            {Icon ? <Icon size={12} aria-hidden /> : null}
            {chip.label}
          </button>
        );
      })}
    </div>

    {value === "CUSTOM_PARALLEL" && onCustomEnginesChange && (
      <div className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
        <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-violet-700 dark:text-violet-300">
          {tr("scanner.selectEngines", "בחר מנועים להרצה מקבילה")}
        </p>
        <div className="flex flex-wrap gap-2">
          {CUSTOM_ENGINE_OPTIONS.map((opt) => {
            const configured = Boolean(engineMeta?.configured[opt.cfg]);
            const checked = customEngines.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                  !configured ? "cursor-not-allowed opacity-40" : checked ? "border-violet-500/60 bg-violet-500/20 text-violet-700 dark:text-violet-300" : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
                title={!configured ? `${opt.label} — ${tr("scanner.engineNotConfigured", "לא מוגדר")}` : opt.label}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  disabled={!configured}
                  checked={checked}
                  onChange={(e) => {
                    if (!onCustomEnginesChange) return;
                    onCustomEnginesChange(
                      e.target.checked
                        ? [...customEngines, opt.id]
                        : customEngines.filter((id) => id !== opt.id),
                    );
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
        {customEngines.length === 0 && (
          <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            {tr("scanner.selectAtLeastOne", "בחר לפחות מנוע אחד")}
          </p>
        )}
      </div>
    )}
    </div>
  );
}
