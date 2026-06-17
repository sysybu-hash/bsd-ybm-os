"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { OfficeExpenseFilters } from "@/hooks/use-office-expenses-list";

type Props = {
  filters: OfficeExpenseFilters;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onFiltersChange: (updater: (prev: OfficeExpenseFilters) => OfficeExpenseFilters) => void;
  onClear: () => void;
  showClear: boolean;
};

export default function OfficeExpenseFiltersBar({
  filters,
  searchInput,
  onSearchInputChange,
  onFiltersChange,
  onClear,
  showClear,
}: Props) {
  const { t } = useI18n();

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{t("workspaceWidgets.officeExpenses.listTitle")}</h3>
        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-indigo-600 hover:underline"
          >
            {t("workspaceWidgets.officeExpenses.filters.clear")}
          </button>
        ) : null}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className={osFieldClassName}
          placeholder={t("workspaceWidgets.officeExpenses.filters.search")}
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
        />
        <select
          className={osFieldClassName}
          aria-label={t("workspaceWidgets.officeExpenses.filters.status")}
          value={filters.status}
          onChange={(e) =>
            onFiltersChange((prev) => ({
              ...prev,
              status: e.target.value === "DRAFT" || e.target.value === "POSTED" ? e.target.value : "",
            }))
          }
        >
          <option value="">{t("workspaceWidgets.officeExpenses.filters.statusAll")}</option>
          <option value="POSTED">{t("workspaceWidgets.officeExpenses.statusPosted")}</option>
          <option value="DRAFT">{t("workspaceWidgets.officeExpenses.statusDraft")}</option>
        </select>
        <input
          className={osFieldClassName}
          type="date"
          aria-label={t("workspaceWidgets.officeExpenses.filters.fromDate")}
          value={filters.fromDate}
          onChange={(e) => onFiltersChange((prev) => ({ ...prev, fromDate: e.target.value }))}
        />
        <input
          className={osFieldClassName}
          type="date"
          aria-label={t("workspaceWidgets.officeExpenses.filters.toDate")}
          value={filters.toDate}
          onChange={(e) => onFiltersChange((prev) => ({ ...prev, toDate: e.target.value }))}
        />
      </div>
    </div>
  );
}
