import type { WidgetType } from "@/hooks/use-window-manager";
import { getDefaultLauncherConfig, isQuickGridEmpty } from "./user-launcher-config.defaults";
import { LAUNCHER_ZONE_MAX_SLOTS } from "./user-launcher-config.layout";
import { emptySlot, normalizeZone, scrubLauncherConfig } from "./user-launcher-config-slots";

export {
  LAUNCHER_PICKER_GRID_CLASS,
  LAUNCHER_PICKER_GRID_CONTAINER_CLASS,
  LAUNCHER_PICKER_ROW_CLASS,
  LAUNCHER_PICKER_TILE_CLASS,
  LAUNCHER_QUICK_DESKTOP_GRID_CLASS,
  LAUNCHER_QUICK_DESKTOP_WRAP_CLASS,
  LAUNCHER_QUICK_EDIT_GRID_CLASS,
  LAUNCHER_QUICK_EDIT_SCROLL_CLASS,
  LAUNCHER_QUICK_GRID_CLASS,
  LAUNCHER_QUICK_GRID_CONTAINER_CLASS,
  LAUNCHER_QUICK_MOBILE_GRID_CLASS,
  LAUNCHER_QUICK_MOBILE_TILE_WRAPPER_CLASS,
  LAUNCHER_QUICK_ROW_CLASS,
  LAUNCHER_QUICK_TILE_WRAPPER_CLASS,
  LAUNCHER_ZONE_MAX_SLOTS,
} from "./user-launcher-config.layout";

export type {
  LauncherDefaultOptions,
  LauncherSlot,
  LauncherZone,
  UserLauncherConfig,
} from "./user-launcher-config.types";
export {
  BUSINESS_MGMT_QUICK_GRID,
  buildDefaultLauncherConfig,
  buildDefaultQuickGrid,
  buildIndustryLauncherConfig,
  CONSTRUCTION_QUICK_GRID,
  DEFAULT_QUICK_GRID,
  getDefaultLauncherConfig,
  isQuickGridEmpty,
  shouldUsePlatformLauncherDefault,
  SIDEBAR_FOOTER_WIDGETS,
  usesBusinessMgmtQuickGrid,
} from "./user-launcher-config.defaults";

export {
  dedupeQuickGridSlots,
  ensureMeckanoLauncherSlots,
  mergeQuickGridWithTemplate,
  repackQuickGridLayout,
  scrubLauncherConfig,
} from "./user-launcher-config-slots";

export { isRemovedLauncherWidgetId } from "./user-launcher-config-ids";

import type { LauncherDefaultOptions, LauncherSlot, LauncherZone, UserLauncherConfig } from "./user-launcher-config.types";

export const LAUNCHER_STORAGE_KEY = "bsd_ybm_launcher_v2";
export const LAUNCHER_STORAGE_KEY_LEGACY = "bsd_ybm_launcher_v1";

/** ממזג שמירה בשרת/localStorage; quickGrid ריק → ברירת מחדל, שאר האזורים נשמרים */
export function resolveStoredLauncherConfig(
  stored: unknown,
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  if (!stored || typeof stored !== "object") {
    return getDefaultLauncherConfig(industryRaw, options);
  }
  if ((stored as Partial<UserLauncherConfig>).version !== 2) {
    return getDefaultLauncherConfig(industryRaw, options);
  }
  return mergeLauncherConfig(stored, industryRaw, options);
}

const ZONE_KEYS: LauncherZone[] = [
  "quickGrid",
  "sidebar",
  "mobileBarStart",
  "mobileBarEnd",
  "mobileMore",
];

export function mergeLauncherConfig(
  partial: unknown,
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  const defaults = getDefaultLauncherConfig(industryRaw, options);
  if (!partial || typeof partial !== "object") return defaults;

  const p = partial as Partial<UserLauncherConfig>;
  const quickGrid = isQuickGridEmpty(p.quickGrid)
    ? defaults.quickGrid
    : normalizeZone(p.quickGrid, defaults.quickGrid);

  return scrubLauncherConfig(
    {
      version: 2,
      quickGrid,
      sidebar: normalizeZone(p.sidebar, defaults.sidebar),
      mobileBarStart: normalizeZone(p.mobileBarStart, defaults.mobileBarStart),
      mobileBarEnd: normalizeZone(p.mobileBarEnd, defaults.mobileBarEnd),
      mobileMore: normalizeZone(p.mobileMore, defaults.mobileMore),
    },
    industryRaw,
    options,
  );
}

export function parseLauncherConfigFromStorage(
  raw: string | null,
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  if (!raw) return getDefaultLauncherConfig(industryRaw, options);
  try {
    const parsed = JSON.parse(raw) as Partial<UserLauncherConfig>;
    if (parsed.version !== 2) {
      return getDefaultLauncherConfig(industryRaw, options);
    }
    return resolveStoredLauncherConfig(parsed, industryRaw, options);
  } catch {
    return getDefaultLauncherConfig(industryRaw, options);
  }
}

/** טוען v2 בלבד; אין מיגרציה מ-v1 — איפוס נקי */
export function readLauncherConfigFromBrowser(
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  if (typeof window === "undefined") return getDefaultLauncherConfig(industryRaw, options);
  const v2 = localStorage.getItem(LAUNCHER_STORAGE_KEY);
  if (v2) return parseLauncherConfigFromStorage(v2, industryRaw, options);
  return getDefaultLauncherConfig(industryRaw, options);
}

export function resolveZoneWidgets(
  config: UserLauncherConfig,
  zone: LauncherZone,
  options?: { includePlatformAdmin?: boolean },
): WidgetType[] {
  const slots = config[zone];
  const seen = new Set<WidgetType>();
  const out: WidgetType[] = [];
  for (const s of slots) {
    if (!s.widgetId || seen.has(s.widgetId)) continue;
    if (s.widgetId === "platformAdmin" && !options?.includePlatformAdmin) continue;
    seen.add(s.widgetId);
    out.push(s.widgetId);
  }
  return out;
}

export function setZoneSlots(
  config: UserLauncherConfig,
  zone: LauncherZone,
  slots: LauncherSlot[],
): UserLauncherConfig {
  return { ...config, [zone]: slots };
}

export function widgetsUsedInZone(config: UserLauncherConfig, zone: LauncherZone): Set<WidgetType> {
  return new Set(
    config[zone].map((s) => s.widgetId).filter((id): id is WidgetType => id !== null),
  );
}

export function allZones(): LauncherZone[] {
  return [...ZONE_KEYS];
}

/** מסיר רק מקומות ריקים בסוף המערך (לא באמצע) */
export function trimTrailingEmptySlots(slots: LauncherSlot[]): LauncherSlot[] {
  const out = [...slots];
  while (out.length > 0 && out[out.length - 1]?.widgetId === null) {
    out.pop();
  }
  return out;
}

/** מסיר את כל המקומות הריקים — לשמירה אחרי מצב עריכה (שומר row/col ב-quickGrid) */
export function compactZoneSlots(slots: LauncherSlot[], zone?: LauncherZone): LauncherSlot[] {
  const filled = slots.filter((s) => s.widgetId !== null);
  if (zone === "quickGrid") {
    return filled.filter((s) => typeof s.row === "number" && typeof s.col === "number");
  }
  return filled;
}

/** מוסיף מקום ריק אחד בסוף כדי לאפשר הוספת אייקון נוסף במצב עריכה */
export function ensureEditTrailingEmptySlot(
  slots: LauncherSlot[],
  canAddMore: boolean,
): LauncherSlot[] {
  if (!canAddMore) return trimTrailingEmptySlots(slots);
  const trimmed = trimTrailingEmptySlots(slots);
  if (trimmed.length >= LAUNCHER_ZONE_MAX_SLOTS) return trimmed;
  if (trimmed.length > 0 && trimmed[trimmed.length - 1]?.widgetId === null) return trimmed;
  return [...trimmed, emptySlot()];
}

export function isExpandableLauncherZone(zone: LauncherZone): boolean {
  return zone === "quickGrid" || zone === "sidebar";
}
