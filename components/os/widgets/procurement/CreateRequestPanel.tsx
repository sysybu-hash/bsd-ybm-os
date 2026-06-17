"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { emitProcurementMutation } from "@/lib/events/procurement-sync";

const prefix = "workspaceWidgets.procurement.createRequest";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";
const labelClass = "mb-1 block text-sm font-medium text-[color:var(--foreground-muted)]";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function CreateRequestPanel({ open, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [quantityNeeded, setQuantityNeeded] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setQuantityNeeded("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    const qty = Number(quantityNeeded);
    if (!title.trim()) {
      setError(t(`${prefix}.titleRequired`));
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t(`${prefix}.quantityRequired`));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          quantityNeeded: qty,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
            {t(`${prefix}.submit`)}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-1">
        <div>
          <label className={labelClass}>{t(`${prefix}.itemTitle`)}</label>
          <input
            type="text"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>{t(`${prefix}.quantity`)}</label>
          <input
            type="number"
            min={0}
            step="any"
            className={inputClass}
            value={quantityNeeded}
            onChange={(e) => setQuantityNeeded(e.target.value)}
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </OsFloatingPanel>
  );
}
