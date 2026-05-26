import type { WidgetType } from "@/hooks/use-window-manager";

export type LauncherZone = "quickGrid" | "sidebar" | "mobileBarStart" | "mobileBarEnd" | "mobileMore";

export type LauncherSlot = {
  widgetId: WidgetType | null;
  /** מיקום ברשת quickGrid (מצב עריכה חופשי) */
  row?: number;
  col?: number;
};

export type UserLauncherConfig = {
  version: 1 | 2;
  quickGrid: LauncherSlot[];
  sidebar: LauncherSlot[];
  mobileBarStart: LauncherSlot[];
  mobileBarEnd: LauncherSlot[];
  mobileMore: LauncherSlot[];
};

export type LauncherDefaultOptions = {
  isPlatformAdmin?: boolean;
};
