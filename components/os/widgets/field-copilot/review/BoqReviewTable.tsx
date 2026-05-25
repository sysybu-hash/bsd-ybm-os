"use client";

import type { LineItemV5 } from "@/lib/scan-schema-v5";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = {
  rows: LineItemV5[];
  onChange: (rows: LineItemV5[]) => void;
};

export default function BoqReviewTable({ rows, onChange }: Props) {
  const { t } = useI18n();

  const updateRow = (idx: number, patch: Partial<LineItemV5>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, { description: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b bg-[color:var(--surface-soft)] text-start text-xs">
            <th className="p-2">{t("workspaceWidgets.fieldCopilot.colDescription")}</th>
            <th className="p-2 w-20">{t("workspaceWidgets.fieldCopilot.colQty")}</th>
            <th className="p-2 w-24">{t("workspaceWidgets.fieldCopilot.colPrice")}</th>
            <th className="p-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-[color:var(--border-main)]/50">
              <td className="p-2">
                <input
                  className="w-full rounded border border-[color:var(--border-main)] px-2 py-1"
                  value={row.description}
                  onChange={(e) => updateRow(idx, { description: e.target.value })}
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min={0}
                  className="w-full rounded border border-[color:var(--border-main)] px-2 py-1"
                  value={row.quantity ?? 1}
                  onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={`w-full rounded border px-2 py-1 ${
                    (row.unitPrice ?? 0) <= 0 ? "border-amber-500 bg-amber-500/10" : "border-[color:var(--border-main)]"
                  }`}
                  value={row.unitPrice ?? 0}
                  onChange={(e) => updateRow(idx, { unitPrice: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="p-2">
                <button type="button" onClick={() => removeRow(idx)} className="text-rose-600 text-xs font-bold">
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addRow} className="w-full py-2 text-xs font-bold text-sky-600">
        + {t("workspaceWidgets.fieldCopilot.addRow")}
      </button>
    </div>
  );
}
