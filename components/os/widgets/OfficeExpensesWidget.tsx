"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";
import { widgetScrollPaneClass } from "@/lib/workspace/widget-shell-layout";

const nis = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

type FormState = {
  vendorName: string;
  invoiceNumber: string;
  expenseDate: string;
  description: string;
  amountNet: string;
  vat: string;
  status: "DRAFT" | "POSTED";
};

const emptyForm = (): FormState => ({
  vendorName: "",
  invoiceNumber: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  description: "",
  amountNet: "",
  vat: "0",
  status: "POSTED",
});

function formFromRow(row: FinanceExpenseRow): FormState {
  return {
    vendorName: row.vendorName,
    invoiceNumber: row.invoiceNumber ?? "",
    expenseDate: row.expenseDate.slice(0, 10),
    description: row.description ?? "",
    amountNet: String(row.amountNet),
    vat: String(row.vat),
    status: row.status === "DRAFT" ? "DRAFT" : "POSTED",
  };
}

function payloadFromForm(form: FormState) {
  const amountNet = parseFloat(form.amountNet);
  const vat = parseFloat(form.vat || "0");
  const total = Math.round((amountNet + (Number.isFinite(vat) ? vat : 0)) * 100) / 100;
  return {
    vendorName: form.vendorName.trim(),
    invoiceNumber: form.invoiceNumber.trim() || null,
    expenseDate: form.expenseDate,
    description: form.description.trim() || null,
    amountNet,
    vat: Number.isFinite(vat) ? vat : 0,
    total,
    status: form.status,
  };
}

export default function OfficeExpensesWidget() {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const totalPosted = useMemo(
    () =>
      expenses
        .filter((row) => row.status === "POSTED")
        .reduce((sum, row) => sum + row.total, 0),
    [expenses],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/office-expenses", { credentials: "include" });
      if (!res.ok) throw new Error(t("workspaceWidgets.officeExpenses.errors.load"));
      const data = (await res.json()) as { expenses: FinanceExpenseRow[] };
      setExpenses(data.expenses ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.officeExpenses.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!form.vendorName.trim()) {
      setFormError(t("workspaceWidgets.officeExpenses.errors.vendorRequired"));
      return;
    }
    const amountNet = parseFloat(form.amountNet);
    if (!Number.isFinite(amountNet) || amountNet < 0) {
      setFormError(t("workspaceWidgets.officeExpenses.errors.amountInvalid"));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = payloadFromForm(form);
      const url = editingId ? `/api/office-expenses/${editingId}` : "/api/office-expenses";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(t("workspaceWidgets.officeExpenses.errors.save"));
      resetForm();
      await load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("workspaceWidgets.officeExpenses.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("workspaceWidgets.officeExpenses.deleteConfirm"))) return;
    const res = await fetch(`/api/office-expenses/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setFormError(t("workspaceWidgets.officeExpenses.errors.delete"));
      return;
    }
    if (editingId === id) resetForm();
    await load();
  };

  if (loading) {
    return <WidgetState variant="loading" message={t("workspaceWidgets.officeExpenses.loading")} />;
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        message={error}
        onRetry={() => void load()}
        retryLabel={t("workspaceWidgets.retry")}
      />
    );
  }

  return (
    <div className={`${widgetScrollPaneClass} flex flex-col gap-4 p-4`}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--foreground-main)]">
            {t("workspaceWidgets.officeExpenses.title")}
          </h2>
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.officeExpenses.subtitle")}
          </p>
        </div>
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.officeExpenses.totalPosted", { amount: nis.format(totalPosted) })}
        </p>
      </header>

      <section className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
        <h3 className="mb-2 text-xs font-semibold">
          {editingId
            ? t("workspaceWidgets.officeExpenses.editTitle")
            : t("workspaceWidgets.officeExpenses.addTitle")}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={osFieldClassName}
            placeholder={t("workspaceWidgets.officeExpenses.vendor")}
            value={form.vendorName}
            onChange={(e) => setForm((prev) => ({ ...prev, vendorName: e.target.value }))}
          />
          <input
            className={osFieldClassName}
            placeholder={t("workspaceWidgets.officeExpenses.invoiceNumber")}
            value={form.invoiceNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
          />
          <input
            className={osFieldClassName}
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
          />
          <select
            className={osFieldClassName}
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                status: e.target.value === "DRAFT" ? "DRAFT" : "POSTED",
              }))
            }
          >
            <option value="POSTED">{t("workspaceWidgets.officeExpenses.statusPosted")}</option>
            <option value="DRAFT">{t("workspaceWidgets.officeExpenses.statusDraft")}</option>
          </select>
          <input
            className={osFieldClassName}
            type="number"
            min={0}
            step="0.01"
            placeholder={t("workspaceWidgets.officeExpenses.amountNet")}
            value={form.amountNet}
            onChange={(e) => setForm((prev) => ({ ...prev, amountNet: e.target.value }))}
          />
          <input
            className={osFieldClassName}
            type="number"
            min={0}
            step="0.01"
            placeholder={t("workspaceWidgets.officeExpenses.vat")}
            value={form.vat}
            onChange={(e) => setForm((prev) => ({ ...prev, vat: e.target.value }))}
          />
          <input
            className={`${osFieldClassName} sm:col-span-2`}
            placeholder={t("workspaceWidgets.officeExpenses.description")}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </div>
        {formError ? <p className="mt-2 text-xs text-rose-500">{formError}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {saving
              ? t("workspaceWidgets.officeExpenses.saving")
              : editingId
                ? t("workspaceWidgets.officeExpenses.save")
                : t("workspaceWidgets.officeExpenses.add")}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-xs"
            >
              {t("workspaceWidgets.officeExpenses.cancel")}
            </button>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold">{t("workspaceWidgets.officeExpenses.listTitle")}</h3>
        {expenses.length === 0 ? (
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.officeExpenses.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {expenses.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[color:var(--foreground-main)]">{row.vendorName}</p>
                  <p className="text-[color:var(--foreground-muted)]">
                    {new Date(row.expenseDate).toLocaleDateString("he-IL")}
                    {row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}
                    {row.status === "DRAFT"
                      ? ` · ${t("workspaceWidgets.officeExpenses.statusDraft")}`
                      : ""}
                  </p>
                  {row.description ? (
                    <p className="truncate text-[color:var(--foreground-muted)]">{row.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{nis.format(row.total)}</span>
                  <button
                    type="button"
                    aria-label={t("workspaceWidgets.officeExpenses.edit")}
                    className="rounded p-1 hover:bg-[color:var(--surface-elevated)]"
                    onClick={() => {
                      setEditingId(row.id);
                      setForm(formFromRow(row));
                      setFormError(null);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("workspaceWidgets.officeExpenses.delete")}
                    className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                    onClick={() => void handleDelete(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
