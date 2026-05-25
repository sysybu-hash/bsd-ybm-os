"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import {
  LAUNCHER_STORAGE_KEY,
  LAUNCHER_STORAGE_KEY_LEGACY,
} from "@/lib/launcher/user-launcher-config";

export const LAUNCHER_V2_BANNER_KEY = "bsd_ybm_launcher_v2_banner_seen";

function shouldShowBanner(): boolean {
  try {
    if (localStorage.getItem(LAUNCHER_V2_BANNER_KEY)) return false;
    const hadLegacy = Boolean(localStorage.getItem(LAUNCHER_STORAGE_KEY_LEGACY));
    const current = localStorage.getItem(LAUNCHER_STORAGE_KEY);
    return hadLegacy || !current;
  } catch {
    return false;
  }
}

export default function LauncherV2MigrationBanner() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(shouldShowBanner());
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(LAUNCHER_V2_BANNER_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      data-testid="launcher-v2-migration-banner"
      className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-[1280] flex justify-center px-3 md:top-20"
    >
      <div className="flex w-full max-w-2xl items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/90 px-3 py-2.5 text-amber-50 shadow-lg backdrop-blur-md">
        <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed sm:text-sm">
          {t("workspaceWidgets.launcher.v2MigrationBanner")}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1.5 hover:bg-white/10"
          aria-label={t("workspaceWidgets.launcher.v2MigrationDismiss")}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
