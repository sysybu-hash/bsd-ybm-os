"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import type { BoqLine, BoqPanelState } from "./useBoqPanelState";
import { BOQ_PHASE_COUNT } from "./useBoqPanelState";

type BoqLinesTableProps = {
  lines: BoqLine[];
  editCell: BoqPanelState["editCell"];
  editPhaseCoefficient: BoqPanelState["editPhaseCoefficient"];
  patchLine: BoqPanelState["patchLine"];
  deleteLine: BoqPanelState["deleteLine"];
  t: BoqPanelState["t"];
};

/** טבלת שורות BOQ עם עריכה inline — משותפת לטאבים boq / quote / bills */
export function BoqLinesTable({
  lines,
  editCell,
  editPhaseCoefficient,
  patchLine,
  deleteLine,
  t,
}: BoqLinesTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--border-main)]">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr className="bg-[color:var(--surface-elevated)] text-[color:var(--foreground-muted)]">
            <th className="p-2 text-start">{t("projectDashboard.boqColDescription")}</th>
            <th className="p-2">{t("projectDashboard.boqColUnit")}</th>
            <th className="p-2">{t("projectDashboard.boqColQuantity")}</th>
            <th className="p-2">{t("projectDashboard.boqColPrice")}</th>
            <th className="p-2">{t("projectDashboard.boqColTotal")}</th>
            {Array.from({ length: BOQ_PHASE_COUNT }, (_, i) => (
              <th key={i} className="p-2">
                {t("projectDashboard.boqColPhase").replace("{n}", String(i + 1))}
              </th>
            ))}
            <th className="p-2">{t("projectDashboard.boqColDone")}</th>
            <th className="p-2">{t("projectDashboard.boqColFactor")}</th>
            <th className="p-2" aria-label={t("workspaceWidgets.projectBoq.deleteRow")} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={l.isSectionSubtotal ? "font-bold bg-amber-500/5" : ""}>
              <td className="p-2">
                <input
                  type="text"
                  defaultValue={l.description}
                  onBlur={(e) => editCell(l, "description", e.target.value)}
                  className="w-full min-w-[140px] rounded border border-transparent bg-transparent px-1 hover:border-[color:var(--border-main)] focus:border-[color:var(--border-main)] focus:bg-[color:var(--surface-soft)]"
                />
              </td>
              <td className="p-2 text-center">{l.unit ?? "—"}</td>
              <td className="p-2 text-center">
                <input
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={l.quantity ?? ""}
                  onBlur={(e) => editCell(l, "quantity", e.target.value)}
                  className="w-16 rounded border border-transparent bg-transparent px-1 text-center hover:border-[color:var(--border-main)] focus:border-[color:var(--border-main)] focus:bg-[color:var(--surface-soft)]"
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={l.unitPrice ?? ""}
                  onBlur={(e) => editCell(l, "unitPrice", e.target.value)}
                  className="w-20 rounded border border-transparent bg-transparent px-1 text-center hover:border-[color:var(--border-main)] focus:border-[color:var(--border-main)] focus:bg-[color:var(--surface-soft)]"
                />
              </td>
              <td className="p-2 text-center">{l.lineTotal}</td>
              {Array.from({ length: BOQ_PHASE_COUNT }, (_, phaseIndex) => {
                const col = (l.phaseColumns ?? []).find((c) => c.phaseIndex === phaseIndex);
                return (
                  <td key={phaseIndex} className="p-2 text-center">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      title={
                        col?.phaseAmount != null
                          ? String(col.phaseAmount)
                          : t("projectDashboard.boqPhaseCoefHint")
                      }
                      className="w-14 rounded border border-[color:var(--border-main)] bg-transparent px-1 text-center"
                      defaultValue={col?.coefficient ?? ""}
                      onBlur={(e) => editPhaseCoefficient(l, phaseIndex, e.target.value)}
                    />
                  </td>
                );
              })}
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={l.isWorkDone}
                  onChange={(e) => void patchLine(l.id, { isWorkDone: e.target.checked })}
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-14 rounded border border-[color:var(--border-main)] bg-transparent px-1"
                  value={l.progressCoefficient ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    void patchLine(l.id, { progressCoefficient: v ?? undefined });
                  }}
                />
              </td>
              <td className="p-2 text-center">
                <button
                  type="button"
                  onClick={() => void deleteLine(l.id)}
                  title={t("workspaceWidgets.projectBoq.deleteRow")}
                  aria-label={t("workspaceWidgets.projectBoq.deleteRow")}
                  className="rounded p-1 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
