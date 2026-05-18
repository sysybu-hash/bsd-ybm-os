import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  FilePlus,
  FileText,
  HardDrive,
  HelpCircle,
  LayoutDashboard,
  Library,
  Package,
  ScanLine,
  Settings,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";

export type LauncherNavMeta = {
  type: WidgetType;
  labelKey: string;
  icon: LucideIcon;
  chip?: boolean;
};

const LAUNCHER_NAV_META: Partial<Record<WidgetType, LauncherNavMeta>> = {
  dashboard: {
    type: "dashboard",
    labelKey: "workspaceWidgets.sidebar.dashboard",
    icon: LayoutDashboard,
  },
  projectBoard: {
    type: "projectBoard",
    labelKey: "workspaceWidgets.sidebar.projectBoard",
    icon: BarChart3,
    chip: true,
  },
  crmTable: {
    type: "crmTable",
    labelKey: "workspaceWidgets.sidebar.crmTable",
    icon: Users,
    chip: true,
  },
  erpArchive: {
    type: "erpArchive",
    labelKey: "workspaceWidgets.sidebar.erpArchive",
    icon: Package,
    chip: true,
  },
  docCreator: {
    type: "docCreator",
    labelKey: "workspaceWidgets.sidebar.docCreator",
    icon: FilePlus,
    chip: true,
  },
  aiScanner: {
    type: "aiScanner",
    labelKey: "workspaceWidgets.sidebar.aiScanner",
    icon: ScanLine,
    chip: true,
  },
  aiChatFull: {
    type: "aiChatFull",
    labelKey: "workspaceWidgets.sidebar.aiChatFull",
    icon: Sparkles,
    chip: true,
  },
  meckanoReports: {
    type: "meckanoReports",
    labelKey: "workspaceWidgets.sidebar.meckanoReports",
    icon: FileText,
    chip: true,
  },
  notebookLM: {
    type: "notebookLM",
    labelKey: "workspaceWidgets.sidebar.notebookLM",
    icon: Library,
    chip: true,
  },
  googleDrive: {
    type: "googleDrive",
    labelKey: "workspaceWidgets.titles.googleDrive",
    icon: HardDrive,
    chip: true,
  },
  googleAssistant: {
    type: "googleAssistant",
    labelKey: "workspaceWidgets.titles.googleAssistant",
    icon: Bot,
    chip: true,
  },
  settings: {
    type: "settings",
    labelKey: "workspaceWidgets.sidebar.settings",
    icon: Settings,
    chip: true,
  },
  helpCenter: {
    type: "helpCenter",
    labelKey: "workspaceWidgets.sidebar.help",
    icon: HelpCircle,
    chip: true,
  },
  platformAdmin: {
    type: "platformAdmin",
    labelKey: "workspaceWidgets.sidebar.platformAdmin",
    icon: Shield,
    chip: true,
  },
  accessibility: {
    type: "accessibility",
    labelKey: "workspaceWidgets.titles.accessibility",
    icon: Settings,
    chip: true,
  },
};

export function getLauncherNavMeta(type: WidgetType): LauncherNavMeta | null {
  return LAUNCHER_NAV_META[type] ?? null;
}

export function quickActionLabelKey(type: WidgetType): string {
  const known = LAUNCHER_NAV_META[type];
  if (known && type in LAUNCHER_NAV_META) {
    const quickKeys: Partial<Record<WidgetType, string>> = {
      projectBoard: "workspaceWidgets.quickActions.projectBoard.title",
      crmTable: "workspaceWidgets.quickActions.crmTable.title",
      erpArchive: "workspaceWidgets.quickActions.erpArchive.title",
      docCreator: "workspaceWidgets.quickActions.docCreator.title",
      aiScanner: "workspaceWidgets.quickActions.aiScanner.title",
      aiChatFull: "workspaceWidgets.quickActions.aiChatFull.title",
      googleDrive: "workspaceWidgets.quickActions.googleDrive.title",
      notebookLM: "workspaceWidgets.quickActions.notebookLM.title",
    };
    return quickKeys[type] ?? known.labelKey;
  }
  return `workspaceWidgets.titles.${type}`;
}

export function mobileNavLabelKey(type: WidgetType): string {
  const mobileKeys: Partial<Record<WidgetType, string>> = {
    dashboard: "workspaceWidgets.mobileNav.dashboard",
    aiScanner: "workspaceWidgets.mobileNav.aiScanner",
    docCreator: "workspaceWidgets.mobileNav.docCreator",
    crmTable: "workspaceWidgets.mobileNav.crmTable",
  };
  const meta = LAUNCHER_NAV_META[type];
  return mobileKeys[type] ?? meta?.labelKey ?? `workspaceWidgets.titles.${type}`;
}
