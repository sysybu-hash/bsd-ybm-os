"use client";

import React from "react";
import { Sparkles, Layers } from "lucide-react";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { EngineMeta } from "./types";

type EngineSelectorProps = {
  value: TriEngineRunMode;
  onChange: (mode: TriEngineRunMode) => void;
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

/**
 * Clickable engine chips — one compact, horizontally-scrollable row that
 * replaces both the engine dropdown and the old decorative status tiles.
 * "אוטומטי" lets the classifier pick; "ריבוי מנועים" runs every configured
 * engine in parallel; the rest pin a single engine. Unconfigured engines are
 * shown disabled so the user sees the full roster.
 */
export function EngineSelector({ value, onChange, engineMeta, tr }: EngineSelectorProps) {
  const chips: ChipDef[] = [
    { id: "AUTO", label: tr("scanner.modeAuto", "אוטומטי"), tone: "border-indigo-500/50 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
    { id: "SINGLE_GEMINI", label: "Gemini", cfg: "gemini", tone: "border-purple-500/50 bg-purple-500/15 text-purple-700 dark:text-purple-300" },
    { id: "SINGLE_OPENAI", label: "OpenAI", cfg: "openai", tone: "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    { id: "SINGLE_ANTHROPIC", label: "Claude", tone: "border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300" },
    { id: "SINGLE_DOCUMENT_AI", label: "Document AI", cfg: "documentAI", tone: "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300" },
    { id: "SINGLE_MISTRAL", label: "Pixtral", cfg: "mistral", tone: "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    { id: "MULTI_PARALLEL", label: tr("scanner.modeMulti", "ריבוי מנועים"), tone: "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  ];

  return (
    <div
      className="no-scrollbar flex items-center gap-1.5 overflow-x-auto"
      role="group"
      aria-label={tr("scanner.configAi", "מנועים")}
    >
      {chips.map((chip) => {
        const configured = chip.cfg ? Boolean(engineMeta?.configured[chip.cfg]) : true;
        const active = value === chip.id;
        const Icon = chip.id === "AUTO" ? Sparkles : chip.id === "MULTI_PARALLEL" ? Layers : null;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={!configured}
            aria-pressed={active}
            onClick={() => onChange(chip.id)}
            title={configured ? chip.label : `${chip.label} — ${tr("scanner.engineNotConfigured", "לא מוגדר")}`}
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
  );
}
