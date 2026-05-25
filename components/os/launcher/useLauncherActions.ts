"use client";

import { useCallback, useMemo, useRef } from "react";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  ensureEditTrailingEmptySlot,
  ensureMeckanoLauncherSlots,
  LAUNCHER_STORAGE_KEY,
  LAUNCHER_ZONE_MAX_SLOTS,
  resolveZoneWidgets,
  trimTrailingEmptySlots,
  type LauncherZone,
  type UserLauncherConfig,
} from "@/lib/launcher/user-launcher-config";
import { moveQuickGridSlot, type GridCellCoord } from "@/lib/launcher/quick-grid";
import type { LauncherPermissionContext } from "@/lib/launcher/launcher-permissions";
import {
  sanitizeConfig,
  padMobileStart,
  padMobileEnd,
  countPickerOptionsForZone,
  getDefaultLauncherConfig,
  setZoneSlots,
  ensureQuickGridPositions,
  isExpandableLauncherZone,
  filterWidgetsForPicker,
  widgetsUsedInZone,
  prepareExpandableZoneForEdit,
  finalizeExpandableZoneAfterEdit,
} from "./launcher-provider-utils";

type PickerState = { zone: LauncherZone; slotIndex: number; row?: number; col?: number } | null;

type UseLauncherActionsArgs = {
  config: UserLauncherConfig;
  editMode: boolean;
  permissionCtx: LauncherPermissionContext;
  isPlatformAdmin: boolean;
  meckanoEnabled: boolean;
  organizationIndustry: string | null;
  userId: string | null;
  picker: PickerState;
  setConfig: (c: UserLauncherConfig) => void;
  setPicker: (p: PickerState) => void;
  setAnnounce: (msg: string) => void;
};

export function useLauncherActions({
  config, editMode, permissionCtx, isPlatformAdmin, meckanoEnabled,
  organizationIndustry, userId, picker,
  setConfig, setPicker, setAnnounce,
}: UseLauncherActionsArgs) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    (next: UserLauncherConfig) => {
      const withMeckano = ensureMeckanoLauncherSlots(next, meckanoEnabled);
      const withGrid = { ...withMeckano, quickGrid: ensureQuickGridPositions(withMeckano.quickGrid) };
      const sanitized = sanitizeConfig(withGrid, permissionCtx);
      setConfig(sanitized);
      try { localStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(sanitized)); } catch { /* quota */ }
      if (userId) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          void fetch("/api/user/launcher-config", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config: sanitized }),
          }).catch(() => { /* network */ });
        }, 400);
      }
    },
    [permissionCtx, meckanoEnabled, userId, setConfig],
  );

  const zoneWidgets = useCallback(
    (zone: LauncherZone) => resolveZoneWidgets(config, zone, { includePlatformAdmin: isPlatformAdmin }),
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
    [config, persist, zoneSlots, setAnnounce],
  );

  const moveQuickGridCell = useCallback(
    (from: GridCellCoord, to: GridCellCoord) => {
      if (from.row === to.row && from.col === to.col) return;
      persist(setZoneSlots(config, "quickGrid", moveQuickGridSlot(config.quickGrid, from, to)));
      setAnnounce("מיקום האריח עודכן");
    },
    [config, persist, setAnnounce],
  );

  const removeAt = useCallback(
    (zone: LauncherZone, index: number, coord?: GridCellCoord) => {
      if (zone === "quickGrid" && coord) {
        persist(setZoneSlots(config, zone, config.quickGrid.filter((s) => !(s.row === coord.row && s.col === coord.col))));
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
    [config, editMode, permissionCtx, persist, zoneSlots, setAnnounce],
  );

  const openPickerAt = useCallback(
    (zone: LauncherZone, index: number, coord?: GridCellCoord) => {
      setPicker({ zone, slotIndex: index, row: coord?.row, col: coord?.col });
    },
    [setPicker],
  );

  const closePicker = useCallback(() => setPicker(null), [setPicker]);

  const assignWidget = useCallback(
    (type: WidgetType) => {
      if (!picker) return;
      const zone = picker.zone;
      let slots = [...config[zone]];
      if (zone === "quickGrid" && picker.row !== undefined && picker.col !== undefined) {
        const without = slots.filter((s) => !(s.row === picker.row && s.col === picker.col));
        slots = [...without.filter((s) => s.widgetId !== type), { widgetId: type, row: picker.row, col: picker.col }];
      } else if (picker.slotIndex < 0) {
        return;
      } else if (picker.slotIndex >= slots.length) {
        if (!isExpandableLauncherZone(zone) || slots.length >= LAUNCHER_ZONE_MAX_SLOTS) return;
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
        next = setZoneSlots(next, zone, ensureEditTrailingEmptySlot(withFilled, canAddMore));
      }
      persist(next);
      setPicker(null);
      setAnnounce("אפליקציה הוחלפה");
      void import("@/lib/analytics/workspace-events").then(({ trackLauncherWidgetAdded }) => {
        trackLauncherWidgetAdded(type, zone);
      });
    },
    [config, editMode, permissionCtx, persist, picker, setPicker, setAnnounce],
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
  }, [persist, organizationIndustry, setAnnounce]);

  const enterEditMode = useCallback(() => {
    let next = { ...config, quickGrid: ensureQuickGridPositions(config.quickGrid) };
    for (const zone of ["quickGrid", "sidebar"] as const) {
      next = setZoneSlots(next, zone, prepareExpandableZoneForEdit(next, zone, permissionCtx));
    }
    persist(next);
  }, [config, permissionCtx, persist]);

  const exitEditMode = useCallback(() => {
    setPicker(null);
    let next = config;
    for (const zone of ["quickGrid", "sidebar"] as const) {
      next = setZoneSlots(next, zone, finalizeExpandableZoneAfterEdit(next, zone));
    }
    persist(next);
  }, [config, persist, setPicker]);

  return {
    persist, zoneWidgets, zoneSlots,
    reorderZone, moveQuickGridCell, removeAt,
    openPickerAt, closePicker, assignWidget,
    pickerOptions, resetToDefault,
    enterEditMode, exitEditMode,
  };
}
