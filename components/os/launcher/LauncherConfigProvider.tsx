"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { useSession } from "next-auth/react";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { useMeckanoAccess } from "@/hooks/use-meckano-access";
import type { LauncherPermissionContext } from "@/lib/launcher/launcher-permissions";
import type { GridCellCoord } from "@/lib/launcher/quick-grid";
import {
  ensureMeckanoLauncherSlots,
  getDefaultLauncherConfig,
  LAUNCHER_STORAGE_KEY,
  parseLauncherConfigFromStorage,
  resolveStoredLauncherConfig,
  scrubLauncherConfig,
  type LauncherSlot,
  type LauncherZone,
  type UserLauncherConfig,
} from "@/lib/launcher/user-launcher-config";
import { sanitizeConfig } from "./launcher-provider-utils";
import { useLauncherActions } from "./useLauncherActions";

type PickerState = { zone: LauncherZone; slotIndex: number; row?: number; col?: number } | null;

type LauncherConfigContextValue = {
  config: UserLauncherConfig;
  hydrated: boolean;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  enterEditMode: () => void;
  exitEditMode: () => void;
  resetToDefault: () => void;
  zoneWidgets: (zone: LauncherZone) => WidgetType[];
  zoneSlots: (zone: LauncherZone) => LauncherSlot[];
  reorderZone: (zone: LauncherZone, fromIndex: number, toIndex: number) => void;
  moveQuickGridCell: (from: GridCellCoord, to: GridCellCoord) => void;
  removeAt: (zone: LauncherZone, index: number, coord?: GridCellCoord) => void;
  openPickerAt: (zone: LauncherZone, index: number, coord?: GridCellCoord) => void;
  picker: PickerState;
  closePicker: () => void;
  assignWidget: (type: WidgetType) => void;
  pickerOptions: WidgetType[];
  permissionCtx: LauncherPermissionContext;
  announce: string;
};

const LauncherConfigContext = createContext<LauncherConfigContextValue | null>(null);

export function LauncherConfigProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const organizationIndustry =
    (session?.user as { organizationIndustry?: string | null } | undefined)?.organizationIndustry ?? null;
  const isPlatformAdmin = useIsPlatformAdmin();
  const { allowed: meckanoEnabled } = useMeckanoAccess();
  const [hydrated, setHydrated] = useState(false);
  const launcherDefaultOptions = useMemo(
    () => ({ isPlatformAdmin }),
    [isPlatformAdmin],
  );

  const [config, setConfig] = useState<UserLauncherConfig>(() =>
    getDefaultLauncherConfig(organizationIndustry, launcherDefaultOptions),
  );
  const [editMode, setEditMode] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const [announce, setAnnounce] = useState("");
  const userId = session?.user?.id ?? null;

  const permissionCtx = useMemo<LauncherPermissionContext>(
    () => ({ isPlatformAdmin, meckanoEnabled, organizationIndustry }),
    [isPlatformAdmin, meckanoEnabled, organizationIndustry],
  );

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      let base = parseLauncherConfigFromStorage(
        typeof window !== "undefined" ? localStorage.getItem(LAUNCHER_STORAGE_KEY) : null,
        organizationIndustry,
        launcherDefaultOptions,
      );
      if (userId) {
        try {
          const res = await fetch("/api/user/launcher-config", { credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as { config?: unknown };
            base = data.config
              ? resolveStoredLauncherConfig(data.config, organizationIndustry, launcherDefaultOptions)
              : getDefaultLauncherConfig(organizationIndustry, launcherDefaultOptions);
          }
        } catch { /* offline */ }
      }
      if (cancelled) return;
      const sanitized = scrubLauncherConfig(
        sanitizeConfig(base, permissionCtx),
        organizationIndustry,
        launcherDefaultOptions,
      );
      setConfig(sanitized);
      setHydrated(true);
      try {
        const migrated = JSON.stringify(sanitized);
        const previous = typeof window !== "undefined" ? localStorage.getItem(LAUNCHER_STORAGE_KEY) : null;
        if (previous !== migrated) localStorage.setItem(LAUNCHER_STORAGE_KEY, migrated);
      } catch { /* quota */ }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [organizationIndustry, userId, launcherDefaultOptions, permissionCtx]);

  useEffect(() => {
    if (!hydrated) return;
    setConfig((prev) =>
      scrubLauncherConfig(
        sanitizeConfig(ensureMeckanoLauncherSlots(prev, meckanoEnabled), permissionCtx),
        organizationIndustry,
        launcherDefaultOptions,
      ),
    );
  }, [hydrated, meckanoEnabled, organizationIndustry, launcherDefaultOptions, permissionCtx]);

  const actions = useLauncherActions({
    config, editMode, permissionCtx, isPlatformAdmin, meckanoEnabled,
    organizationIndustry, userId, picker,
    setConfig, setPicker, setAnnounce,
  });

  const enterEditMode = useCallback(() => {
    setEditMode(true);
    actions.enterEditMode();
  }, [actions]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    actions.exitEditMode();
  }, [actions]);

  const { enterEditMode: _actionEnterEdit, exitEditMode: _actionExitEdit, ...restActions } = actions;

  const value = useMemo<LauncherConfigContextValue>(
    () => ({
      config, hydrated, editMode, setEditMode, announce, picker,
      permissionCtx,
      enterEditMode,
      exitEditMode,
      ...restActions,
    }),
     
    [config, hydrated, editMode, announce, picker, permissionCtx, restActions, enterEditMode, exitEditMode],
  );

  return (
    <LauncherConfigContext.Provider value={value}>
      <div aria-live="polite" className="sr-only">{announce}</div>
      {children}
    </LauncherConfigContext.Provider>
  );
}

export function useLauncherConfig(): LauncherConfigContextValue {
  const ctx = useContext(LauncherConfigContext);
  if (!ctx) throw new Error("useLauncherConfig must be used within LauncherConfigProvider");
  return ctx;
}

/** long-press (~500ms) to enter edit mode on launcher surfaces */
export function useLauncherLongPress(onLongPress: () => void, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    clear();
    timerRef.current = setTimeout(onLongPress, 500);
  }, [clear, enabled, onLongPress]);

  return { onPointerDown, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear };
}
