import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import { mapLauncherWidgetId } from "@/lib/os-assistant/resolve-widget-open";
import { packQuickGridCentered } from "./quick-grid";
import {
  buildDefaultQuickGrid,
  SIDEBAR_FOOTER_WIDGETS,
} from "./user-launcher-config.defaults";
import type { LauncherDefaultOptions, LauncherSlot, UserLauncherConfig } from "./user-launcher-config.types";
import { isRemovedLauncherWidgetId } from "./user-launcher-config-ids";

export function emptySlot(): LauncherSlot {
  return { widgetId: null };
}

/** מזהה אריח לשמירה — שומר קיצור legacy (docCreator, aiScanner) ולא מאחד ל-Hub */
function launcherTileWidgetId(raw: string): WidgetType | null {
  if (isRemovedLauncherWidgetId(raw)) return null;
  return normalizeWidgetAction(raw);
}

export function normalizeSlot(raw: unknown): LauncherSlot {
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

export function normalizeSidebarSlot(raw: unknown): LauncherSlot {
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

export function normalizeZone(raw: unknown, fallback: LauncherSlot[]): LauncherSlot[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  return raw.map(normalizeSlot);
}

export function scrubZoneSlots(slots: LauncherSlot[]): LauncherSlot[] {
  return slots.map((s) => {
    if (!s.widgetId) return emptySlot();
    return normalizeSidebarSlot(s);
  });
}

export function scrubSidebarSlots(slots: LauncherSlot[]): LauncherSlot[] {
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

const QUICK_GRID_EXTRA_ORDER: WidgetType[] = [
  "jewishCalendar",
  "googleCalendar",
  "meckanoReports",
  "googleDrive",
  "notebookLM",
  "accessibility",
  "helpCenter",
  "platformAdmin",
];

/** מוסיף אריחי תבנית חסרים (למשל שדרוג מ-6 ל-8 אריחים) */
export function mergeQuickGridWithTemplate(
  slots: LauncherSlot[],
  template: LauncherSlot[],
): LauncherSlot[] {
  const deduped = dedupeQuickGridSlots(slots.filter((s) => s.widgetId !== null));
  const present = new Set<WidgetType>();
  for (const s of deduped) {
    if (s.widgetId) present.add(canonicalHubTileId(s.widgetId));
  }
  const merged = [...deduped];
  for (const t of template) {
    if (!t.widgetId || present.has(t.widgetId)) continue;
    merged.push({ widgetId: t.widgetId });
    present.add(t.widgetId);
  }
  return merged;
}

/** מסדר מחדש לרשת hub ממורכזת לפי תבנית + תוספות */
export function repackQuickGridLayout(slots: LauncherSlot[], template: LauncherSlot[]): LauncherSlot[] {
  const deduped = dedupeQuickGridSlots(slots.filter((s) => s.widgetId !== null));
  const present = new Set<WidgetType>();
  for (const s of deduped) {
    if (s.widgetId) present.add(canonicalHubTileId(s.widgetId));
  }

  const ordered: WidgetType[] = [];
  for (const t of template) {
    if (!t.widgetId || !present.has(t.widgetId)) continue;
    ordered.push(t.widgetId);
    present.delete(t.widgetId);
  }
  for (const id of QUICK_GRID_EXTRA_ORDER) {
    if (present.has(id)) {
      ordered.push(id);
      present.delete(id);
    }
  }
  for (const id of present) {
    ordered.push(id);
  }

  if (ordered.length === 0) {
    return template.map((t) => ({ ...t }));
  }
  return packQuickGridCentered(ordered);
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

export function scrubQuickGridSlots(slots: LauncherSlot[]): LauncherSlot[] {
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

/** מנקה ווידג'טים שהוסרו / לא תקינים בכל האזורים */
export function scrubLauncherConfig(
  config: UserLauncherConfig,
  industryRaw?: string | null,
  options?: LauncherDefaultOptions,
): UserLauncherConfig {
  const template = buildDefaultQuickGrid(industryRaw, options);
  return {
    version: 2,
    quickGrid: repackQuickGridLayout(
      mergeQuickGridWithTemplate(scrubQuickGridSlots(config.quickGrid), template),
      template,
    ),
    sidebar: scrubSidebarSlots(config.sidebar),
    mobileBarStart: scrubZoneSlots(config.mobileBarStart),
    mobileBarEnd: scrubZoneSlots(config.mobileBarEnd),
    mobileMore: scrubZoneSlots(config.mobileMore),
  };
}
