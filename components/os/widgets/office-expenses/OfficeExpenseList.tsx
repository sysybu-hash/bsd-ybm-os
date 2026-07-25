"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { OsButton, OsIconButton } from "@/components/os/ui";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";
import { officeExpenseNis } from "./types";

type Props = {
  expenses: FinanceExpenseRow[];
  hasActiveFilters: boolean;
  canManage: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onEdit: (row: FinanceExpenseRow) => void;
  onDeleteRequest: (id: string) => void;
};

export default function OfficeExpenseList({
  expenses,
  hasActiveFilters,
  canManage,
  hasMore,
  loadingMore,
  onLoadMore,
  onEdit,
  onDeleteRequest,
}: Props) {
  const { t } = useI18n();

  if (expenses.length === 0) {
    return (
      <p className="text-xs text-[color:var(--foreground-muted)]">
        {hasActiveFilters
          ? t("workspaceWidgets.officeExpenses.filteredEmpty")
          : t("workspaceWidgets.officeExpenses.empty")}
      </p>
    );
  }

  return (
    <>
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
            <span className="font-semibold">{officeExpenseNis.format(row.total)}</span>
            {canManage ? (
              <>
                <OsIconButton
                  label={t("workspaceWidgets.officeExpenses.edit")}
                  size="sm"
                  onClick={() => onEdit(row)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </OsIconButton>
                <OsIconButton
                  label={t("workspaceWidgets.officeExpenses.delete")}
                  size="sm"
                  className="text-rose-500 hover:bg-rose-500/10"
                  onClick={() => onDeleteRequest(row.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </OsIconButton>
              </>
            ) : null}
          </div>
        </li>
        ))}
      </ul>
      {hasMore ? (
        <OsButton variant="secondary" className="mt-3 w-full justify-center" loading={loadingMore} onClick={onLoadMore}>
          {t("workspaceWidgets.officeExpenses.loadMore")}
        </OsButton>
      ) : null}
    </>
  );
}
