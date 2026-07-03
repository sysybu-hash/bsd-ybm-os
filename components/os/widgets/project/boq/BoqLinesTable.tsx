"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import type { BoqLine, BoqPanelState } from "./useBoqPanelState";

type BoqLinesTableProps = {
  lines: BoqLine[];
  editCell: BoqPanelState["editCell"];
  patchLine: BoqPanelState["patchLine"];
  deleteLine: BoqPanelState["deleteLine"];
  t: BoqPanelState["t"];
};

/** טבלת שורות BOQ עם עריכה inline — משותפת לטאבים boq / quote / bills */
export function BoqLinesTable({ lines, editCell, patchLine, deleteLine, t }: BoqLinesTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--border-main)]">
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="bg-[color:var(--surface-elevated)] text-[color:var(--foreground-muted)]">
            <th className="p-2 text-start">תיאור</th>
            <th className="p-2">יחידה</th>
            <th className="p-2">כמות</th>
            <th className="p-2">מחיר</th>
            <th className="p-2">סה״כ</th>
            <th className="p-2">בוצע</th>
            <th className="p-2">מקדם</th>
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
