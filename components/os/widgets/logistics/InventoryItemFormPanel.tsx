"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";

const prefix = "workspaceWidgets.logistics.inventory";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";
const labelClass = "mb-1 block text-sm font-medium text-[color:var(--foreground-muted)]";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  name: string;
  sku: string;
  category: string;
  quantity: string;
  minQuantity: string;
  unit: string;
  location: string;
};

const emptyForm = (): FormState => ({
  name: "",
  sku: "",
  category: "general",
  quantity: "0",
  minQuantity: "0",
  unit: "units",
  location: "",
});

export default function InventoryItemFormPanel({ open, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(emptyForm());
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError(t(`${prefix}.nameRequired`));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/logistics/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim() || null,
          category: form.category.trim() || "general",
          quantity: Number(form.quantity) || 0,
          minQuantity: Number(form.minQuantity) || 0,
          unit: form.unit.trim() || "units",
          location: form.location.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch {
      setError(t(`${prefix}.saveFailed`));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t(`${prefix}.formTitle`)}
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
            {t(`${prefix}.save`)}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-1">
        <div>
          <label className={labelClass}>{t(`${prefix}.name`)}</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t(`${prefix}.sku`)}</label>
            <input
              className={inputClass}
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>{t(`${prefix}.category`)}</label>
            <input
              className={inputClass}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>{t(`${prefix}.quantity`)}</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>{t(`${prefix}.minQuantity`)}</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.minQuantity}
              onChange={(e) => setForm((f) => ({ ...f, minQuantity: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>{t(`${prefix}.unit`)}</label>
            <input
              className={inputClass}
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>{t(`${prefix}.location`)}</label>
          <input
            className={inputClass}
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </OsFloatingPanel>
  );
}
