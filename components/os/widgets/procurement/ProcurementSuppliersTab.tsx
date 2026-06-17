"use client";

import { useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { emitProcurementMutation } from "@/lib/events/procurement-sync";
import { useProcurementSuppliers } from "./useProcurementData";

const prefix = "workspaceWidgets.procurement.suppliers";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";

type Props = {
  enabled?: boolean;
};

export default function ProcurementSuppliersTab({ enabled = true }: Props) {
  const { t } = useI18n();
  const { suppliers, isLoading, error, reload } = useProcurementSuppliers(enabled);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError(t(`${prefix}.nameRequired`));
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/procurement/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          email: email.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setName("");
      setEmail("");
      setPhone("");
      emitProcurementMutation("suppliers");
      await reload();
    } catch {
      setFormError(t(`${prefix}.saveFailed`));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 p-4 md:p-6">
      <div className="rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4">
        <h3 className="mb-3 text-sm font-bold text-[color:var(--foreground-main)]">
          {t(`${prefix}.addTitle`)}
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            type="text"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(`${prefix}.namePlaceholder`)}
          />
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t(`${prefix}.emailPlaceholder`)}
          />
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t(`${prefix}.phonePlaceholder`)}
          />
        </div>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleAdd()}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t(`${prefix}.addButton`)}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[color:var(--foreground-muted)]">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {t(`${prefix}.loading`)}
        </div>
      ) : error ? (
        <div className="text-center text-sm text-red-600">
          {t("workspaceWidgets.procurement.loadError")}
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Building2 className="mb-3 h-12 w-12 text-[color:var(--foreground-muted)] opacity-20" />
          <p className="text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.empty`)}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4"
            >
              <h4 className="font-bold text-[color:var(--foreground-main)]">{supplier.name}</h4>
              {supplier.contactPerson ? (
                <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
                  {supplier.contactPerson}
                </p>
              ) : null}
              {supplier.email ? (
                <p className="text-xs text-[color:var(--foreground-muted)]">{supplier.email}</p>
              ) : null}
              {supplier.phone ? (
                <p className="text-xs text-[color:var(--foreground-muted)]">{supplier.phone}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
