"use client";

import React from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { Plus, Trash2 } from "lucide-react";
import { OsButton, OsIconButton } from "@/components/os/ui";
import type { DocItem } from "./types";

type DocItemsFormProps = {
  items: DocItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, field: keyof DocItem, value: string | number) => void;
};

export function DocItemsForm({ items, onAdd, onRemove, onUpdate }: DocItemsFormProps) {
  const { t } = useI18n();

  return (
    <section>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">
            2
          </div>
          <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">{t("workspaceWidgets.documentCreator.itemsTitle")}</h3>
        </div>
        <OsButton
          variant="quiet"
          size="sm"
          className="text-[color:var(--accent)] hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300"
          icon={<Plus size={14} aria-hidden />}
          onClick={onAdd}
        >
          {t("workspaceWidgets.documentCreator.addItem")}
        </OsButton>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 items-start group">
            <div className="flex-1 bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-xl p-3 flex flex-col md:flex-row gap-4 shadow-sm dark:shadow-none">
              <div className="flex-1">
                <input
                  placeholder={t("workspaceWidgets.documentCreator.itemPlaceholder")}
                  className="w-full bg-transparent border-none text-sm text-[color:var(--foreground-main)] focus:outline-none placeholder:text-[color:var(--foreground-muted)] opacity-80"
                  value={item.description}
                  onChange={(e) => onUpdate(item.id, "description", e.target.value)}
                />
              </div>
              <div className="w-full md:w-20 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("workspaceWidgets.documentCreator.qtyPlaceholder")}
                  className="w-full bg-transparent border-none text-sm text-center text-[color:var(--foreground-muted)] focus:outline-none"
                  value={item.quantity}
                  onChange={(e) => onUpdate(item.id, "quantity", parseFloat(e.target.value))}
                />
              </div>
              <div className="w-full md:w-32 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4 flex items-center gap-1">
                <span className="text-xs text-[color:var(--foreground-muted)]">₪</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={t("workspaceWidgets.documentCreator.pricePlaceholder")}
                  className="w-full bg-transparent border-none text-sm text-left text-[color:var(--accent)] dark:text-emerald-400 font-bold focus:outline-none"
                  value={item.price}
                  onChange={(e) => onUpdate(item.id, "price", parseFloat(e.target.value))}
                />
              </div>
            </div>
            <OsIconButton
              label={t("workspaceWidgets.itemActions.delete")}
              className="text-[color:var(--foreground-muted)] opacity-100 hover:text-red-600 dark:hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 size={18} aria-hidden />
            </OsIconButton>
          </div>
        ))}
      </div>
    </section>
  );
}
