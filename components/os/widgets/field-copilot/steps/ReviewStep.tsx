"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { LineItemV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";
import BoqReviewTable from "../review/BoqReviewTable";
import AssumptionsList from "../review/AssumptionsList";

type Props = {
  draft: FieldCopilotDraft | null;
  onUpdate: (patch: Record<string, unknown>) => Promise<void>;
};

function getLineItems(draft: FieldCopilotDraft | null): LineItemV5[] {
  const raw = draft?.analysis;
  if (!raw || typeof raw !== "object") return [];
  const a = raw as ScanExtractionV5;
  if (Array.isArray(a.lineItems) && a.lineItems.length > 0) return a.lineItems;
  if (Array.isArray(a.billOfQuantities)) {
    return a.billOfQuantities.map((r) => ({
      description: r.description,
      quantity: r.quantity ?? 1,
      unitPrice: 0,
    }));
  }
  return [];
}

export default function ReviewStep({ draft, onUpdate }: Props) {
  const { t } = useI18n();
  const rows = useMemo(() => getLineItems(draft), [draft]);
  const assumptions = draft?.assumptions ?? [];

  const missingPrices = rows.some((r) => r.description.trim() && (r.unitPrice ?? 0) <= 0);

  const saveRows = async (nextRows: LineItemV5[]) => {
    const analysis = { ...(draft?.analysis as object), lineItems: nextRows };
    await onUpdate({ analysis });
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain p-4">
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        {t("workspaceWidgets.fieldCopilot.disclaimer")}
      </p>

      <BoqReviewTable rows={rows} onChange={(next) => void saveRows(next)} />
      <AssumptionsList
        items={assumptions}
        onChange={(next) => void onUpdate({ assumptions: next.filter((s) => s.trim()) })}
      />

      {missingPrices ? (
        <p className="text-xs font-bold text-amber-700">{t("workspaceWidgets.fieldCopilot.priceWarning")}</p>
      ) : null}

    </div>
  );
}
