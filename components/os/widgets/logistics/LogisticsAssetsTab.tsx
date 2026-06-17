"use client";

import { useState } from "react";
import { CheckCircle2, History, Loader2, MapPin, Plus, Search } from "lucide-react";
import { emitLogisticsMutation, useLogisticsSync } from "@/lib/events/logistics-sync";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import AssetHistoryPanel from "./AssetHistoryPanel";
import AssetCheckoutPanel from "./AssetCheckoutPanel";
import AssetFormPanel from "./AssetFormPanel";
import type { LogisticsAssetRow } from "./types";
import { useLogisticsAssets } from "./useLogisticsData";

const prefix = "workspaceWidgets.logistics";

const inputClass =
  "w-full rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] ps-9 pe-3 py-2 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";

export default function LogisticsAssetsTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [checkoutAsset, setCheckoutAsset] = useState<LogisticsAssetRow | null>(null);
  const [historyAsset, setHistoryAsset] = useState<LogisticsAssetRow | null>(null);
  const { assets, isLoading, error, reload } = useLogisticsAssets(search);
  useLogisticsSync(() => void reload(), "assets");

  const handleCheckIn = async (asset: LogisticsAssetRow) => {
    try {
      const res = await fetch(`/api/logistics/assets/${asset.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CHECK_IN" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(t(`${prefix}.assets.checkInSuccess`));
      emitLogisticsMutation("assets");
      void reload();
    } catch {
      toast.error(t(`${prefix}.assets.actionFailed`));
    }
  };

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-[color:var(--foreground-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(`${prefix}.assets.searchPlaceholder`)}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {t(`${prefix}.assets.addAsset`)}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-[color:var(--foreground-muted)]">
          <Loader2 className="me-2 h-5 w-5 animate-spin" />
          {t(`${prefix}.loading`)}
        </div>
      ) : error ? (
        <div className="text-center text-sm text-red-600">{t(`${prefix}.loadError`)}</div>
      ) : assets.length === 0 ? (
        <div className="text-center text-sm text-[color:var(--foreground-muted)]">
          {t(`${prefix}.assets.empty`)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {assets.map((asset) => {
            const isAvailable = asset.status === "AVAILABLE";
            return (
              <div
                key={asset.id}
                className="rounded-window border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[color:var(--foreground-main)]">{asset.name}</h3>
                    <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                      {t(`${prefix}.assets.serial`)}: {asset.serialNumber ?? t(`${prefix}.assets.noSerial`)}
                    </p>
                    {!isAvailable && asset.currentUser ? (
                      <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                        {t(`${prefix}.assets.assignedTo`)}:{" "}
                        {asset.currentUser.name ?? asset.currentUser.email}
                      </p>
                    ) : null}
                    {!isAvailable && asset.project ? (
                      <p className="text-xs text-[color:var(--foreground-muted)]">
                        {t(`${prefix}.assets.project`)}: {asset.project.name}
                      </p>
                    ) : null}
                  </div>
                  {isAvailable ? (
                    <span className="inline-flex items-center rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600">
                      <CheckCircle2 className="me-1 h-3 w-3" />
                      {t(`${prefix}.assets.statusAvailable`)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-xs text-blue-600">
                      <MapPin className="me-1 h-3 w-3" />
                      {t(`${prefix}.assets.statusInField`)}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-3 border-t border-[color:var(--border-main)] pt-4">
                  <button
                    type="button"
                    onClick={() => setHistoryAsset(asset)}
                    className="inline-flex items-center gap-1 text-sm text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                  >
                    <History className="h-3.5 w-3.5" />
                    {t(`${prefix}.assets.historyCta`)}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      isAvailable ? setCheckoutAsset(asset) : void handleCheckIn(asset)
                    }
                    className="text-sm font-medium text-[color:var(--brand-accent)] hover:opacity-80"
                  >
                    {isAvailable
                      ? t(`${prefix}.assets.checkOutCta`)
                      : t(`${prefix}.assets.checkInCta`)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AssetFormPanel
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          toast.success(t(`${prefix}.assets.saveSuccess`));
          void reload();
        }}
      />

      <AssetCheckoutPanel
        asset={checkoutAsset}
        open={checkoutAsset !== null}
        onClose={() => setCheckoutAsset(null)}
        onSaved={() => {
          toast.success(t(`${prefix}.assets.checkOutSuccess`));
          setCheckoutAsset(null);
          emitLogisticsMutation("assets");
          void reload();
        }}
      />

      <AssetHistoryPanel
        assetId={historyAsset?.id ?? null}
        assetName={historyAsset?.name ?? ""}
        open={historyAsset !== null}
        onClose={() => setHistoryAsset(null)}
      />
    </div>
  );
}
