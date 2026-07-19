import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Calculator,
  CalendarDays,
  Cpu,
  FileText,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  ScanLine,
  Settings,
  Users,
} from "lucide-react";

/**
 * Single source of truth for the "classic" dashboard sections.
 *
 * Both the desktop classic shell (tabs), the mobile bottom-nav, and the mobile
 * "more" grid derive from this one list — add or reorder a section here and it
 * appears consistently everywhere, instead of being defined in 4 separate places.
 */
export type ClassicSectionId =
  | "home"
  | "crm"
  | "erp"
  | "scan"
  | "customOs"
  | "calendar"
  | "tasks"
  | "calculators"
  | "drive"
  | "aiChat"
  | "settings";

export type ClassicSection = {
  id: ClassicSectionId;
  labelKey: string;
  icon: LucideIcon;
  /** Route in the mobile classic dashboard. */
  mobileHref: string;
  /** Shown in the mobile bottom nav (otherwise it lives in the "more" grid). */
  mobilePrimary?: boolean;
  /** The centered FAB in the mobile bottom nav. */
  fab?: boolean;
};

const lbl = (id: string) => `workspaceWidgets.classicDashboard.tabs.${id}`;

/** Canonical order — desktop renders all of these as tabs. */
export const CLASSIC_SECTIONS: readonly ClassicSection[] = [
  { id: "home",        labelKey: lbl("home"),        icon: LayoutDashboard, mobileHref: "/m/dashboard/home",            mobilePrimary: true },
  { id: "tasks",       labelKey: lbl("tasks"),       icon: FolderKanban,    mobileHref: "/m/dashboard/projects",        mobilePrimary: true },
  { id: "scan",        labelKey: lbl("scan"),        icon: ScanLine,        mobileHref: "/m/dashboard/scanner",         mobilePrimary: true, fab: true },
  { id: "crm",         labelKey: lbl("crm"),         icon: Users,           mobileHref: "/m/dashboard/crm" },
  { id: "aiChat",      labelKey: lbl("aiChat"),      icon: Bot,             mobileHref: "/m/dashboard/ai" },
  { id: "erp",         labelKey: lbl("erp"),         icon: FileText,        mobileHref: "/m/dashboard/more/erp" },
  { id: "customOs",    labelKey: lbl("customOs"),    icon: Cpu,             mobileHref: "/m/dashboard/more/builder" },
  { id: "calendar",    labelKey: lbl("calendar"),    icon: CalendarDays,    mobileHref: "/m/dashboard/more/calendar" },
  { id: "calculators", labelKey: lbl("calculators"), icon: Calculator,      mobileHref: "/m/dashboard/more/calculators" },
  { id: "drive",       labelKey: lbl("drive"),       icon: HardDrive,       mobileHref: "/m/dashboard/more/drive" },
  { id: "settings",    labelKey: lbl("settings"),    icon: Settings,        mobileHref: "/m/dashboard/more/settings" },
];

/** Core mobile bottom nav: home / projects / scan FAB. */
export const CLASSIC_MOBILE_PRIMARY: readonly ClassicSection[] = CLASSIC_SECTIONS.filter(
  (s) => s.mobilePrimary,
);

/** Sections shown in the mobile "more" grid (everything not primary, excluding home). */
export const CLASSIC_MORE_SECTIONS: readonly ClassicSection[] = CLASSIC_SECTIONS.filter(
  (s) => !s.mobilePrimary && s.id !== "home",
);

export function classicSectionById(id: ClassicSectionId): ClassicSection | undefined {
  return CLASSIC_SECTIONS.find((s) => s.id === id);
}
