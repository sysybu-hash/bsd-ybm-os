import type { LucideIcon } from "lucide-react";

import {

  Accessibility,

  BarChart3,

  Bot,

  Building2,

  Calendar,

  Clock,

  FilePlus,

  FileText,

  HardDrive,

  HardHat,

  HelpCircle,

  LayoutDashboard,

  LayoutGrid,

  Library,

  Package,

  ScanLine,

  Settings,

  Shield,

  Sparkles,

  TrendingUp,

  Users,

} from "lucide-react";

import type { WidgetType } from "@/hooks/use-window-manager";
import { mapLauncherWidgetId } from "@/lib/os-assistant/resolve-widget-open";

import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";



export type LauncherNavMeta = {

  type: WidgetType;

  labelKey: string;

  icon: LucideIcon;

  chip?: boolean;

};



const DEFAULT_LAUNCHER_ICON: LucideIcon = LayoutGrid;



const LAUNCHER_NAV_META: Partial<Record<WidgetType, LauncherNavMeta>> = {

  dashboard: {

    type: "dashboard",

    labelKey: "workspaceWidgets.sidebar.dashboard",

    icon: LayoutDashboard,

    chip: true,

  },

  projectBoard: {

    type: "projectBoard",

    labelKey: "workspaceWidgets.sidebar.projectBoard",

    icon: BarChart3,

    chip: true,

  },

  project: {

    type: "project",

    labelKey: "workspaceWidgets.titles.project",

    icon: Building2,

    chip: true,

  },

  crmTable: {

    type: "crmTable",

    labelKey: "workspaceWidgets.sidebar.crmTable",

    icon: Users,

    chip: true,

  },

  crm: {

    type: "crm",

    labelKey: "workspaceWidgets.titles.crm",

    icon: Users,

    chip: true,

  },

  erpArchive: {

    type: "erpArchive",

    labelKey: "workspaceWidgets.sidebar.erpArchive",

    icon: Package,

    chip: true,

  },

  erp: {

    type: "erp",

    labelKey: "workspaceWidgets.titles.erp",

    icon: FileText,

    chip: true,

  },

  docCreator: {

    type: "docCreator",

    labelKey: "workspaceWidgets.sidebar.docCreator",

    icon: FilePlus,

    chip: true,

  },

  quoteGen: {

    type: "quoteGen",

    labelKey: "workspaceWidgets.titles.quoteGen",

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

  aiChat: {

    type: "aiChat",

    labelKey: "workspaceWidgets.titles.aiChat",

    icon: Sparkles,

    chip: true,

  },

  cashflow: {

    type: "cashflow",

    labelKey: "workspaceWidgets.titles.cashflow",

    icon: TrendingUp,

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

  googleCalendar: {

    type: "googleCalendar",

    labelKey: "workspaceWidgets.titles.googleCalendar",

    icon: Calendar,

    chip: true,

  },

  jewishCalendar: {

    type: "jewishCalendar",

    labelKey: "workspaceWidgets.titles.jewishCalendar",

    icon: Clock,

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

  fieldCopilot: {

    type: "fieldCopilot",

    labelKey: "workspaceWidgets.sidebar.fieldCopilot",

    icon: HardHat,

    chip: true,

  },

  appBuilder: {

    type: "appBuilder",

    labelKey: "workspaceWidgets.sidebar.appBuilder",

    icon: LayoutGrid,

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

    icon: Accessibility,

    chip: true,

  },

  financeHub: {
    type: "financeHub",
    labelKey: "workspaceWidgets.titles.financeHub",
    icon: LayoutDashboard,
    chip: true,
  },
  projectsHub: {
    type: "projectsHub",
    labelKey: "workspaceWidgets.titles.projectsHub",
    icon: BarChart3,
    chip: true,
  },
  documentsHub: {
    type: "documentsHub",
    labelKey: "workspaceWidgets.titles.documentsHub",
    icon: Package,
    chip: true,
  },
  aiHub: {
    type: "aiHub",
    labelKey: "workspaceWidgets.titles.aiHub",
    icon: Bot,
    chip: true,
  },

};



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

  const quickKeys: Partial<Record<WidgetType, string>> = {

    dashboard: "workspaceWidgets.quickActions.dashboard.title",

    project: "workspaceWidgets.quickActions.project.title",

    cashflow: "workspaceWidgets.quickActions.cashflow.title",

    erp: "workspaceWidgets.quickActions.erp.title",

    projectBoard: "workspaceWidgets.quickActions.projectBoard.title",

    crmTable: "workspaceWidgets.quickActions.crmTable.title",

    erpArchive: "workspaceWidgets.quickActions.erpArchive.title",

    docCreator: "workspaceWidgets.quickActions.docCreator.title",

    aiScanner: "workspaceWidgets.quickActions.aiScanner.title",

    aiChatFull: "workspaceWidgets.quickActions.aiChatFull.title",

    googleDrive: "workspaceWidgets.quickActions.googleDrive.title",

    googleCalendar: "workspaceWidgets.quickActions.googleCalendar.title",

    jewishCalendar: "workspaceWidgets.quickActions.jewishCalendar.title",

    notebookLM: "workspaceWidgets.quickActions.notebookLM.title",

    meckanoReports: "workspaceWidgets.quickActions.meckanoReports.title",

    settings: "workspaceWidgets.quickActions.settings.title",

    helpCenter: "workspaceWidgets.quickActions.helpCenter.title",

    fieldCopilot: "workspaceWidgets.quickActions.fieldCopilot.title",
    financeHub: "workspaceWidgets.quickActions.financeHub.title",
    projectsHub: "workspaceWidgets.quickActions.projectsHub.title",
    documentsHub: "workspaceWidgets.quickActions.documentsHub.title",
    aiHub: "workspaceWidgets.quickActions.aiHub.title",
  };

  const known = getLauncherNavMeta(type);

  return quickKeys[type] ?? quickKeys[known.type] ?? known.labelKey;

}



export function quickActionSubtitleKey(type: WidgetType): string {
  const normalized = normalizeWidgetAction(type) ?? type;
  return `workspaceWidgets.quickActions.${normalized}.subtitle`;
}



export function mobileNavLabelKey(type: WidgetType): string {

  const mobileKeys: Partial<Record<WidgetType, string>> = {
    dashboard: "workspaceWidgets.mobileNav.dashboard",
    aiScanner: "workspaceWidgets.mobileNav.aiScanner",
    docCreator: "workspaceWidgets.mobileNav.docCreator",
    crmTable: "workspaceWidgets.mobileNav.crmTable",
    aiHub: "workspaceWidgets.mobileNav.aiHub",
    fieldCopilot: "workspaceWidgets.mobileNav.fieldCopilot",
    documentsHub: "workspaceWidgets.mobileNav.documentsHub",
    projectsHub: "workspaceWidgets.mobileNav.projectsHub",
    financeHub: "workspaceWidgets.mobileNav.financeHub",
  };

  const meta = getLauncherNavMeta(type);

  return mobileKeys[type] ?? mobileKeys[meta.type] ?? meta.labelKey;

}


