import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import { mapLauncherWidgetId } from "@/lib/os-assistant/resolve-widget-open";
import {
  buildDefaultQuickGrid,
  getDefaultLauncherConfig,
  isQuickGridEmpty,
  SIDEBAR_FOOTER_WIDGETS,
} from "./user-launcher-config.defaults";

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
  DEFAULT_QUICK_GRID,
  getDefaultLauncherConfig,
  isQuickGridEmpty,
  shouldUsePlatformLauncherDefault,
  SIDEBAR_FOOTER_WIDGETS,
  usesBusinessMgmtQuickGrid,
} from "./user-launcher-config.defaults";

import type { LauncherDefaultOptions, LauncherSlot, LauncherZone, UserLauncherConfig } from "./user-launcher-config.types";

export const LAUNCHER_STORAGE_KEY = "bsd_ybm_launcher_v2";
export const LAUNCHER_STORAGE_KEY_LEGACY = "bsd_ybm_launcher_v1";

/** מקסימום אריחים לאזור — מספיק לכל האפליקציות הזמינות + מרווח */
export const LAUNCHER_ZONE_MAX_SLOTS = 48;

/** מעטפת quick grid — רוחב מלא של שטח העבודה (ללא max-w מרכזי) */
export const LAUNCHER_QUICK_GRID_CONTAINER_CLASS =
  "flex w-full shrink-0 flex-col items-center justify-center gap-3 overflow-hidden px-3 md:px-4";

/** מעטפת רשת דסקטופ — ממורכזת, בלי גלילה אופקית */
export const LAUNCHER_QUICK_DESKTOP_WRAP_CLASS =
  "hidden w-full justify-center overflow-hidden md:flex";

/** רשת 3 עמודות במובייל — ממורכזת */
export const LAUNCHER_QUICK_MOBILE_GRID_CLASS =
  "mx-auto grid w-full max-w-[min(100%,360px)] grid-cols-3 gap-2.5 place-items-center overflow-hidden py-1 md:hidden";

/** אריח מוקטן לרשת 3×N במובייל */
export const LAUNCHER_QUICK_MOBILE_TILE_WRAPPER_CLASS =
  "h-[100px] w-full max-w-[112px] min-w-0 shrink-0";

export const LAUNCHER_QUICK_ROW_CLASS = "flex w-full flex-wrap justify-center gap-3";

/** גודל אריח קבוע — לא נמתח כשיש מעט פריטים בשורה */
export const LAUNCHER_QUICK_TILE_WRAPPER_CLASS = "h-[140px] w-[140px] shrink-0 flex-none";

/** רשת עריכה — עמודות/שורות דינמיות ב־inline style; LTR לקואורדינטות עקביות */
export const LAUNCHER_QUICK_EDIT_GRID_CLASS =
  "grid shrink-0 justify-items-center gap-3 rounded-xl border border-dashed border-indigo-400/30 [direction:ltr] bg-[color:var(--surface-card)]/40 p-3 shadow-sm";

/** מעטפת עריכת quick grid — ממורכזת, ללא גלילה מיותרת */
export const LAUNCHER_QUICK_EDIT_SCROLL_CLASS =
  "flex min-h-0 w-full flex-1 items-start justify-center overflow-hidden overscroll-contain px-1 py-2 md:overflow-x-auto md:overflow-y-auto";

/** @deprecated השתמשו ב־LAUNCHER_QUICK_GRID_CONTAINER_CLASS + שורות */
export const LAUNCHER_QUICK_GRID_CLASS = LAUNCHER_QUICK_GRID_CONTAINER_CLASS;

export const LAUNCHER_PICKER_GRID_CONTAINER_CLASS =
  "flex w-full flex-col items-center gap-2";

export const LAUNCHER_PICKER_ROW_CLASS = "flex w-full flex-wrap justify-center gap-2";

export const LAUNCHER_PICKER_TILE_CLASS = "w-[min(100%,96px)] shrink-0";

/** @deprecated השתמשו ב־LAUNCHER_PICKER_GRID_CONTAINER_CLASS + שורות */
export const LAUNCHER_PICKER_GRID_CLASS = LAUNCHER_PICKER_GRID_CONTAINER_CLASS;

/** ווידג'טים שהוסרו מהמערכת — מסוננים מ-localStorage ומברירת מחדל */
const REMOVED_LAUNCHER_WIDGET_IDS = new Set([
  "googleassistant",
  "google-assistant",
  "google_assistant",
  "google assistant",
  "negotiate",
  "omnibar",
]);

export function isRemovedLauncherWidgetId(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  return REMOVED_LAUNCHER_WIDGET_IDS.has(key);
}

function emptySlot(): LauncherSlot {
  return { widgetId: null };
}

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

/** מזהה אריח לשמירה — שומר קיצור legacy (docCreator, aiScanner) ולא מאחד ל-Hub */
function launcherTileWidgetId(raw: string): WidgetType | null {
  if (isRemovedLauncherWidgetId(raw)) return null;
  return normalizeWidgetAction(raw);
}

function normalizeSlot(raw: unknown): LauncherSlot {
  if (!raw || typeof raw !== "object") return emptySlot();
  const o = raw as LauncherSlot;
  const w = o.widgetId;
  const row = typeof o.row === "number" && o.row >= 0 ? Math.floor(o.row) : undefined;
  const col = typeof o.col === "number" && o.col >= 0 ? Math.floor(o.col) : undefined;
  if (w === null) return row !== undefined || col !== undefined ? { widgetId: null, row, col } : emptySlot();
  if (typeof w !== "string") return emptySlot();
  const tileId = launcherTileWidgetId(w);
  return tileId ? { widgetId: tileId, row, col } : emptySlot();
}

function normalizeSidebarSlot(raw: unknown): LauncherSlot {
  if (!raw || typeof raw !== "object") return emptySlot();
  const o = raw as LauncherSlot;
  const w = o.widgetId;
  if (w === null) return emptySlot();
  if (typeof w !== "string") return emptySlot();
  if (isRemovedLauncherWidgetId(w)) return emptySlot();
  const normalized = normalizeWidgetAction(w);
  const mapped = normalized ? mapLauncherWidgetId(normalized) : null;
  return mapped ? { widgetId: mapped } : emptySlot();
}

function normalizeZone(raw: unknown, fallback: LauncherSlot[]): LauncherSlot[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  return raw.map(normalizeSlot);
}

/** מוסיף אריח מקאנו לסרגל הצד אם חסר — למנוי מורשה */
export function ensureMeckanoLauncherSlots(
  config: UserLauncherConfig,
  meckanoEnabled: boolean,
): UserLauncherConfig {
  if (!meckanoEnabled) return config;
  if (config.sidebar.some((s) => s.widgetId === "meckanoReports")) return config;

  const sidebar = [...config.sidebar];
  const afterAiChat = sidebar.findIndex((s) => s.widgetId === "aiChatFull");
  const slot: LauncherSlot = { widgetId: "meckanoReports" };
  if (afterAiChat >= 0) {
    sidebar.splice(afterAiChat + 1, 0, slot);
  } else {
    sidebar.push(slot);
  }
  return { ...config, sidebar };
}

function scrubZoneSlots(slots: LauncherSlot[]): LauncherSlot[] {
  return slots.map((s) => {
    if (!s.widgetId) return emptySlot();
    return normalizeSidebarSlot(s);
  });
}

function scrubSidebarSlots(slots: LauncherSlot[]): LauncherSlot[] {
  const seen = new Set<WidgetType>();
  const out: LauncherSlot[] = [];
  for (const s of scrubZoneSlots(slots)) {
    if (!s.widgetId) continue;
    if (SIDEBAR_FOOTER_WIDGETS.has(s.widgetId)) continue;
    if (seen.has(s.widgetId)) continue;
    seen.add(s.widgetId);
    out.push(s);
  }
  return out;
}

const DOCUMENT_QUICK_TILES = new Set<WidgetType>([
  "docCreator",
  "aiScanner",
  "erp",
  "erpArchive",
  "quoteGen",
  "documentsHub",
]);

function canonicalHubTileId(id: WidgetType): WidgetType {
  if (DOCUMENT_QUICK_TILES.has(id)) return "documentsHub";
  return mapLauncherWidgetId(id);
}

/** מסדר מחדש לרשת 3×2 לפי תבנית — בלי חורים בעמודות */
export function repackQuickGridLayout(slots: LauncherSlot[], template: LauncherSlot[]): LauncherSlot[] {
  const deduped = dedupeQuickGridSlots(slots.filter((s) => s.widgetId !== null));
  const present = new Set<WidgetType>();
  for (const s of deduped) {
    if (s.widgetId) present.add(canonicalHubTileId(s.widgetId));
  }

  const packed: LauncherSlot[] = [];
  for (const t of template) {
    if (!t.widgetId || !present.has(t.widgetId)) continue;
    packed.push({
      widgetId: t.widgetId,
      row: t.row,
      col: t.col,
    });
  }

  const extras = [...present].filter((id) => !packed.some((p) => p.widgetId === id));
  let idx = packed.length;
  for (const widgetId of extras) {
    packed.push({
      widgetId,
      row: Math.floor(idx / 3),
      col: idx % 3,
    });
    idx++;
  }

  return packed.length > 0 ? packed : template.map((t) => ({ ...t }));
}

/** מסיר כפילויות באותו widgetId (למשל שלושה documentsHub אחרי מיגרציה ישנה) */
export function dedupeQuickGridSlots(slots: LauncherSlot[]): LauncherSlot[] {
  const seen = new Set<WidgetType>();
  const out: LauncherSlot[] = [];
  const ordered = [...slots].sort((a, b) => {
    const ar = a.row ?? 999;
    const br = b.row ?? 999;
    if (ar !== br) return ar - br;
    return (a.col ?? 999) - (b.col ?? 999);
  });
  for (const s of ordered) {
    if (!s.widgetId) continue;
    const tileId = launcherTileWidgetId(s.widgetId);
    if (!tileId || seen.has(tileId)) continue;
    seen.add(tileId);
    const row = typeof s.row === "number" && s.row >= 0 ? Math.floor(s.row) : undefined;
    const col = typeof s.col === "number" && s.col >= 0 ? Math.floor(s.col) : undefined;
    if (row !== undefined && col !== undefined) {
      out.push({ widgetId: tileId, row, col });
    } else {
      out.push({ widgetId: tileId });
    }
  }
  return out.length > 0 ? out : slots;
}

function scrubQuickGridSlots(slots: LauncherSlot[]): LauncherSlot[] {
  const scrubbed = slots.map((s) => {
    if (!s.widgetId) return emptySlot();
    const tileId = launcherTileWidgetId(s.widgetId);
    if (!tileId) return emptySlot();
    const row = typeof s.row === "number" && s.row >= 0 ? Math.floor(s.row) : undefined;
    const col = typeof s.col === "number" && s.col >= 0 ? Math.floor(s.col) : undefined;
    if (row !== undefined && col !== undefined) {
      return { widgetId: tileId, row, col };
    }
    return { widgetId: tileId };
  });
  return dedupeQuickGridSlots(scrubbed.filter((s) => s.widgetId !== null));
}

/** מנקה ווידג'טים שהוסרו / לא תקינים בכל האזורים */
export function scrubLauncherConfig(
  config: UserLauncherConfig,
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  const template = buildDefaultQuickGrid(industryRaw, options);
  return {
    version: 2,
    quickGrid: repackQuickGridLayout(scrubQuickGridSlots(config.quickGrid), template),
    sidebar: scrubSidebarSlots(config.sidebar),
    mobileBarStart: scrubZoneSlots(config.mobileBarStart),
    mobileBarEnd: scrubZoneSlots(config.mobileBarEnd),
    mobileMore: scrubZoneSlots(config.mobileMore),
  };
}

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
