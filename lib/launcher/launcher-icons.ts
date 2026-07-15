import type { WidgetType } from "@/hooks/use-window-manager";
import { mapLauncherWidgetId } from "@/lib/os-assistant/resolve-widget-open";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import {
  DEFAULT_LAUNCHER_ICON,
  LAUNCHER_MOBILE_NAV_LABEL_KEYS,
  LAUNCHER_NAV_META,
  LAUNCHER_QUICK_ACTION_LABEL_KEYS,
  type LauncherNavMeta,
} from "@/lib/launcher/launcher-icons-data";

export type { LauncherNavMeta } from "@/lib/launcher/launcher-icons-data";

function resolveWidgetType(type: WidgetType): WidgetType {
  const normalized = normalizeWidgetAction(type) ?? type;
  return mapLauncherWidgetId(normalized);
}

export function getLauncherNavMeta(type: WidgetType): LauncherNavMeta {
  const resolved = resolveWidgetType(type);
  const known = LAUNCHER_NAV_META[resolved] ?? LAUNCHER_NAV_META[type];

  if (known) {
    return known.type === type ? known : { ...known, type };
  }

  return {
    type,
    labelKey: `workspaceWidgets.titles.${type}`,
    icon: DEFAULT_LAUNCHER_ICON,
    chip: true,
  };
}

export function quickActionLabelKey(type: WidgetType): string {
  const known = getLauncherNavMeta(type);
  return LAUNCHER_QUICK_ACTION_LABEL_KEYS[type] ?? LAUNCHER_QUICK_ACTION_LABEL_KEYS[known.type] ?? known.labelKey;
}

export function quickActionSubtitleKey(type: WidgetType): string {
  const normalized = normalizeWidgetAction(type) ?? type;
  return `workspaceWidgets.quickActions.${normalized}.subtitle`;
}

export function mobileNavLabelKey(type: WidgetType): string {
  const meta = getLauncherNavMeta(type);
  return LAUNCHER_MOBILE_NAV_LABEL_KEYS[type] ?? LAUNCHER_MOBILE_NAV_LABEL_KEYS[meta.type] ?? meta.labelKey;
}
