import type { WidgetType } from "@/hooks/use-window-manager";
import { resolveWidgetOpen } from "@/lib/os-assistant/resolve-widget-open";
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
  "googleCalendar",
  "notebookLM",
  "accessibility",
  "platformAdmin",
  "helpCenter",
  "fieldCopilot",
  "financeHub",
  "projectsHub",
  "documentsHub",
  "aiHub",
  "appBuilder",
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
  const widgetRaw =
    searchParams.get(WORKSPACE_URL_PARAMS.widget) ?? searchParams.get("widget");
  const urlProjectId = searchParams.get("projectId");
  const aliasData =
    urlProjectId && urlProjectId.trim() ? { projectId: urlProjectId.trim() } : null;
  const resolved = widgetRaw ? resolveWidgetOpen(widgetRaw, aliasData) : null;
  const widgetType = resolved?.type ?? parseWidgetType(widgetRaw);
  if (!widgetType) return null;
  const st = searchParams.get(WORKSPACE_URL_PARAMS.state);
  const wid = searchParams.get(WORKSPACE_URL_PARAMS.widgetInstance) ?? undefined;
  let viewState = decodeWidgetState(widgetType, st);
  if (resolved?.liveData) {
    viewState = { ...(viewState ?? {}), ...resolved.liveData };
  }
  if (
    urlProjectId &&
    urlProjectId.trim() &&
    (widgetType === "project" || widgetType === "projectsHub")
  ) {
    viewState = { ...(viewState ?? {}), projectId: urlProjectId.trim() };
  }
  return {
    widgetType,
    widgetInstanceId: wid,
    viewState,
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
    const projectId = opts.viewState?.projectId;
    if (opts.widgetType === "project" && typeof projectId === "string" && projectId.trim()) {
      sp.set("projectId", projectId.trim());
    }
  }
  return sp;
}

export function workspaceUrlFromParams(sp: URLSearchParams): string {
  const q = sp.toString();
  return q ? `/?${q}` : "/";
}
