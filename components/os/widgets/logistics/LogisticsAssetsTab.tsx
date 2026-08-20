"use client";

import { useState } from "react";
import { CheckCircle2, History, MapPin, Plus } from "lucide-react";
import { emitLogisticsMutation, useLogisticsSync } from "@/lib/events/logistics-sync";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import { OsButton, OsSearchInput } from "@/components/os/ui";
import AssetHistoryPanel from "./AssetHistoryPanel";
import AssetCheckoutPanel from "./AssetCheckoutPanel";
import AssetFormPanel from "./AssetFormPanel";
import type { LogisticsAssetRow } from "./types";
import { useLogisticsAssets } from "./useLogisticsData";

const prefix = "workspaceWidgets.logistics";

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
        <OsSearchInput
          className="max-w-md flex-1"
          value={search}
          onChange={setSearch}
          label={t(`${prefix}.assets.searchPlaceholder`)}
        />
        <OsButton variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setFormOpen(true)}>
          {t(`${prefix}.assets.addAsset`)}
        </OsButton>
      </div>

      {isLoading ? (
        <WidgetState variant="loading" message={t(`${prefix}.loading`)} />
      ) : error ? (
        <WidgetState
          variant="error"
          message={t(`${prefix}.loadError`)}
          onRetry={() => void reload()}
          retryLabel={t("common.retry")}
        />
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
                  <OsButton
                    variant="quiet"
                    size="sm"
                    icon={<History className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => setHistoryAsset(asset)}
                  >
                    {t(`${prefix}.assets.historyCta`)}
                  </OsButton>
                  <OsButton
                    variant="quiet"
                    size="sm"
                    className="text-[color:var(--win-accent,var(--accent))]"
                    onClick={() =>
                      isAvailable ? setCheckoutAsset(asset) : void handleCheckIn(asset)
                    }
                  >
                    {isAvailable
                      ? t(`${prefix}.assets.checkOutCta`)
                      : t(`${prefix}.assets.checkInCta`)}
                  </OsButton>
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
