"use client";

import React, { useEffect, useState } from "react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { ArrowRightLeft, User, Calendar } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { createLogger } from "@/lib/logger";

const log = createLogger("asset-history-panel");

interface AssetHistoryPanelProps {
  assetId: string | null;
  assetName: string;
  open: boolean;
  onClose: () => void;
}

interface CheckoutLog {
  id: string;
  action: string;
  timestamp: string;
  user: { name: string } | null;
  project?: { name: string };
  notes?: string | null;
}

export default function AssetHistoryPanel({
  assetId,
  assetName,
  open,
  onClose,
}: AssetHistoryPanelProps) {
  const { t } = useI18n();
  const [logs, setLogs] = useState<CheckoutLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!assetId || !open) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/logistics/assets/${assetId}/history`);
        if (!res.ok) throw new Error(`GET failed: ${res.status}`);
        const data = (await res.json()) as { logs?: CheckoutLog[] };
        setLogs(data.logs ?? []);
      } catch (err: unknown) {
        log.error("Failed to fetch asset history", {
          error: err instanceof Error ? err.message : String(err),
          assetId,
        });
        setLogs([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchHistory();
  }, [assetId, open]);

  if (!open) return null;

  const title = t("workspaceWidgets.logistics.history.title", { name: assetName });

  return (
    <OsFloatingPanel open={open} onClose={onClose} title={title}>
      <div className="flex flex-col h-full min-h-[400px] bg-surface-card text-foreground-main overflow-y-auto custom-scrollbar p-5">
        {isLoading ? (
          <div className="flex-1 flex justify-center items-center text-foreground-muted">
            {t("workspaceWidgets.logistics.history.loading")}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center text-foreground-muted">
            <ArrowRightLeft className="w-12 h-12 mb-3 opacity-20" />
            <p>{t("workspaceWidgets.logistics.history.empty")}</p>
          </div>
        ) : (
          <div className="relative border-s-2 border-border-main ms-3 space-y-6">
            {logs.map((entry) => {
              const isCheckout = entry.action === "CHECK_OUT";
              return (
                <div key={entry.id} className="relative ps-6">
                  <div
                    className={`absolute -start-[9px] top-1 w-4 h-4 rounded-full border-2 border-surface-card ${
                      isCheckout ? "bg-blue-500" : "bg-emerald-500"
                    }`}
                  />

                  <div className="bg-surface-soft border border-border-main rounded-md p-3 shadow-sm">
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isCheckout
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-emerald-500/10 text-emerald-600"
                        }`}
                      >
                        {isCheckout
                          ? t("workspaceWidgets.logistics.history.checkout")
                          : t("workspaceWidgets.logistics.history.checkin")}
                      </span>
                      <div className="flex items-center text-xs text-foreground-muted">
                        <Calendar className="w-3 h-3 me-1 shrink-0" />
                        {new Date(entry.timestamp).toLocaleString("he-IL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>

                    <div className="text-sm space-y-1">
                      {entry.user && (
                        <div className="flex items-center">
                          <User className="w-3.5 h-3.5 me-1.5 text-foreground-muted shrink-0" />
                          <span className="font-medium">{entry.user.name}</span>
                        </div>
                      )}
                      {entry.project && (
                        <div className="flex items-center text-foreground-muted">
                          <span className="w-3.5 h-3.5 flex justify-center items-center me-1.5 opacity-50 shrink-0">
                            #
                          </span>
                          <span>
                            {t("workspaceWidgets.logistics.history.project", {
                              name: entry.project.name,
                            })}
                          </span>
                        </div>
                      )}
                      {entry.notes && (
                        <p className="mt-2 text-xs bg-surface-card p-2 rounded border border-border-main text-foreground-muted">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </OsFloatingPanel>
  );
}
