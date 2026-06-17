"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";
import { widgetScrollPaneClass } from "@/lib/workspace/widget-shell-layout";
import { useOfficeExpensesList } from "@/hooks/use-office-expenses-list";
import OfficeExpenseForm from "./OfficeExpenseForm";
import OfficeExpenseFiltersBar from "./OfficeExpenseFiltersBar";
import OfficeExpenseList from "./OfficeExpenseList";
import {
  emptyOfficeExpenseForm,
  officeExpenseFormFromRow,
  officeExpenseNis,
  officeExpensePayloadFromForm,
  type OfficeExpenseFormState,
} from "./types";

const OfficeExpenseScanPanel = dynamic(
  () => import("@/components/os/widgets/OfficeExpenseScanPanel"),
  {
    loading: () => (
      <div className="flex min-h-[160px] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    ),
  },
);

const AccountingExportPanel = dynamic(
  () => import("@/components/os/widgets/AccountingExportPanel"),
  { loading: () => null },
);

export default function OfficeExpensesWidget() {
  const { t } = useI18n();
  const loadError = t("workspaceWidgets.officeExpenses.errors.load");
  const {
    expenses,
    loading,
    error,
    filters,
    setFilters,
    searchInput,
    setSearchInput,
    resetFilters,
    hasActiveFilters,
    totalPosted,
    reload,
  } = useOfficeExpensesList(loadError);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OfficeExpenseFormState>(emptyOfficeExpenseForm);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyOfficeExpenseForm());
    setFormError(null);
  }, []);

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
      const body = officeExpensePayloadFromForm(form);
      const url = editingId ? `/api/office-expenses/${editingId}` : "/api/office-expenses";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(t("workspaceWidgets.officeExpenses.errors.save"));
      resetForm();
      await reload();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("workspaceWidgets.officeExpenses.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/office-expenses/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setFormError(t("workspaceWidgets.officeExpenses.errors.delete"));
      return;
    }
    if (editingId === id) resetForm();
    await reload();
  };

  const handleEdit = useCallback((row: FinanceExpenseRow) => {
    setEditingId(row.id);
    setForm(officeExpenseFormFromRow(row));
    setFormError(null);
  }, []);

  if (loading) {
    return <WidgetState variant="loading" message={t("workspaceWidgets.officeExpenses.loading")} />;
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        message={error}
        onRetry={() => void reload()}
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
          {t("workspaceWidgets.officeExpenses.totalPosted", { amount: officeExpenseNis.format(totalPosted) })}
        </p>
      </header>

      <p className="rounded-lg border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
        {t("workspaceWidgets.officeExpenses.vsProjectBanner")}
      </p>

      <section className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
        <h3 className="mb-1 text-xs font-semibold">
          {t("workspaceWidgets.officeExpenses.scanTitle")}
        </h3>
        <p className="mb-3 text-[11px] text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.officeExpenses.scanSubtitle")}
        </p>
        <div className="overflow-hidden rounded-lg border border-[color:var(--border-main)]/60">
          <OfficeExpenseScanPanel onExpenseSaved={() => void reload()} />
        </div>
      </section>

      <OfficeExpenseForm
        editingId={editingId}
        form={form}
        formError={formError}
        saving={saving}
        onFormChange={setForm}
        onSubmit={() => void handleSubmit()}
        onCancel={resetForm}
      />

      <section>
        <OfficeExpenseFiltersBar
          filters={filters}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onFiltersChange={setFilters}
          onClear={resetFilters}
          showClear={hasActiveFilters}
        />
        <OfficeExpenseList
          expenses={expenses}
          hasActiveFilters={hasActiveFilters}
          onEdit={handleEdit}
          onDeleteRequest={setDeleteTargetId}
        />
      </section>

      <section className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
        <h3 className="mb-2 text-xs font-semibold">
          {t("workspaceWidgets.officeExpenses.exportSection")}
        </h3>
        <AccountingExportPanel />
      </section>

      <OsConfirmDialog
        open={deleteTargetId !== null}
        title={t("workspaceWidgets.officeExpenses.delete")}
        message={t("workspaceWidgets.officeExpenses.deleteConfirm")}
        destructive
        onConfirm={() => {
          const id = deleteTargetId;
          setDeleteTargetId(null);
          if (id) void handleDelete(id);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}
