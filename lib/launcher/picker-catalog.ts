import type { WidgetType } from "@/hooks/use-window-manager";
import { isHubWidget } from "@/lib/launcher/hub-meta";

export type LauncherPickerSectionId = "hubs" | "workspace" | "integrations" | "admin";

export type LauncherPickerSection = {
  id: LauncherPickerSectionId;
  labelKey: string;
  types: WidgetType[];
};

const SECTION_ORDER: LauncherPickerSectionId[] = [
  "hubs",
  "workspace",
  "integrations",
  "admin",
];

const SECTION_LABEL_KEYS: Record<LauncherPickerSectionId, string> = {
  hubs: "workspaceWidgets.launcher.pickerSectionHubs",
  workspace: "workspaceWidgets.launcher.pickerSectionWorkspace",
  integrations: "workspaceWidgets.launcher.pickerSectionIntegrations",
  admin: "workspaceWidgets.launcher.pickerSectionAdmin",
};

const INTEGRATION_TYPES = new Set<WidgetType>([
  "googleDrive",
  "meckanoReports",
  "fieldCopilot",
]);

const ADMIN_TYPES = new Set<WidgetType>([
  "platformAdmin",
  "accessibility",
  "settings",
]);

function sectionForType(type: WidgetType): LauncherPickerSectionId {
  if (isHubWidget(type)) return "hubs";
  if (INTEGRATION_TYPES.has(type)) return "integrations";
  if (ADMIN_TYPES.has(type)) return "admin";
  return "workspace";
}

/** Group picker options for LauncherPickerSheet (Hub-first). */
export function groupPickerOptions(types: WidgetType[]): LauncherPickerSection[] {
  const buckets = new Map<LauncherPickerSectionId, WidgetType[]>();
  for (const id of SECTION_ORDER) {
    buckets.set(id, []);
  }
  for (const type of types) {
    const section = sectionForType(type);
    buckets.get(section)!.push(type);
  }
  return SECTION_ORDER.map((id) => ({
    id,
    labelKey: SECTION_LABEL_KEYS[id],
    types: buckets.get(id) ?? [],
  })).filter((s) => s.types.length > 0);
}
