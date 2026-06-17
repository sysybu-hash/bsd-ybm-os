import type { WidgetType } from "@/hooks/use-window-manager";

/** Hub widgets consolidated in launcher v2 */
export const HUB_WIDGET_TYPES = [
  "financeHub",
  "projectsHub",
  "documentsHub",
  "aiHub",
  "logisticsHub",
  "procurementHub",
] as const satisfies readonly WidgetType[];

export type HubWidgetType = (typeof HUB_WIDGET_TYPES)[number];

const HUB_TAB_COUNTS: Record<HubWidgetType, number> = {
  financeHub: 2,
  projectsHub: 2,
  documentsHub: 3,
  aiHub: 2,
  logisticsHub: 2,
  procurementHub: 3,
};

export function isHubWidget(type: WidgetType): type is HubWidgetType {
  return (HUB_WIDGET_TYPES as readonly string[]).includes(type);
}

export function getHubTabCount(type: WidgetType): number | null {
  if (!isHubWidget(type)) return null;
  return HUB_TAB_COUNTS[type];
}
