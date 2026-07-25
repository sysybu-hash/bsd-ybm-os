"use client";

import { AlertCircle, ArrowRightLeft, Plus } from "lucide-react";
import { useProcurementSync } from "@/lib/events/procurement-sync";
import { useLogisticsSync } from "@/lib/events/logistics-sync";
import type { ProcurementRequestRow } from "@/lib/validation/schemas/procurement";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
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
        <OsButton
          variant="secondary"
          disabled={!onNewRequest}
          icon={<Plus className="h-4 w-4" aria-hidden />}
          onClick={() => onNewRequest?.()}
        >
          {t(`${prefix}.requests.newRequest`)}
        </OsButton>
      </div>

      {isLoading ? (
        <WidgetState variant="loading" message={t(`${prefix}.requests.scanning`)} />
      ) : error ? (
        <WidgetState variant="error" message={t(`${prefix}.loadError`)} onRetry={() => void reload()} retryLabel={t("common.retry")} />
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
                  <OsButton
                    variant="secondary"
                    size="sm"
                    className="bg-[color:var(--win-accent,var(--accent))]/10 text-[color:var(--win-accent,var(--accent))] hover:bg-[color:var(--win-accent,var(--accent))]/20"
                    disabled={!onCreatePo}
                    icon={<ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => onCreatePo?.(request)}
                  >
                    {t(`${prefix}.requests.createPo`)}
                  </OsButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
