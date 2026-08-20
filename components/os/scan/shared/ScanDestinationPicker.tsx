"use client";

import React from "react";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";

type ScanDestinationPickerProps = {
  values: UnifiedSaveTarget[];
  onChange: (targets: UnifiedSaveTarget[]) => void;
  hasProject: boolean;
  tr: (key: string, fallback: string) => string;
};

const OPTIONS: {
  id: UnifiedSaveTarget;
  labelKey: string;
  fallback: string;
  needsProject?: boolean;
}[] = [
  { id: "erp", labelKey: "workspaceWidgets.documentScan.saveTargetErp", fallback: "ERP (ארגון)" },
  { id: "crm", labelKey: "workspaceWidgets.documentScan.saveTargetCrm", fallback: "CRM" },
  { id: "project", labelKey: "workspaceWidgets.documentScan.saveTargetProject", fallback: "פרויקט", needsProject: true },
  { id: "notebook", labelKey: "workspaceWidgets.documentScan.saveTargetNotebook", fallback: "מחברת AI" },
  { id: "expense", labelKey: "workspaceWidgets.documentScan.saveTargetExpense", fallback: "הוצאה" },
];

export function ScanDestinationPicker({
  values,
  onChange,
  hasProject,
  tr,
}: ScanDestinationPickerProps) {
  const toggle = (id: UnifiedSaveTarget) => {
    if (values.includes(id)) {
      onChange(values.filter((v) => v !== id));
      return;
    }
    onChange([...values, id]);
  };

  return (
    <div className="w-full min-w-0 space-y-2">
      <p className="text-[11px] font-semibold text-[color:var(--foreground-muted)]">
        {tr("workspaceWidgets.documentScan.saveMultiHint", "ניתן לסמן יותר מיעד אחד — השמירה תתבצע לכל היעדים שסומנו")}
      </p>
      <div
        className="w-full min-w-0 space-y-2"
        role="group"
        aria-label={tr("workspaceWidgets.documentScan.saveDestination", "יעד שמירה")}
      >
        {OPTIONS.map((opt) => {
          const disabled = opt.needsProject && !hasProject;
          const active = values.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                active
                  ? "border-indigo-500/50 bg-indigo-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-soft)]"
              } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <input
                type="checkbox"
                name="scan-save-target"
                value={opt.id}
                checked={active}
                disabled={disabled}
                onChange={() => toggle(opt.id)}
                className="size-4 shrink-0 accent-indigo-600"
              />
              <span className="min-w-0 flex-1 font-semibold">{tr(opt.labelKey, opt.fallback)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
