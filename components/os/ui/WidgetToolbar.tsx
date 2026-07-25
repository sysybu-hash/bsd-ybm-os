"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { OsSearchInput } from "@/components/os/ui/OsInput";
import { OsIconButton } from "@/components/os/ui/OsIconButton";

type SearchProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
};

type WidgetToolbarProps = {
  search?: SearchProps;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Extra buttons (create, export…), rendered after refresh. */
  actions?: React.ReactNode;
  className?: string;
};

/**
 * One-line toolbar composing search + refresh + custom actions. This is the
 * cheap lever for adding a missing refresh/search to a widget header —
 * drop it in instead of hand-rolling a new row of buttons each time.
 */
export function WidgetToolbar({ search, onRefresh, refreshing, actions, className = "" }: WidgetToolbarProps) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {search ? (
        <OsSearchInput
          value={search.value}
          onChange={search.onChange}
          label={search.label}
          placeholder={search.placeholder}
          className="min-w-[180px] flex-1"
        />
      ) : null}
      {onRefresh ? (
        <OsIconButton
          label={t("common.refresh")}
          onClick={onRefresh}
          disabled={refreshing}
          className={refreshing ? "opacity-70" : ""}
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden />
        </OsIconButton>
      ) : null}
      {actions}
    </div>
  );
}
