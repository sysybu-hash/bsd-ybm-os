"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { emitLogisticsMutation } from "@/lib/events/logistics-sync";
import { emitProcurementMutation } from "@/lib/events/procurement-sync";
import { remainingQty } from "@/lib/procurement/po-status";
import type { PurchaseOrderRow } from "@/lib/validation/schemas/procurement";

const prefix = "workspaceWidgets.procurement.receivePo";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";
const labelClass = "mb-1 block text-sm font-medium text-[color:var(--foreground-muted)]";

type Props = {
  order: PurchaseOrderRow | null;
  open: boolean;
  onClose: () => void;
  onReceived: () => void;
};

export default function ReceivePoPanel({ order, open, onClose, onReceived }: Props) {
  const { t } = useI18n();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openLines = useMemo(() => {
    if (!order) return [];
    return order.lineItems.filter((line) => remainingQty(line) > 0);
  }, [order]);

  useEffect(() => {
    if (!open || !order) return;
    const initial: Record<string, string> = {};
    for (const line of order.lineItems) {
      const left = remainingQty(line);
      if (left > 0) initial[line.id] = String(left);
    }
    setQuantities(initial);
    setError(null);
  }, [open, order]);

  const handleSubmit = async () => {
    if (!order) return;

    const lines = openLines
      .map((line) => ({
        lineId: line.id,
        quantityReceived: Number(quantities[line.id] ?? 0),
      }))
      .filter((row) => row.quantityReceived > 0);

    if (lines.length === 0) {
      setError(t(`${prefix}.quantityRequired`));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/procurement/orders/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      if (res.status === 409) {
        setError(t(`${prefix}.overReceive`));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      emitProcurementMutation("orders");
      emitLogisticsMutation("inventory");
      onReceived();
    } catch {
      setError(t(`${prefix}.receiveFailed`));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t(`${prefix}.title`, { number: order?.orderNumber ?? "" })}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[color:var(--border-main)] px-4 py-2 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={isSubmitting || openLines.length === 0}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t(`${prefix}.submit`)}
          </button>
        </div>
      }
    >
      {order ? (
        <div className="space-y-4 p-1">
          <p className="text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.desc`)}</p>
          {openLines.length === 0 ? (
            <p className="text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.allReceived`)}</p>
          ) : (
            openLines.map((line) => {
              const left = remainingQty(line);
              return (
                <div
                  key={line.id}
                  className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3"
                >
                  <p className="text-sm font-bold text-[color:var(--foreground-main)]">
                    {line.description}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                    {t(`${prefix}.progress`, {
                      received: String(line.receivedQty),
                      total: String(line.quantity),
                    })}
                  </p>
                  <div className="mt-2">
                    <label className={labelClass}>
                      {t(`${prefix}.receiveQty`, { max: String(left) })}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={left}
                      step="any"
                      className={inputClass}
                      value={quantities[line.id] ?? ""}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </OsFloatingPanel>
  );
}
