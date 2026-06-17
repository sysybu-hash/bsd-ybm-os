"use client";

import { AlertCircle, ArrowRightLeft, Loader2, Plus } from "lucide-react";
import { useProcurementSync } from "@/lib/events/procurement-sync";
import { useLogisticsSync } from "@/lib/events/logistics-sync";
import type { ProcurementRequestRow } from "@/lib/validation/schemas/procurement";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useProcurementRequests } from "./useProcurementData";

const prefix = "workspaceWidgets.procurement";

function requestTitle(t: (key: string, vars?: Record<string, string>) => string, row: ProcurementRequestRow): string {
  if (row.isVirtual && row.virtualMeta) {
    return t(`${prefix}.requests.lowStockTitle`, { name: row.virtualMeta.itemName });
  }
  return row.title;
}

function requestNotes(t: (key: string, vars?: Record<string, string>) => string, row: ProcurementRequestRow): string | null {
  if (row.notes) return row.notes;
  if (row.isVirtual && row.virtualMeta) {
    return t(`${prefix}.requests.lowStockNotes`, {
      quantity: String(row.virtualMeta.quantity),
      minQuantity: String(row.virtualMeta.minQuantity),
      unit: row.virtualMeta.unit,
    });
  }
  return null;
}

function sourceLabel(t: (key: string) => string, source: ProcurementRequestRow["source"]): string {
  if (source === "LOW_STOCK") return t(`${prefix}.requests.sourceLowStock`);
  if (source === "BOQ") return t(`${prefix}.requests.sourceBoq`);
  return t(`${prefix}.requests.sourceManual`);
}

type Props = {
  onCreatePo?: (request: ProcurementRequestRow) => void;
  onNewRequest?: () => void;
};

export default function ProcurementRequestsTab({ onCreatePo, onNewRequest }: Props) {
  const { t } = useI18n();
  const { requests, isLoading, error, reload } = useProcurementRequests(true);
  useLogisticsSync(() => void reload(), "inventory");
  useProcurementSync(() => void reload(), "requests");

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.requests.hint`)}</p>
        <button
          type="button"
          onClick={() => onNewRequest?.()}
          disabled={!onNewRequest}
          className="inline-flex items-center gap-2 rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-4 py-2 text-sm font-medium text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-card)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t(`${prefix}.requests.newRequest`)}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[color:var(--foreground-muted)]">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {t(`${prefix}.requests.scanning`)}
        </div>
      ) : error ? (
        <div className="text-center text-sm text-red-600">{t(`${prefix}.loadError`)}</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-12 text-center">
          <AlertCircle className="mb-3 h-12 w-12 text-[color:var(--foreground-muted)] opacity-20" />
          <h3 className="text-lg font-bold text-[color:var(--foreground-main)]">
            {t(`${prefix}.requests.emptyTitle`)}
          </h3>
          <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.requests.empty`)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {requests.map((request) => {
            const notes = requestNotes(t, request);
            return (
              <div
                key={request.id}
                className="flex flex-col justify-between rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-sm"
              >
                <div>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="rounded border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-2 py-0.5 text-xs font-bold text-[color:var(--foreground-muted)]">
                      {sourceLabel(t, request.source)}
                    </span>
                    <span className="text-xs text-[color:var(--foreground-muted)]">
                      {new Date(request.createdAt).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                  <h3 className="mb-1 text-base font-bold text-[color:var(--foreground-main)]">
                    {requestTitle(t, request)}
                  </h3>
                  {notes ? (
                    <p className="line-clamp-2 text-xs text-[color:var(--foreground-muted)]">{notes}</p>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[color:var(--border-main)] pt-4">
                  <div className="text-sm">
                    <span className="me-1 text-[color:var(--foreground-muted)]">
                      {t(`${prefix}.requests.needed`)}:
                    </span>
                    <span className="font-bold text-[color:var(--foreground-main)]">
                      {request.quantityNeeded}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreatePo?.(request)}
                    disabled={!onCreatePo}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--brand-accent)]/10 px-3 py-1.5 text-sm font-medium text-[color:var(--brand-accent)] transition-colors hover:bg-[color:var(--brand-accent)]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {t(`${prefix}.requests.createPo`)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
