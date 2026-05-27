import {
  compactZoneSlots,
  ensureEditTrailingEmptySlot,
  getDefaultLauncherConfig,
  isExpandableLauncherZone,
  setZoneSlots,
  widgetsUsedInZone,
  type LauncherSlot,
  type LauncherZone,
  type UserLauncherConfig,
} from "@/lib/launcher/user-launcher-config";
import {
  ensureQuickGridPositions,
  finalizeQuickGridAfterEdit,
} from "@/lib/launcher/quick-grid";
import {
  filterLauncherWidget,
  filterWidgetsForPicker,
  type LauncherPermissionContext,
} from "@/lib/launcher/launcher-permissions";

export function sanitizeConfig(
  raw: UserLauncherConfig,
  ctx: LauncherPermissionContext,
): UserLauncherConfig {
  const zones: LauncherZone[] = ["quickGrid", "sidebar", "mobileBarStart", "mobileBarEnd", "mobileMore"];
  let next = raw;
  for (const zone of zones) {
    const slots = next[zone].map((s) => {
      const widgetId = filterLauncherWidget(s.widgetId, ctx);
      if (zone === "quickGrid" && widgetId && typeof s.row === "number" && typeof s.col === "number") {
        return { widgetId, row: s.row, col: s.col };
      }
      return { widgetId };
    });
    next = setZoneSlots(next, zone, slots);
  }
  return next;
}

export function padMobileStart(slots: LauncherSlot[]): LauncherSlot[] {
  const out = [...slots];
  while (out.length < 3) out.push({ widgetId: null });
  return out.slice(0, 3);
}

export function padMobileEnd(slots: LauncherSlot[]): LauncherSlot[] {
  const out = [...slots];
  while (out.length < 1) out.push({ widgetId: null });
  return out.slice(0, 1);
}

export function countPickerOptionsForZone(
  config: UserLauncherConfig,
  zone: LauncherZone,
  ctx: LauncherPermissionContext,
): number {
  const used = widgetsUsedInZone(config, zone);
  return filterWidgetsForPicker(ctx, used).length;
}

export function prepareExpandableZoneForEdit(
  config: UserLauncherConfig,
  zone: LauncherZone,
  ctx: LauncherPermissionContext,
): LauncherSlot[] {
  if (zone === "quickGrid") return ensureQuickGridPositions(config.quickGrid);
  const canAddMore = countPickerOptionsForZone(config, zone, ctx) > 0;
  return ensureEditTrailingEmptySlot(config[zone], canAddMore);
}

export function finalizeExpandableZoneAfterEdit(
  config: UserLauncherConfig,
  zone: LauncherZone,
): LauncherSlot[] {
  if (zone === "quickGrid") {
    return finalizeQuickGridAfterEdit(ensureQuickGridPositions(config.quickGrid));
  }
  return compactZoneSlots(config[zone], zone);
}

// Re-export for consumers
export {
  getDefaultLauncherConfig,
  setZoneSlots,
  isExpandableLauncherZone,
  filterWidgetsForPicker,
  widgetsUsedInZone,
  ensureQuickGridPositions,
};
