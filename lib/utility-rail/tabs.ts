import type { LucideIcon } from "lucide-react";
import { Calculator, Coins, Sun } from "lucide-react";
import type { UtilityRailTab } from "./prefs";

export type UtilityTabDef = {
  id: UtilityRailTab;
  icon: LucideIcon;
  labelKey: string;
};

export const UTILITY_TABS: UtilityTabDef[] = [
  { id: "zmanim", icon: Sun, labelKey: "workspaceWidgets.utilityRail.tabs.zmanim" },
  { id: "calculator", icon: Calculator, labelKey: "workspaceWidgets.utilityRail.tabs.calculator" },
  { id: "currency", icon: Coins, labelKey: "workspaceWidgets.utilityRail.tabs.currency" },
];
