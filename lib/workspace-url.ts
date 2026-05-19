import type { WidgetType } from "@/hooks/use-window-manager";
import { encodeWidgetState, decodeWidgetState } from "@/lib/workspace-navigation/encoders";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

export const WORKSPACE_URL_PARAMS = {
  widget: "w",
  widgetInstance: "wid",
  state: "st",
} as const;

const WIDGET_TYPES = new Set<string>([
  "project",
  "cashflow",
  "aiChat",
  "crm",
  "dashboard",
  "erp",
  "quoteGen",
  "aiScanner",
  "projectBoard",
  "crmTable",
  "erpArchive",
  "docCreator",
  "aiChatFull",
  "settings",
  "meckanoReports",
  "googleDrive",
  "googleAssistant",
  "notebookLM",
  "accessibility",
  "platformAdmin",
  "helpCenter",
]);

export function parseWidgetType(raw: string | null): WidgetType | null {
  if (!raw || !WIDGET_TYPES.has(raw)) return null;
  return raw as WidgetType;
}

export type WorkspaceUrlIntent = {
  widgetType: WidgetType;
  widgetInstanceId?: string;
  viewState: WidgetViewState | null;
};

export function parseWorkspaceUrl(searchParams: URLSearchParams): WorkspaceUrlIntent | null {
  const widgetType = parseWidgetType(searchParams.get(WORKSPACE_URL_PARAMS.widget));
  if (!widgetType) return null;
  const st = searchParams.get(WORKSPACE_URL_PARAMS.state);
  const wid = searchParams.get(WORKSPACE_URL_PARAMS.widgetInstance) ?? undefined;
  return {
    widgetType,
    widgetInstanceId: wid,
    viewState: decodeWidgetState(widgetType, st),
  };
}

export function buildWorkspaceSearchParams(opts: {
  widgetType?: WidgetType | null;
  widgetInstanceId?: string | null;
  viewState?: WidgetViewState | null;
}): URLSearchParams {
  const sp = new URLSearchParams();
  if (opts.widgetType) {
    sp.set(WORKSPACE_URL_PARAMS.widget, opts.widgetType);
    const st = encodeWidgetState(opts.widgetType, opts.viewState ?? null);
    if (st) sp.set(WORKSPACE_URL_PARAMS.state, st);
    if (opts.widgetInstanceId) sp.set(WORKSPACE_URL_PARAMS.widgetInstance, opts.widgetInstanceId);
  }
  return sp;
}

export function workspaceUrlFromParams(sp: URLSearchParams): string {
  const q = sp.toString();
  return q ? `/?${q}` : "/";
}
