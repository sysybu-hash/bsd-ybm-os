"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";

const prefix = "workspaceWidgets.logistics.assets";

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
  serialNumber: string;
  type: string;
};

const emptyForm = (): FormState => ({
  name: "",
  serialNumber: "",
  type: "tool",
});

export default function AssetFormPanel({ open, onClose, onSaved }: Props) {
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
      const res = await fetch("/api/logistics/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          serialNumber: form.serialNumber.trim() || null,
          type: form.type.trim() || "tool",
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
            <label className={labelClass}>{t(`${prefix}.serial`)}</label>
            <input
              className={inputClass}
              value={form.serialNumber}
              onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass}>{t(`${prefix}.type`)}</label>
            <input
              className={inputClass}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </OsFloatingPanel>
  );
}
