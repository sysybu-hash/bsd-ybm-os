import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";

export type WidgetOpenRequest = {
  type: WidgetType;
  liveData: Record<string, unknown> | null;
};

const HUB_OPEN_MAP: Record<
  string,
  { hub: WidgetType; tab: string; mergeKeys?: string[] }
> = {
  dashboard: { hub: "financeHub", tab: "overview" },
  cashflow: { hub: "financeHub", tab: "cashflow" },
  projectBoard: { hub: "projectsHub", tab: "board" },
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
  };
  return map[type] ?? type;
}
