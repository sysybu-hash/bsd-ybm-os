import type { WidgetType } from "@/hooks/use-window-manager";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";
import { isConsolidatedLegacyWidgetId } from "@/lib/os-assistant/resolve-widget-open";
import { isSubscriberWidgetVisible } from "@/lib/launcher/subscriber-widgets";

export type LauncherPermissionContext = {
  isPlatformAdmin: boolean;
  organizationIndustry?: string | null;
  userEmail?: string | null;
  /** Org role from session (ORG_ADMIN, EMPLOYEE, CLIENT, …) */
  role?: string | null;
  /** מוסתר כשאין הרשאת מקאנו */
  meckanoEnabled?: boolean;
  calendarGoogleEnabled?: boolean;
};

/** FIELD/MEMBER-equivalent: hide advanced builder / command / executive surfaces */
const SIMPLE_ROLE_HIDDEN = new Set<WidgetType>([
  "appBuilder",
  "universalCommand",
  "executiveHub",
  "procurementHub",
  "logisticsHub",
  "fieldCopilot",
]);

function isSimpleWorkspaceRole(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toUpperCase();
  return r === "EMPLOYEE" || r === "CLIENT" || r === "FIELD" || r === "MEMBER";
}

function isWidgetAllowed(type: WidgetType, ctx: LauncherPermissionContext): boolean {
  if (!isSubscriberWidgetVisible(type, ctx.userEmail)) return false;
  if (type === "platformAdmin" && !ctx.isPlatformAdmin) return false;
  if (isSimpleWorkspaceRole(ctx.role) && SIMPLE_ROLE_HIDDEN.has(type)) return false;
  if (type === "meckanoReports") {
    if (isCompanyMgmtIndustry(ctx.organizationIndustry)) return false;
    if (ctx.meckanoEnabled === false) return false;
  }
  if (type === "fieldCopilot" && isCompanyMgmtIndustry(ctx.organizationIndustry)) return false;
  if (type === "googleCalendar" && ctx.calendarGoogleEnabled === false) return false;
  return OS_ASSISTANT_WIDGETS.some((w) => w.id === type);
}

export function filterLauncherWidget(
  type: WidgetType | null,
  ctx: LauncherPermissionContext,
): WidgetType | null {
  if (!type) return null;
  return isWidgetAllowed(type, ctx) ? type : null;
}

export function filterWidgetsForPicker(
  ctx: LauncherPermissionContext,
  usedInZone: Set<WidgetType>,
): WidgetType[] {
  return OS_ASSISTANT_WIDGETS.filter(
    (w) =>
      !w.pickerHidden &&
      !isConsolidatedLegacyWidgetId(w.id) &&
      isWidgetAllowed(w.id, ctx) &&
      !usedInZone.has(w.id),
  ).map((w) => w.id);
}
