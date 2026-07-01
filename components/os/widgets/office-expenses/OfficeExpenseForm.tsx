"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { OfficeExpenseFormState } from "./types";

type Props = {
  editingId: string | null;
  form: OfficeExpenseFormState;
  formError: string | null;
  saving: boolean;
  onFormChange: (updater: (prev: OfficeExpenseFormState) => OfficeExpenseFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export default function OfficeExpenseForm({
  editingId,
  form,
  formError,
  saving,
  onFormChange,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useI18n();

  return (
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
          onChange={(e) => onFormChange((prev) => ({ ...prev, vendorName: e.target.value }))}
        />
        <input
          className={osFieldClassName}
          placeholder={t("workspaceWidgets.officeExpenses.invoiceNumber")}
          value={form.invoiceNumber}
          onChange={(e) => onFormChange((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
        />
        <input
          className={osFieldClassName}
          type="date"
          aria-label={t("workspaceWidgets.officeExpenses.expenseDate")}
          value={form.expenseDate}
          onChange={(e) => onFormChange((prev) => ({ ...prev, expenseDate: e.target.value }))}
        />
        <select
          className={osFieldClassName}
          aria-label={t("workspaceWidgets.officeExpenses.statusLabel")}
          value={form.status}
          onChange={(e) =>
            onFormChange((prev) => ({
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
          onChange={(e) => onFormChange((prev) => ({ ...prev, amountNet: e.target.value }))}
        />
        <input
          className={osFieldClassName}
          type="number"
          min={0}
          step="0.01"
          placeholder={t("workspaceWidgets.officeExpenses.vat")}
          value={form.vat}
          onChange={(e) => onFormChange((prev) => ({ ...prev, vat: e.target.value }))}
        />
        <input
          className={`${osFieldClassName} sm:col-span-2`}
          placeholder={t("workspaceWidgets.officeExpenses.description")}
          value={form.description}
          onChange={(e) => onFormChange((prev) => ({ ...prev, description: e.target.value }))}
        />
      </div>
      {formError ? <p className="mt-2 text-xs text-rose-500">{formError}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onSubmit}
          className="rounded-lg bg-[color:var(--win-accent,#6366f1)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
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
            onClick={onCancel}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-xs"
          >
            {t("workspaceWidgets.officeExpenses.cancel")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
