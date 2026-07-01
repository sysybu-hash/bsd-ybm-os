"use client";

import React from "react";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import { enginePhaseLabelHe, type EnginePhase } from "@/lib/scan-telemetry-display";

type EngineTelemetryBoardProps = {
  telemetry: TriEngineTelemetry | null;
  tr: (key: string, fallback: string) => string;
};

type EngineRow = { key: keyof TriEngineTelemetry; label: string };

const ENGINES: EngineRow[] = [
  { key: "documentAI", label: "Document AI" },
  { key: "gemini", label: "Gemini" },
  { key: "gpt", label: "OpenAI" },
  { key: "anthropic", label: "Claude" },
  { key: "mistral", label: "Pixtral" },
];

/** צבע נקודת הסטטוס לפי שלב המנוע — מותאם ל-light/dark דרך משתני CSS. */
function dotClass(phase: EnginePhase): string {
  switch (phase) {
    case "ok":
      return "bg-emerald-500";
    case "running":
      return "bg-[color:var(--accent)] animate-pulse";
    case "error":
      return "bg-red-500";
    case "skipped":
      return "bg-[color:var(--border-main)]";
    default:
      return "bg-[color:var(--border-main)]";
  }
}

function phaseTextClass(phase: EnginePhase): string {
  if (phase === "running") return "text-[color:var(--accent)]";
  if (phase === "error") return "text-red-600 dark:text-red-300";
  return "text-[color:var(--foreground-muted)]";
}

/**
 * לוח מנועים חי בסגנון "חדר בקרה" — כל חמשת המנועים עם נקודת סטטוס ותזמון.
 * נמשך מ-TriEngineTelemetry שמגיע מסטרימינג ה-NDJSON.
 */
export function EngineTelemetryBoard({ telemetry, tr }: EngineTelemetryBoardProps) {
  return (
    <div className="rounded-xl bg-[color:var(--surface-soft)] p-2.5">
      <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
        {tr("scanner.engineBoard", "לוח מנועים · חי")}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {ENGINES.map(({ key, label }) => {
          const cell = telemetry?.[key];
          const phase: EnginePhase = cell?.phase ?? "idle";
          const detail = phase === "running" ? tr("scanner.running", "רץ…") : cell?.ms != null ? `${(cell.ms / 1000).toFixed(1)}s` : enginePhaseLabelHe(phase);
          return (
            <div key={key} className="flex items-center gap-1.5 text-[12px]" title={cell?.detail ?? label}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(phase)}`} aria-hidden />
              <span className="truncate text-[color:var(--foreground-muted)]">{label}</span>
              <span className={`ms-auto shrink-0 font-mono text-[11px] ${phaseTextClass(phase)}`}>{detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
