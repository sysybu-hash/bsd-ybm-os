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
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import {
  filterLauncherWidget,
  filterWidgetsForPicker,
  type LauncherPermissionContext,
} from "@/lib/launcher/launcher-permissions";
import {
  getDefaultLauncherConfig,
  LAUNCHER_STORAGE_KEY,
  mergeLauncherConfig,
  parseLauncherConfigFromStorage,
  resolveZoneWidgets,
  setZoneSlots,
  widgetsUsedInZone,
  type LauncherSlot,
  type LauncherZone,
  type UserLauncherConfig,
} from "@/lib/launcher/user-launcher-config";

type PickerState = {
  zone: LauncherZone;
  slotIndex: number;
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
  removeAt: (zone: LauncherZone, index: number) => void;
  openPickerAt: (zone: LauncherZone, index: number) => void;
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
    const slots = next[zone].map((s) => ({
      widgetId: filterLauncherWidget(s.widgetId, ctx),
    }));
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

export function LauncherConfigProvider({ children }: { children: React.ReactNode }) {
  const isPlatformAdmin = useIsPlatformAdmin();
  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<UserLauncherConfig>(() => getDefaultLauncherConfig());
  const [editMode, setEditMode] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const [announce, setAnnounce] = useState("");

  const permissionCtx = useMemo<LauncherPermissionContext>(
    () => ({ isPlatformAdmin, meckanoEnabled: true }),
    [isPlatformAdmin],
  );

  useEffect(() => {
    const stored = parseLauncherConfigFromStorage(
      typeof window !== "undefined" ? localStorage.getItem(LAUNCHER_STORAGE_KEY) : null,
    );
    setConfig(sanitizeConfig(stored, permissionCtx));
    setHydrated(true);
  }, [permissionCtx]);

  const persist = useCallback((next: UserLauncherConfig) => {
    const sanitized = sanitizeConfig(next, permissionCtx);
    setConfig(sanitized);
    try {
      localStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      /* ignore quota */
    }
  }, [permissionCtx]);

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

  const removeAt = useCallback(
    (zone: LauncherZone, index: number) => {
      const slots = [...zoneSlots(zone)];
      if (index < 0 || index >= slots.length) return;
      slots[index] = { widgetId: null };
      persist(setZoneSlots(config, zone, slots));
      setAnnounce("האריח הוסר");
    },
    [config, persist, zoneSlots],
  );

  const openPickerAt = useCallback((zone: LauncherZone, index: number) => {
    setPicker({ zone, slotIndex: index });
  }, []);

  const closePicker = useCallback(() => setPicker(null), []);

  const assignWidget = useCallback(
    (type: WidgetType) => {
      if (!picker) return;
      const slots = [...zoneSlots(picker.zone)];
      if (picker.slotIndex < 0 || picker.slotIndex >= slots.length) return;
      slots[picker.slotIndex] = { widgetId: type };
      persist(setZoneSlots(config, picker.zone, slots));
      setPicker(null);
      setAnnounce("אפליקציה הוחלפה");
    },
    [config, persist, picker, zoneSlots],
  );

  const pickerOptions = useMemo(() => {
    if (!picker) return [];
    const used = widgetsUsedInZone(config, picker.zone);
    const current = zoneSlots(picker.zone)[picker.slotIndex]?.widgetId;
    if (current) used.delete(current);
    return filterWidgetsForPicker(permissionCtx, used);
  }, [config, permissionCtx, picker, zoneSlots]);

  const resetToDefault = useCallback(() => {
    persist(getDefaultLauncherConfig());
    setAnnounce("שוחזר לברירת מחדל");
  }, [persist]);

  const value = useMemo<LauncherConfigContextValue>(
    () => ({
      config,
      hydrated,
      editMode,
      setEditMode,
      enterEditMode: () => setEditMode(true),
      exitEditMode: () => {
        setEditMode(false);
        setPicker(null);
      },
      resetToDefault,
      zoneWidgets,
      zoneSlots,
      reorderZone,
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
