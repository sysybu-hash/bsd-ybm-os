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
import {
  filterLauncherWidget,
  filterWidgetsForPicker,
  type LauncherPermissionContext,
} from "@/lib/launcher/launcher-permissions";
import {
  ensureQuickGridPositions,
  finalizeQuickGridAfterEdit,
  moveQuickGridSlot,
  type GridCellCoord,
} from "@/lib/launcher/quick-grid";
import {
  compactZoneSlots,
  ensureEditTrailingEmptySlot,
  ensureMeckanoLauncherSlots,
  getDefaultLauncherConfig,
  isExpandableLauncherZone,
  LAUNCHER_STORAGE_KEY,
  LAUNCHER_ZONE_MAX_SLOTS,
  parseLauncherConfigFromStorage,
  resolveStoredLauncherConfig,
  resolveZoneWidgets,
  setZoneSlots,
  trimTrailingEmptySlots,
  widgetsUsedInZone,
  type LauncherSlot,
  type LauncherZone,
  type UserLauncherConfig,
} from "@/lib/launcher/user-launcher-config";

type PickerState = {
  zone: LauncherZone;
  slotIndex: number;
  row?: number;
  col?: number;
} | null;

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

function sanitizeConfig(
  raw: UserLauncherConfig,
  ctx: LauncherPermissionContext,
): UserLauncherConfig {
  const zones: LauncherZone[] = [
    "quickGrid",
    "sidebar",
    "mobileBarStart",
    "mobileBarEnd",
    "mobileMore",
  ];
  let next = raw;
  for (const zone of zones) {
    const slots = next[zone].map((s) => {
      const widgetId = filterLauncherWidget(s.widgetId, ctx);
      if (
        zone === "quickGrid" &&
        widgetId &&
        typeof s.row === "number" &&
        typeof s.col === "number"
      ) {
        return { widgetId, row: s.row, col: s.col };
      }
      return { widgetId };
    });
    next = setZoneSlots(next, zone, slots);
  }
  return next;
}

function padMobileStart(slots: LauncherSlot[]): LauncherSlot[] {
  const out = [...slots];
  while (out.length < 3) out.push({ widgetId: null });
  return out.slice(0, 3);
}

function padMobileEnd(slots: LauncherSlot[]): LauncherSlot[] {
  const out = [...slots];
  while (out.length < 1) out.push({ widgetId: null });
  return out.slice(0, 1);
}

function countPickerOptionsForZone(
  config: UserLauncherConfig,
  zone: LauncherZone,
  ctx: LauncherPermissionContext,
): number {
  const used = widgetsUsedInZone(config, zone);
  return filterWidgetsForPicker(ctx, used).length;
}

function prepareExpandableZoneForEdit(
  config: UserLauncherConfig,
  zone: LauncherZone,
  ctx: LauncherPermissionContext,
): LauncherSlot[] {
  if (zone === "quickGrid") {
    return ensureQuickGridPositions(config.quickGrid);
  }
  const canAddMore = countPickerOptionsForZone(config, zone, ctx) > 0;
  return ensureEditTrailingEmptySlot(config[zone], canAddMore);
}

function finalizeExpandableZoneAfterEdit(
  config: UserLauncherConfig,
  zone: LauncherZone,
): LauncherSlot[] {
  if (zone === "quickGrid") {
    return finalizeQuickGridAfterEdit(ensureQuickGridPositions(config.quickGrid));
  }
  return compactZoneSlots(config[zone], zone);
}

export function LauncherConfigProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const organizationIndustry =
    (session?.user as { organizationIndustry?: string | null } | undefined)?.organizationIndustry ??
    null;
  const isPlatformAdmin = useIsPlatformAdmin();
  const { allowed: meckanoEnabled } = useMeckanoAccess();
  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<UserLauncherConfig>(() =>
    getDefaultLauncherConfig(organizationIndustry),
  );
  const [editMode, setEditMode] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const [announce, setAnnounce] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      );

      if (userId) {
        try {
          const res = await fetch("/api/user/launcher-config", { credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as { config?: unknown };
            if (data.config) {
              base = resolveStoredLauncherConfig(data.config, organizationIndustry);
            } else {
              base = getDefaultLauncherConfig(organizationIndustry);
            }
          }
        } catch {
          /* offline — localStorage only */
        }
      }

      if (cancelled) return;
      const withMeckano = ensureMeckanoLauncherSlots(base, meckanoEnabled);
      const withGrid = {
        ...withMeckano,
        quickGrid: ensureQuickGridPositions(withMeckano.quickGrid),
      };
      const sanitized = sanitizeConfig(withGrid, permissionCtx);
      setConfig(sanitized);
      setHydrated(true);
      try {
        const migrated = JSON.stringify(sanitized);
        const previous =
          typeof window !== "undefined" ? localStorage.getItem(LAUNCHER_STORAGE_KEY) : null;
        if (previous !== migrated) {
          localStorage.setItem(LAUNCHER_STORAGE_KEY, migrated);
        }
      } catch {
        /* ignore quota */
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [organizationIndustry, permissionCtx, meckanoEnabled, userId]);

  const persist = useCallback(
    (next: UserLauncherConfig) => {
      const withMeckano = ensureMeckanoLauncherSlots(next, meckanoEnabled);
      const withGrid = {
        ...withMeckano,
        quickGrid: ensureQuickGridPositions(withMeckano.quickGrid),
      };
      const sanitized = sanitizeConfig(withGrid, permissionCtx);
      setConfig(sanitized);
      try {
        localStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(sanitized));
      } catch {
        /* ignore quota */
      }

      if (userId) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          void fetch("/api/user/launcher-config", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config: sanitized }),
          }).catch(() => {
            /* ignore network */
          });
        }, 400);
      }
    },
    [permissionCtx, meckanoEnabled, userId],
  );

  const zoneWidgets = useCallback(
    (zone: LauncherZone) =>
      resolveZoneWidgets(config, zone, { includePlatformAdmin: isPlatformAdmin }),
    [config, isPlatformAdmin],
  );

  const zoneSlots = useCallback(
    (zone: LauncherZone) => {
      const slots = config[zone];
      if (zone === "mobileBarStart") return padMobileStart(slots);
      if (zone === "mobileBarEnd") return padMobileEnd(slots);
      return slots;
    },
    [config],
  );

  const reorderZone = useCallback(
    (zone: LauncherZone, fromIndex: number, toIndex: number) => {
      const slots = [...zoneSlots(zone)];
      const [moved] = slots.splice(fromIndex, 1);
      if (!moved) return;
      slots.splice(toIndex, 0, moved);
      persist(setZoneSlots(config, zone, slots));
      setAnnounce("סדר האריחים עודכן");
    },
    [config, persist, zoneSlots],
  );

  const moveQuickGridCell = useCallback(
    (from: GridCellCoord, to: GridCellCoord) => {
      if (from.row === to.row && from.col === to.col) return;
      const nextSlots = moveQuickGridSlot(config.quickGrid, from, to);
      persist(setZoneSlots(config, "quickGrid", nextSlots));
      setAnnounce("מיקום האריח עודכן");
    },
    [config, persist],
  );

  const removeAt = useCallback(
    (zone: LauncherZone, index: number, coord?: GridCellCoord) => {
      if (zone === "quickGrid" && coord) {
        const slots = config.quickGrid.filter(
          (s) => !(s.row === coord.row && s.col === coord.col),
        );
        persist(setZoneSlots(config, zone, slots));
        setAnnounce("האריח הוסר");
        return;
      }
      const slots = [...zoneSlots(zone)];
      if (index < 0 || index >= slots.length) return;
      slots[index] = { widgetId: null };
      let next = setZoneSlots(config, zone, slots);
      if (editMode && isExpandableLauncherZone(zone) && zone !== "quickGrid") {
        const canAddMore = countPickerOptionsForZone(next, zone, permissionCtx) > 0;
        next = setZoneSlots(next, zone, ensureEditTrailingEmptySlot(next[zone], canAddMore));
      }
      persist(next);
      setAnnounce("האריח הוסר");
    },
    [config, editMode, permissionCtx, persist, zoneSlots],
  );

  const openPickerAt = useCallback((zone: LauncherZone, index: number, coord?: GridCellCoord) => {
    setPicker({ zone, slotIndex: index, row: coord?.row, col: coord?.col });
  }, []);

  const closePicker = useCallback(() => setPicker(null), []);

  const assignWidget = useCallback(
    (type: WidgetType) => {
      if (!picker) return;
      const zone = picker.zone;
      let slots = [...config[zone]];

      if (zone === "quickGrid" && picker.row !== undefined && picker.col !== undefined) {
        const without = slots.filter(
          (s) => !(s.row === picker.row && s.col === picker.col),
        );
        const withoutDup = without.filter((s) => s.widgetId !== type);
        slots = [...withoutDup, { widgetId: type, row: picker.row, col: picker.col }];
      } else if (picker.slotIndex < 0) {
        return;
      } else if (picker.slotIndex >= slots.length) {
        if (
          !isExpandableLauncherZone(zone) ||
          slots.length >= LAUNCHER_ZONE_MAX_SLOTS
        ) {
          return;
        }
        slots.push({ widgetId: type });
      } else {
        slots[picker.slotIndex] = { widgetId: type };
      }

      let next = setZoneSlots(config, zone, slots);
      if (editMode && isExpandableLauncherZone(zone) && zone !== "quickGrid") {
        const withFilled = trimTrailingEmptySlots(next[zone]);
        const used = widgetsUsedInZone({ ...next, [zone]: withFilled }, zone);
        used.add(type);
        const canAddMore = filterWidgetsForPicker(permissionCtx, used).length > 0;
        next = setZoneSlots(
          next,
          zone,
          ensureEditTrailingEmptySlot(withFilled, canAddMore),
        );
      }
      persist(next);
      setPicker(null);
      setAnnounce("אפליקציה הוחלפה");
    },
    [config, editMode, permissionCtx, persist, picker],
  );

  const pickerOptions = useMemo(() => {
    if (!picker) return [];
    const used = widgetsUsedInZone(config, picker.zone);
    const current = zoneSlots(picker.zone)[picker.slotIndex]?.widgetId;
    if (current) used.delete(current);
    return filterWidgetsForPicker(permissionCtx, used);
  }, [config, permissionCtx, picker, zoneSlots]);

  const resetToDefault = useCallback(() => {
    persist(getDefaultLauncherConfig(organizationIndustry));
    setAnnounce("שוחזר לברירת מחדל");
  }, [persist, organizationIndustry]);

  const value = useMemo<LauncherConfigContextValue>(
    () => ({
      config,
      hydrated,
      editMode,
      setEditMode,
      enterEditMode: () => {
        setEditMode(true);
        let next = {
          ...config,
          quickGrid: ensureQuickGridPositions(config.quickGrid),
        };
        for (const zone of ["quickGrid", "sidebar"] as const) {
          next = setZoneSlots(
            next,
            zone,
            prepareExpandableZoneForEdit(next, zone, permissionCtx),
          );
        }
        persist(next);
      },
      exitEditMode: () => {
        setEditMode(false);
        setPicker(null);
        let next = config;
        for (const zone of ["quickGrid", "sidebar"] as const) {
          next = setZoneSlots(
            next,
            zone,
            finalizeExpandableZoneAfterEdit(next, zone),
          );
        }
        persist(next);
      },
      resetToDefault,
      zoneWidgets,
      zoneSlots,
      reorderZone,
      moveQuickGridCell,
      removeAt,
      openPickerAt,
      picker,
      closePicker,
      assignWidget,
      pickerOptions,
      permissionCtx,
      announce,
    }),
    [
      announce,
      assignWidget,
      closePicker,
      config,
      editMode,
      hydrated,
      openPickerAt,
      permissionCtx,
      picker,
      pickerOptions,
      removeAt,
      reorderZone,
      moveQuickGridCell,
      resetToDefault,
      zoneSlots,
      zoneWidgets,
    ],
  );

  return (
    <LauncherConfigContext.Provider value={value}>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      {children}
    </LauncherConfigContext.Provider>
  );
}

export function useLauncherConfig(): LauncherConfigContextValue {
  const ctx = useContext(LauncherConfigContext);
  if (!ctx) {
    throw new Error("useLauncherConfig must be used within LauncherConfigProvider");
  }
  return ctx;
}

/** long-press (~500ms) to enter edit mode on launcher surfaces */
export function useLauncherLongPress(onLongPress: () => void, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    clear();
    timerRef.current = setTimeout(() => {
      onLongPress();
    }, 500);
  }, [clear, enabled, onLongPress]);

  return {
    onPointerDown,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}
