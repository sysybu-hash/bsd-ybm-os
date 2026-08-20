"use client";

import { useState } from "react";
import { Download, ExternalLink, FileText, PackageCheck, Send, XCircle } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { emitProcurementMutation, useProcurementSync } from "@/lib/events/procurement-sync";
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";
import { remainingQty } from "@/lib/procurement/po-status";
import type { PurchaseOrderRow } from "@/lib/validation/schemas/procurement";
import { useProcurementOrders } from "./useProcurementData";

const prefix = "workspaceWidgets.procurement.orders";

type Props = {
  enabled?: boolean;
  onReceive?: (order: PurchaseOrderRow) => void;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

function statusLabel(t: (key: string) => string, status: string): string {
  const key = `${prefix}.status.${status}`;
  const translated = t(key);
  if (translated === key) return status;
  return translated;
}

export default function ProcurementOrdersTab({
  enabled = true,
  onReceive,
  openWorkspaceWidget,
}: Props) {
  const { t } = useI18n();
  const { orders, isLoading, error, reload } = useProcurementOrders(enabled);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useProcurementSync(() => void reload(), "orders");

  const patchStatus = async (orderId: string, status: "SENT" | "CANCELLED") => {
    setBusyId(orderId);
    setActionError(null);
    try {
      const res = await fetch(`/api/procurement/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitProcurementMutation("orders");
      await reload();
    } catch {
      setActionError(t(`${prefix}.actionFailed`));
    } finally {
      setBusyId(null);
    }
  };

  const issueDocument = async (order: PurchaseOrderRow, markSent: boolean) => {
    setBusyId(order.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/procurement/orders/${order.id}/issue-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markSent }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      emitProcurementMutation("orders");
      await reload();
    } catch {
      setActionError(t(`${prefix}.issueFailed`));
    } finally {
      setBusyId(null);
    }
  };

  const sendToSupplier = async (order: PurchaseOrderRow) => {
    if (!order.issuedDocumentId) {
      await issueDocument(order, true);
      return;
    }
    if (order.status === "DRAFT") {
      await patchStatus(order.id, "SENT");
    }
  };

  const downloadPdf = async (order: PurchaseOrderRow) => {
    if (!order.issuedDocumentId) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      const result = await downloadIssuedDocumentExport(order.issuedDocumentId, "pdf");
      if (!result.ok) setActionError(result.error);
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = (order: PurchaseOrderRow) => {
    if (!order.issuedDocumentId || !openWorkspaceWidget) return;
    openWorkspaceWidget("docCreator", { issuedDocumentId: order.issuedDocumentId });
  };

  if (isLoading) {
    return <WidgetState variant="loading" message={t(`${prefix}.loading`)} />;
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        message={t("workspaceWidgets.procurement.loadError")}
        onRetry={() => void reload()}
        retryLabel={t("common.retry")}
      />
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
        <FileText className="mb-3 h-12 w-12 text-[color:var(--foreground-muted)] opacity-20" />
        <h3 className="text-lg font-bold text-[color:var(--foreground-main)]">
          {t(`${prefix}.emptyTitle`)}
        </h3>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.empty`)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 md:p-6">
      {actionError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </p>
      ) : null}
      {orders.map((order) => {
        const canSend = order.status === "DRAFT";
        const canCancel = order.status === "DRAFT" || order.status === "SENT" || order.status === "PARTIAL";
        const canReceive =
          (order.status === "DRAFT" || order.status === "SENT" || order.status === "PARTIAL") &&
          order.lineItems.some((line) => remainingQty(line) > 0);
        const hasDocument = Boolean(order.issuedDocumentId);
        const isBusy = busyId === order.id;

        return (
          <div
            key={order.id}
            className="rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-[color:var(--foreground-muted)]">{order.orderNumber}</p>
                <h3 className="text-base font-bold text-[color:var(--foreground-main)]">
                  {order.supplier.name}
                </h3>
              </div>
              <span className="rounded border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-2 py-0.5 text-xs font-bold text-[color:var(--foreground-muted)]">
                {statusLabel(t, order.status)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[color:var(--foreground-muted)]">
              <span>
                {t(`${prefix}.total`)}:{" "}
                <strong className="text-[color:var(--foreground-main)]">
                  {order.totalAmount.toLocaleString("he-IL")} {order.currency}
                </strong>
              </span>
              {order.expectedDate ? (
                <span>
                  {t(`${prefix}.expected`)}:{" "}
                  {new Date(order.expectedDate).toLocaleDateString("he-IL")}
                </span>
              ) : null}
              {hasDocument ? (
                <span className="text-[color:var(--win-accent,var(--accent))]">{t(`${prefix}.documentReady`)}</span>
              ) : null}
            </div>

            {order.lineItems.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-[color:var(--border-main)] pt-3 text-sm">
                {order.lineItems.map((line) => (
                  <li key={line.id} className="flex justify-between gap-2">
                    <span className="text-[color:var(--foreground-main)]">{line.description}</span>
                    <span className="shrink-0 text-[color:var(--foreground-muted)]">
                      {line.receivedQty}/{line.quantity} · {line.unitPrice.toLocaleString("he-IL")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {(canSend || canReceive || canCancel || hasDocument || !hasDocument) && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[color:var(--border-main)] pt-3">
                {!hasDocument && canSend ? (
                  <OsButton
                    variant="secondary"
                    size="sm"
                    loading={isBusy}
                    icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => void issueDocument(order, false)}
                  >
                    {t(`${prefix}.issueDocument`)}
                  </OsButton>
                ) : null}
                {canSend ? (
                  <OsButton
                    variant="primary"
                    size="sm"
                    loading={isBusy}
                    icon={<Send className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => void sendToSupplier(order)}
                  >
                    {t(`${prefix}.markSent`)}
                  </OsButton>
                ) : null}
                {hasDocument ? (
                  <>
                    <OsButton
                      variant="secondary"
                      size="sm"
                      disabled={isBusy}
                      icon={<Download className="h-3.5 w-3.5" aria-hidden />}
                      onClick={() => void downloadPdf(order)}
                    >
                      {t(`${prefix}.downloadPdf`)}
                    </OsButton>
                    {openWorkspaceWidget ? (
                      <OsButton
                        variant="secondary"
                        size="sm"
                        icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}
                        onClick={() => openDocument(order)}
                      >
                        {t(`${prefix}.openDocument`)}
                      </OsButton>
                    ) : null}
                  </>
                ) : null}
                {canReceive && onReceive ? (
                  <OsButton
                    variant="secondary"
                    size="sm"
                    className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20 dark:text-emerald-400"
                    icon={<PackageCheck className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => onReceive(order)}
                  >
                    {t(`${prefix}.receive`)}
                  </OsButton>
                ) : null}
                {canCancel ? (
                  <OsButton
                    variant="secondary"
                    size="sm"
                    loading={isBusy}
                    icon={<XCircle className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => void patchStatus(order.id, "CANCELLED")}
                  >
                    {t(`${prefix}.cancel`)}
                  </OsButton>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
