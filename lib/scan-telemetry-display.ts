import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";

export type EnginePhase = TriEngineTelemetry["documentAI"]["phase"];

const PHASE_LABEL_HE: Record<EnginePhase, string> = {
  idle: "ממתין",
  running: "רץ",
  ok: "תקין",
  error: "שגיאה",
  skipped: "דולג",
};

export function enginePhaseLabelHe(phase: EnginePhase): string {
  return PHASE_LABEL_HE[phase] ?? phase;
}

export function enginePhaseBadgeClass(phase: EnginePhase): string {
  switch (phase) {
    case "ok":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "error":
      return "bg-red-500/15 text-red-700 dark:text-red-300";
    case "running":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "skipped":
      return "bg-slate-500/10 text-[color:var(--foreground-muted)]";
    default:
      return "bg-slate-500/10 text-[color:var(--foreground-muted)]";
  }
}

export function formatTelemetrySummaryHe(t: TriEngineTelemetry | null): string {
  if (!t) return "—";
  const engines: { label: string; phase: EnginePhase }[] = [
    { label: "Document AI", phase: t.documentAI.phase },
    { label: "Gemini", phase: t.gemini.phase },
    { label: "GPT", phase: t.gpt.phase },
  ];
  return engines
    .filter((e) => e.phase !== "idle")
    .map((e) => `${e.label}: ${enginePhaseLabelHe(e.phase)}`)
    .join(" · ");
}

export function hasSuccessfulEngine(t: TriEngineTelemetry | null): boolean {
  if (!t) return false;
  return [t.documentAI, t.gemini, t.gpt].some((e) => e.phase === "ok");
}
