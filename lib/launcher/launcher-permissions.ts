import type { WidgetType } from "@/hooks/use-window-manager";
import { isCompanyMgmtIndustry } from "@/lib/business-lines";
import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";

export type LauncherPermissionContext = {
  isPlatformAdmin: boolean;
  organizationIndustry?: string | null;
  /** מוסתר כשאין הרשאת מקאנו */
  meckanoEnabled?: boolean;
  calendarGoogleEnabled?: boolean;
};

function isWidgetAllowed(type: WidgetType, ctx: LauncherPermissionContext): boolean {
  if (type === "platformAdmin" && !ctx.isPlatformAdmin) return false;
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
  return OS_ASSISTANT_WIDGETS.map((w) => w.id).filter(
    (id) => isWidgetAllowed(id, ctx) && !usedInZone.has(id),
  );
}
