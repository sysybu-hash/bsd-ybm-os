import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";

export type LauncherZone = "quickGrid" | "sidebar" | "mobileBarStart" | "mobileBarEnd" | "mobileMore";

export type LauncherSlot = {
  widgetId: WidgetType | null;
};

export type UserLauncherConfig = {
  version: 1;
  quickGrid: LauncherSlot[];
  sidebar: LauncherSlot[];
  mobileBarStart: LauncherSlot[];
  mobileBarEnd: LauncherSlot[];
  mobileMore: LauncherSlot[];
};

export const LAUNCHER_STORAGE_KEY = "bsd_ybm_launcher_v1";

function slot(id: WidgetType): LauncherSlot {
  return { widgetId: id };
}

function emptySlot(): LauncherSlot {
  return { widgetId: null };
}

export function getDefaultLauncherConfig(): UserLauncherConfig {
  return {
    version: 1,
    quickGrid: [
      slot("projectBoard"),
      slot("crmTable"),
      slot("erpArchive"),
      slot("docCreator"),
      slot("aiScanner"),
      slot("aiChatFull"),
      slot("googleDrive"),
      slot("notebookLM"),
    ],
    sidebar: [
      slot("dashboard"),
      slot("projectBoard"),
      slot("crmTable"),
      slot("erpArchive"),
      slot("docCreator"),
      slot("aiScanner"),
      slot("aiChatFull"),
      slot("meckanoReports"),
      slot("notebookLM"),
    ],
    mobileBarStart: [slot("dashboard"), slot("aiScanner"), slot("docCreator")],
    mobileBarEnd: [slot("crmTable")],
    mobileMore: [
      slot("projectBoard"),
      slot("erpArchive"),
      slot("aiChatFull"),
      slot("notebookLM"),
      slot("googleDrive"),
      slot("helpCenter"),
      slot("settings"),
      slot("accessibility"),
    ],
  };
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
  const w = (raw as LauncherSlot).widgetId;
  if (w === null) return emptySlot();
  if (typeof w !== "string") return emptySlot();
  const normalized = normalizeWidgetAction(w);
  return normalized ? { widgetId: normalized } : emptySlot();
}

function normalizeZone(raw: unknown, fallback: LauncherSlot[]): LauncherSlot[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...fallback];
  return raw.map(normalizeSlot);
}

export function mergeLauncherConfig(partial: unknown): UserLauncherConfig {
  const defaults = getDefaultLauncherConfig();
  if (!partial || typeof partial !== "object") return defaults;

  const p = partial as Partial<UserLauncherConfig>;
  return {
    version: 1,
    quickGrid: normalizeZone(p.quickGrid, defaults.quickGrid),
    sidebar: normalizeZone(p.sidebar, defaults.sidebar),
    mobileBarStart: normalizeZone(p.mobileBarStart, defaults.mobileBarStart),
    mobileBarEnd: normalizeZone(p.mobileBarEnd, defaults.mobileBarEnd),
    mobileMore: normalizeZone(p.mobileMore, defaults.mobileMore),
  };
}

export function parseLauncherConfigFromStorage(raw: string | null): UserLauncherConfig {
  if (!raw) return getDefaultLauncherConfig();
  try {
    return mergeLauncherConfig(JSON.parse(raw));
  } catch {
    return getDefaultLauncherConfig();
  }
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
