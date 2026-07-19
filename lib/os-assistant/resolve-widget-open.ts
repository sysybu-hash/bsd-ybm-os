import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";

export type WidgetOpenRequest = {
  type: WidgetType;
  liveData: Record<string, unknown> | null;
};

/** Legacy widget IDs consolidated into hubs — hide from picker, collapse in launcher scrub */
export const CONSOLIDATED_LEGACY_WIDGET_IDS = [
  "dashboard",
  "cashflow",
  "projectBoard",
  "project",
  "erp",
  "erpArchive",
  "docCreator",
  "quoteGen",
  "aiScanner",
  "scan",
  "aiChat",
  "aiChatFull",
  "notebookLM",
  "appBuilder",
  "crm",
] as const;

const CONSOLIDATED_LEGACY_SET = new Set<string>(CONSOLIDATED_LEGACY_WIDGET_IDS);

export function isConsolidatedLegacyWidgetId(id: string): boolean {
  return CONSOLIDATED_LEGACY_SET.has(id);
}

const HUB_OPEN_MAP: Record<
  string,
  { hub: WidgetType; tab: string; dashboardTab?: string; mergeKeys?: string[] }
> = {
  dashboard: { hub: "financeHub", tab: "overview" },
  cashflow: { hub: "financeHub", tab: "cashflow" },
  projectBoard: {
    hub: "projectsHub",
    tab: "project",
    dashboardTab: "tasks",
    mergeKeys: ["projectId", "name"],
  },
  project: { hub: "projectsHub", tab: "project", mergeKeys: ["projectId", "name"] },
  erp: { hub: "documentsHub", tab: "archive" },
  erpArchive: { hub: "documentsHub", tab: "archive" },
  quoteGen: { hub: "documentsHub", tab: "create" },
  docCreator: { hub: "documentsHub", tab: "create" },
  aiScanner: { hub: "documentsHub", tab: "scan" },
  scan: { hub: "documentsHub", tab: "scan" },
  aiChat: { hub: "aiHub", tab: "chat" },
  aiChatFull: { hub: "aiHub", tab: "chat" },
  notebookLM: { hub: "aiHub", tab: "notebook" },
  appBuilder: { hub: "aiHub", tab: "builder" },
  crm: { hub: "crmTable", tab: "" },
};

/** ממפה פתיחת ווידג'ט ישן ל-Hub + tab; משמש launcher, omnibar ואוטומציות */
export function resolveWidgetOpen(
  raw: string,
  data?: Record<string, unknown> | null,
): WidgetOpenRequest | null {
  const key = raw.trim();
  if (!key) return null;

  const route = HUB_OPEN_MAP[key];
  const normalized = normalizeWidgetAction(key);
  if (!normalized) return null;

  const merged: Record<string, unknown> = { ...(data ?? {}) };
  if (route) {
    if (merged.tab == null && route.tab) merged.tab = route.tab;
    if (merged.dashboardTab == null && route.dashboardTab) {
      merged.dashboardTab = route.dashboardTab;
    }
    return {
      type: route.hub,
      liveData: Object.keys(merged).length > 0 ? merged : route.tab ? { tab: route.tab } : null,
    };
  }

  return {
    type: normalized,
    liveData: Object.keys(merged).length > 0 ? merged : null,
  };
}

/** מזהה launcher — מחליף אריחים שעברו לאיחוד */
export function mapLauncherWidgetId(type: WidgetType): WidgetType {
  const map: Partial<Record<WidgetType, WidgetType>> = {
    dashboard: "financeHub",
    cashflow: "financeHub",
    projectBoard: "projectsHub",
    project: "projectsHub",
    erpArchive: "documentsHub",
    erp: "documentsHub",
    quoteGen: "documentsHub",
    docCreator: "documentsHub",
    aiScanner: "documentsHub",
    aiChatFull: "aiHub",
    aiChat: "aiHub",
    notebookLM: "aiHub",
    appBuilder: "aiHub",
    crm: "crmTable",
  };
  return map[type] ?? type;
}
