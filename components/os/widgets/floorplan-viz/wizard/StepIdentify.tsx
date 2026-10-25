"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { OsButton } from "@/components/os/ui";
import PlanCard from "@/components/os/widgets/floorplan-viz/wizard/PlanCard";
import {
  structureKindSchema,
  type StructureKind,
  type StructureReport,
} from "@/lib/validation/schemas/floorplan-structure";

type TFn = (key: string, vars?: Record<string, string>) => string;

const KINDS = structureKindSchema.options.filter((k) => k !== "unknown");

/**
 * Step 2: what the file was read as. The structure, sure or asked for; why;
 * every plan with its preview, the one to draw chosen; what was not read;
 * and, when nothing can be produced, why not.
 */
export default function StepIdentify({
  t,
  report,
  structure,
  onStructure,
  planId,
  onPlan,
  canContinue,
  onContinue,
  onBack,
}: {
  t: TFn;
  report: StructureReport;
  structure: StructureKind | null;
  onStructure: (kind: StructureKind) => void;
  planId: string | null;
  onPlan: (id: string) => void;
  canContinue: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  const w = (key: string, vars?: Record<string, string>) => t(`workspaceWidgets.floorplanViz.wizard.${key}`, vars);
  const choosesPlan = structure === "apartment" || structure === "commercial";
  return (
    <div className="space-y-4">
      {report.blockers.length > 0 ? (
        <section role="alert" className="rounded-xl border border-red-600/40 bg-red-600/10 px-3 py-2 text-[11px] text-red-900 dark:text-red-100">
          <p className="mb-1 flex items-center gap-1.5 font-bold">
            <AlertTriangle size={14} aria-hidden />
            {w("blockersTitle")}
          </p>
          <ul className="list-disc space-y-0.5 ps-4">
            {report.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-[color:var(--border-main)] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold">
          {report.sure && structure === report.structure ? (
            <>
              <CheckCircle2 size={15} className="text-emerald-600" aria-hidden />
              {w("sure", { kind: w(`structure.${report.structure}`) })}
            </>
          ) : (
            <>
              <HelpCircle size={15} className="text-amber-600" aria-hidden />
              {w("unsure")}
            </>
          )}
        </p>
        <div role="radiogroup" aria-label={w("structureLabel")} className="flex flex-wrap gap-1.5">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={structure === kind}
              onClick={() => onStructure(kind)}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                structure === kind
                  ? "border-violet-500 bg-violet-500/10 font-bold"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              {w(`structure.${kind}`)}
            </button>
          ))}
        </div>
        {report.reasons.length ? (
          <details className="mt-2 text-[10px] text-[color:var(--foreground-muted)]">
            <summary className="cursor-pointer">{w("whyTitle")}</summary>
            <ul className="mt-1 list-disc space-y-0.5 ps-4">
              {report.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      {report.plans.length > 0 ? (
        <section>
          <p className="mb-2 text-[11px] font-semibold">{choosesPlan ? w("pickPlan") : w("plansTitle")}</p>
          <div role="radiogroup" aria-label={w("plansTitle")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {report.plans.map((plan, index) => (
              <PlanCard
                key={plan.id}
                t={t}
                plan={plan}
                index={index}
                selected={choosesPlan && plan.id === planId}
                selectable={choosesPlan}
                onSelect={() => onPlan(plan.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {report.unread.length ? (
        <details className="rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-[10px] text-[color:var(--foreground-muted)]">
          <summary className="cursor-pointer font-semibold">{w("unreadTitle", { n: String(report.unread.length) })}</summary>
          <ul className="mt-1 list-disc space-y-0.5 ps-4">
            {report.unread.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex justify-between gap-2">
        <OsButton variant="quiet" size="sm" onClick={onBack}>
          {w("changeFile")}
        </OsButton>
        <OsButton variant="primary" size="sm" disabled={!canContinue} onClick={onContinue}>
          {w("continue")}
        </OsButton>
      </div>
    </div>
  );
}
