"use client";

import { useMemo, useState } from "react";
import { FileText, MessageCircle } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { FieldCopilotDraft } from "@/lib/validation/schemas/field-copilot";
import type { LineItemV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { buildBoqShareText, openWhatsAppShare, printBoqPdf } from "@/lib/field-copilot/quick-share";
import { ScanDestinationPicker } from "@/components/os/scan/shared/ScanDestinationPicker";
import { unifiedSaveFromClient } from "@/lib/scan/unified-save-client";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";
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
  const { t, locale } = useI18n();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const rows = useMemo(() => getLineItems(draft), [draft]);
  const assumptions = draft?.assumptions ?? [];
  const [saveTargets, setSaveTargets] = useState<UnifiedSaveTarget[]>(
    draft?.projectId ? ["project"] : ["erp"],
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const missingPrices = rows.some((r) => r.description.trim() && (r.unitPrice ?? 0) <= 0);
  const v5 = draft?.analysis as ScanExtractionV5 | undefined;

  const saveRows = async (nextRows: LineItemV5[]) => {
    const analysis = { ...(draft?.analysis as object), lineItems: nextRows };
    await onUpdate({ analysis });
  };

  const onUnifiedSave = async () => {
    if (!v5 || !draft) return;
    const targets = saveTargets.length ? saveTargets : (["erp"] as UnifiedSaveTarget[]);
    if (!targets.length) {
      setSaveMessage(tr("workspaceWidgets.documentScan.savePickOne", "בחרו לפחות יעד שמירה אחד"));
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      const fileName = `${draft.projectName ?? draft.contactName ?? "field-copilot"}-boq.json`;
      const file = new File([JSON.stringify(v5)], fileName, { type: "application/json" });
      let saved = 0;
      for (const target of targets) {
        const result = await unifiedSaveFromClient(file, {
          target,
          fileName,
          v5,
          projectId: draft.projectId ?? undefined,
          contactId: draft.contactId ?? undefined,
        });
        if (!result.ok) {
          setSaveMessage(result.error ?? tr("workspaceWidgets.documentScan.saveFailed", "השמירה נכשלה"));
          return;
        }
        saved++;
      }
      setSaveMessage(
        saved > 1
          ? tr("workspaceWidgets.documentScan.saveMultiSuccess", "נשמר ל-{count} יעדים").replace(
              "{count}",
              String(saved),
            )
          : tr("workspaceWidgets.documentScan.saveSuccess", "נשמר בהצלחה"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
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

      {/* Quick share — WhatsApp + Print/PDF */}
      {rows.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--border-main)] pt-3">
          <button
            type="button"
            onClick={() => openWhatsAppShare(buildBoqShareText(draft, rows, locale))}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
          >
            <MessageCircle size={14} aria-hidden />
            {t("workspaceWidgets.fieldCopilot.shareWhatsApp")}
          </button>
          <button
            type="button"
            onClick={() => printBoqPdf(draft, rows, locale)}
            className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-card)]"
          >
            <FileText size={14} aria-hidden />
            {t("workspaceWidgets.fieldCopilot.sharePdf")}
          </button>
        </div>
      ) : null}

      {v5 ? (
        <div className="space-y-3 border-t border-[color:var(--border-main)] pt-3">
          <p className="text-sm font-bold">{tr("workspaceWidgets.documentScan.savePhaseTitle", "שמירת מסמך")}</p>
          <ScanDestinationPicker
            values={saveTargets}
            onChange={setSaveTargets}
            hasProject={!!draft?.projectId}
            tr={tr}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void onUnifiedSave()}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {saving
              ? tr("workspaceWidgets.documentScan.saving", "שומר…")
              : tr("workspaceWidgets.documentScan.confirmSave", "אשר ושמור")}
          </button>
          {saveMessage ? <p className="text-xs text-[color:var(--foreground-muted)]">{saveMessage}</p> : null}
        </div>
      ) : null}

    </div>
  );
}
