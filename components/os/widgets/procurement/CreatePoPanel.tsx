"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { emitProcurementMutation } from "@/lib/events/procurement-sync";
import type { ProcurementRequestRow } from "@/lib/validation/schemas/procurement";
import { useProcurementSuppliers } from "./useProcurementData";

const prefix = "workspaceWidgets.procurement.createPo";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";
const labelClass = "mb-1 block text-sm font-medium text-[color:var(--foreground-muted)]";

type Props = {
  request: ProcurementRequestRow | null;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function requestLineTitle(
  t: (key: string, vars?: Record<string, string>) => string,
  request: ProcurementRequestRow,
): string {
  if (request.isVirtual && request.virtualMeta) {
    return t("workspaceWidgets.procurement.requests.lowStockTitle", {
      name: request.virtualMeta.itemName,
    });
  }
  return request.title;
}

export default function CreatePoPanel({ request, open, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const { suppliers, reload: reloadSuppliers } = useProcurementSuppliers(open);
  const [supplierId, setSupplierId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [issueAndSend, setIssueAndSend] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSupplierId("");
      setUnitPrice("");
      setExpectedDate("");
      setNotes("");
      setShowNewSupplier(false);
      setNewSupplierName("");
      setIssueAndSend(true);
      setError(null);
    }
  }, [open, request?.id]);

  const createSupplierIfNeeded = async (): Promise<string | null> => {
    if (!showNewSupplier) return supplierId || null;
    const name = newSupplierName.trim();
    if (!name) {
      setError(t(`${prefix}.supplierNameRequired`));
      return null;
    }
    const res = await fetch("/api/procurement/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { supplier?: { id: string } };
    const id = json.supplier?.id;
    if (!id) throw new Error("Invalid supplier response");
    await reloadSuppliers();
    return id;
  };

  const handleSubmit = async () => {
    if (!request) return;

    const price = Number(unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      setError(t(`${prefix}.unitPriceRequired`));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const resolvedSupplierId = await createSupplierIfNeeded();
      if (!resolvedSupplierId) {
        setIsSubmitting(false);
        if (!showNewSupplier && !supplierId) {
          setError(t(`${prefix}.supplierRequired`));
        }
        return;
      }

      const res = await fetch("/api/procurement/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          supplierId: resolvedSupplierId,
          unitPrice: price,
          expectedDate: expectedDate || null,
          notes: notes.trim() || null,
          issueDocument: issueAndSend,
          markSent: issueAndSend,
        }),
      });

      if (res.status === 409) {
        setError(t(`${prefix}.requestAlreadyOrdered`));
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      emitProcurementMutation("orders");
      emitProcurementMutation("requests");
      onCreated();
    } catch {
      setError(t(`${prefix}.createFailed`));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t(`${prefix}.title`)}
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
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {issueAndSend ? t(`${prefix}.submitAndSend`) : t(`${prefix}.submit`)}
          </button>
        </div>
      }
    >
      {request ? (
        <div className="space-y-4 p-1">
          <div className="rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3">
            <p className="text-xs font-medium text-[color:var(--foreground-muted)]">
              {t(`${prefix}.linePreview`)}
            </p>
            <p className="mt-1 text-sm font-bold text-[color:var(--foreground-main)]">
              {requestLineTitle(t, request)}
            </p>
            <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
              {t(`${prefix}.quantity`)}: {request.quantityNeeded}
            </p>
          </div>

          <div>
            <label className={labelClass}>{t(`${prefix}.supplier`)}</label>
            {!showNewSupplier ? (
              <select
                className={inputClass}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">{t(`${prefix}.selectSupplier`)}</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className={inputClass}
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder={t(`${prefix}.newSupplierPlaceholder`)}
              />
            )}
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[color:var(--brand-accent)]"
              onClick={() => setShowNewSupplier((prev) => !prev)}
            >
              {showNewSupplier ? t(`${prefix}.useExistingSupplier`) : t(`${prefix}.addSupplier`)}
            </button>
          </div>

          <div>
            <label className={labelClass}>{t(`${prefix}.unitPrice`)}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inputClass}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>{t(`${prefix}.expectedDate`)}</label>
            <input
              type="date"
              className={inputClass}
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>{t(`${prefix}.notes`)}</label>
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm text-[color:var(--foreground-main)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={issueAndSend}
              onChange={(e) => setIssueAndSend(e.target.checked)}
            />
            <span>
              <span className="font-medium">{t(`${prefix}.issueAndSendLabel`)}</span>
              <span className="mt-0.5 block text-xs text-[color:var(--foreground-muted)]">
                {t(`${prefix}.issueAndSendHint`)}
              </span>
            </span>
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      ) : null}
    </OsFloatingPanel>
  );
}
