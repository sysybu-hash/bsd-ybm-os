import type { WidgetType } from "@/hooks/use-window-manager";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import { mapLauncherWidgetId } from "@/lib/os-assistant/resolve-widget-open";

export type LauncherZone = "quickGrid" | "sidebar" | "mobileBarStart" | "mobileBarEnd" | "mobileMore";

export type LauncherSlot = {
  widgetId: WidgetType | null;
  /** מיקום ברשת quickGrid (מצב עריכה חופשי) */
  row?: number;
  col?: number;
};

export type UserLauncherConfig = {
  version: 1 | 2;
  quickGrid: LauncherSlot[];
  sidebar: LauncherSlot[];
  mobileBarStart: LauncherSlot[];
  mobileBarEnd: LauncherSlot[];
  mobileMore: LauncherSlot[];
};

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

function slot(id: WidgetType): LauncherSlot {
  return { widgetId: id };
}

function gridSlot(id: WidgetType, row: number, col: number): LauncherSlot {
  return { widgetId: id, row, col };
}

function emptySlot(): LauncherSlot {
  return { widgetId: null };
}

/**
 * ברירת מחדל ל-quick grid — 2×6 (7 עמודות מקס), קואורדינטות LTR.
 * סדר RTL בשורה: מרכז שליטה → … → דאשבורד (שורה 0), מרכז עזרה → … → צ'אט AI (שורה 1).
 */
/** 6 אריחי Hub — שורה 0: פיננסים · פרויקטים · CRM; שורה 1: מסמכים · קופיילוט · AI */
export const DEFAULT_QUICK_GRID: LauncherSlot[] = [
  gridSlot("financeHub", 0, 0),
  gridSlot("projectsHub", 0, 1),
  gridSlot("crmTable", 0, 2),
  gridSlot("documentsHub", 1, 0),
  gridSlot("fieldCopilot", 1, 1),
  gridSlot("aiHub", 1, 2),
];

function buildDefaultQuickGrid(): LauncherSlot[] {
  return DEFAULT_QUICK_GRID.map((s) => ({ ...s }));
}

export function isQuickGridEmpty(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  return raw.every((s) => {
    if (!s || typeof s !== "object") return true;
    const w = (s as LauncherSlot).widgetId;
    return w === null || w === undefined;
  });
}

/** אין שמירה מותאמת — משתמשים בברירת מחדל הפלטפורמה */
export function shouldUsePlatformLauncherDefault(partial: unknown): boolean {
  if (!partial || typeof partial !== "object") return true;
  return isQuickGridEmpty((partial as Partial<UserLauncherConfig>).quickGrid);
}

export function buildDefaultLauncherConfig(industryRaw?: string | null): UserLauncherConfig {
  const company = isCompanyMgmtIndustry(industryRaw);
  const quickGrid = company
    ? DEFAULT_QUICK_GRID.map((s) =>
        s.widgetId === "fieldCopilot" ? emptySlot() : { ...s },
      )
    : buildDefaultQuickGrid();

  return {
    version: 2,
    quickGrid,
    sidebar: [
      slot("financeHub"),
      slot("projectsHub"),
      slot("crmTable"),
      slot("documentsHub"),
      ...(company ? [] : [slot("fieldCopilot")]),
      slot("aiHub"),
      ...(company ? [] : [slot("meckanoReports")]),
      slot("googleDrive"),
      slot("helpCenter"),
      slot("settings"),
      slot("accessibility"),
    ],
    mobileBarStart: company
      ? [slot("financeHub"), slot("documentsHub"), slot("crmTable")]
      : [slot("fieldCopilot"), slot("documentsHub"), slot("projectsHub")],
    mobileBarEnd: [slot("aiHub")],
    mobileMore: [
      ...(company ? [] : [slot("fieldCopilot")]),
      slot("financeHub"),
      slot("projectsHub"),
      slot("crmTable"),
      slot("googleDrive"),
      slot("helpCenter"),
      slot("settings"),
      slot("accessibility"),
      ...(company ? [] : [slot("meckanoReports")]),
    ],
  };
}

/** ברירת מחדל לפי ענף — בנייה וניהול חברה משתמשים באותה פריסת 12 אריחים */
export function buildIndustryLauncherConfig(industryRaw?: string | null): UserLauncherConfig {
  return buildDefaultLauncherConfig(industryRaw);
}

export function getDefaultLauncherConfig(industryRaw?: string | null): UserLauncherConfig {
  return buildIndustryLauncherConfig(industryRaw);
}

/** ממזג שמירה בשרת/localStorage; quickGrid ריק → ברירת מחדל, שאר האזורים נשמרים */
export function resolveStoredLauncherConfig(
  stored: unknown,
  industryRaw?: string | null,
): UserLauncherConfig {
  if (!stored || typeof stored !== "object") {
    return getDefaultLauncherConfig(industryRaw);
  }
  if ((stored as Partial<UserLauncherConfig>).version !== 2) {
    return getDefaultLauncherConfig(industryRaw);
  }
  return mergeLauncherConfig(stored, industryRaw);
}

const ZONE_KEYS: LauncherZone[] = [
  "quickGrid",
  "sidebar",
  "mobileBarStart",
  "mobileBarEnd",
  "mobileMore",
];

function normalizeSlot(raw: unknown): LauncherSlot {
  if (!raw || typeof raw !== "object") return emptySlot();
  const o = raw as LauncherSlot;
  const w = o.widgetId;
  const row = typeof o.row === "number" && o.row >= 0 ? Math.floor(o.row) : undefined;
  const col = typeof o.col === "number" && o.col >= 0 ? Math.floor(o.col) : undefined;
  if (w === null) return row !== undefined || col !== undefined ? { widgetId: null, row, col } : emptySlot();
  if (typeof w !== "string") return emptySlot();
  if (isRemovedLauncherWidgetId(w)) return emptySlot();
  const normalized = normalizeWidgetAction(w);
  const mapped = normalized ? mapLauncherWidgetId(normalized) : null;
  return mapped ? { widgetId: mapped, row, col } : emptySlot();
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
    if (isRemovedLauncherWidgetId(s.widgetId)) return emptySlot();
    const normalized = normalizeWidgetAction(s.widgetId);
    const mapped = normalized ? mapLauncherWidgetId(normalized) : null;
    return mapped ? { widgetId: mapped } : emptySlot();
  });
}

function scrubQuickGridSlots(slots: LauncherSlot[]): LauncherSlot[] {
  return slots.map((s) => {
    if (!s.widgetId) return emptySlot();
    if (isRemovedLauncherWidgetId(s.widgetId)) return emptySlot();
    const normalized = normalizeWidgetAction(s.widgetId);
    const mapped = normalized ? mapLauncherWidgetId(normalized) : null;
    if (!mapped) return emptySlot();
    const row = typeof s.row === "number" && s.row >= 0 ? Math.floor(s.row) : undefined;
    const col = typeof s.col === "number" && s.col >= 0 ? Math.floor(s.col) : undefined;
    if (row !== undefined && col !== undefined) {
      return { widgetId: mapped, row, col };
    }
    return { widgetId: mapped };
  });
}

/** מנקה ווידג'טים שהוסרו / לא תקינים בכל האזורים */
export function scrubLauncherConfig(config: UserLauncherConfig): UserLauncherConfig {
  return {
    version: 2,
    quickGrid: scrubQuickGridSlots(config.quickGrid),
    sidebar: scrubZoneSlots(config.sidebar),
    mobileBarStart: scrubZoneSlots(config.mobileBarStart),
    mobileBarEnd: scrubZoneSlots(config.mobileBarEnd),
    mobileMore: scrubZoneSlots(config.mobileMore),
  };
}

export function mergeLauncherConfig(
  partial: unknown,
  industryRaw?: string | null,
): UserLauncherConfig {
  const defaults = getDefaultLauncherConfig(industryRaw);
  if (!partial || typeof partial !== "object") return defaults;

  const p = partial as Partial<UserLauncherConfig>;
  const quickGrid = isQuickGridEmpty(p.quickGrid)
    ? defaults.quickGrid
    : normalizeZone(p.quickGrid, defaults.quickGrid);

  return scrubLauncherConfig({
    version: 2,
    quickGrid,
    sidebar: normalizeZone(p.sidebar, defaults.sidebar),
    mobileBarStart: normalizeZone(p.mobileBarStart, defaults.mobileBarStart),
    mobileBarEnd: normalizeZone(p.mobileBarEnd, defaults.mobileBarEnd),
    mobileMore: normalizeZone(p.mobileMore, defaults.mobileMore),
  });
}

export function parseLauncherConfigFromStorage(
  raw: string | null,
  industryRaw?: string | null,
): UserLauncherConfig {
  if (!raw) return getDefaultLauncherConfig(industryRaw);
  try {
    const parsed = JSON.parse(raw) as Partial<UserLauncherConfig>;
    if (parsed.version !== 2) {
      return getDefaultLauncherConfig(industryRaw);
    }
    return resolveStoredLauncherConfig(parsed, industryRaw);
  } catch {
    return getDefaultLauncherConfig(industryRaw);
  }
}

/** טוען v2 בלבד; אין מיגרציה מ-v1 — איפוס נקי */
export function readLauncherConfigFromBrowser(
  industryRaw?: string | null,
): UserLauncherConfig {
  if (typeof window === "undefined") return getDefaultLauncherConfig(industryRaw);
  const v2 = localStorage.getItem(LAUNCHER_STORAGE_KEY);
  if (v2) return parseLauncherConfigFromStorage(v2, industryRaw);
  return getDefaultLauncherConfig(industryRaw);
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
