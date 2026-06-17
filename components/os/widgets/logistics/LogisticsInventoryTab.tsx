"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useLogisticsSync } from "@/lib/events/logistics-sync";
import InlineQuantityEditor from "./InlineQuantityEditor";
import InventoryItemFormPanel from "./InventoryItemFormPanel";
import { useLogisticsInventory } from "./useLogisticsData";

const prefix = "workspaceWidgets.logistics";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] ps-9 pe-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";

export default function LogisticsInventoryTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const { items, isLoading, error, reload } = useLogisticsInventory(search);
  useLogisticsSync(() => void reload(), "inventory");

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-[color:var(--foreground-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(`${prefix}.inventory.searchPlaceholder`)}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t(`${prefix}.inventory.addItem`)}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[color:var(--foreground-muted)]">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {t(`${prefix}.loading`)}
        </div>
      ) : error ? (
        <div className="text-center text-sm text-red-600">{t(`${prefix}.loadError`)}</div>
      ) : items.length === 0 ? (
        <div className="text-center text-sm text-[color:var(--foreground-muted)]">
          {t(`${prefix}.inventory.empty`)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {items.map((item) => {
            const isLowStock = item.quantity <= item.minQuantity;
            return (
              <div
                key={item.id}
                className="rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-bold text-[color:var(--foreground-main)]">{item.name}</h3>
                  <span className="rounded border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-2 py-1 text-xs text-[color:var(--foreground-muted)]">
                    {item.category}
                  </span>
                </div>
                {item.location ? (
                  <p className="text-xs text-[color:var(--foreground-muted)]">{item.location}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm flex items-center gap-1">
                    <span className="text-[color:var(--foreground-muted)]">
                      {t(`${prefix}.inventory.quantity`)}:
                    </span>
                    <div className={isLowStock ? "text-red-500" : ""}>
                      <InlineQuantityEditor
                        itemId={item.id}
                        currentQuantity={item.quantity}
                        unit={item.unit}
                        onUpdateComplete={() => void reload()}
                      />
                    </div>
                  </div>
                  {isLowStock ? (
                    <span className="inline-flex items-center rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-600">
                      <AlertTriangle className="me-1 h-3 w-3" />
                      {t(`${prefix}.inventory.lowStock`)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <InventoryItemFormPanel
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          toast.success(t(`${prefix}.inventory.saveSuccess`));
          void reload();
        }}
      />
    </div>
  );
}
