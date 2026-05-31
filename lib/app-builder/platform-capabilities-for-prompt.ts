import { automationCatalogForPrompt } from "@/lib/os-automations/catalog";
import { widgetCatalogForPrompt } from "@/lib/os-assistant/widget-catalog";
import { dataCatalogForPrompt } from "@/lib/app-builder/data-catalog";

/** קטלוג יכולות לצ'אט המחולל — ניתוב רעיונות (Monday-style) */
export function appBuilderCapabilitiesForPrompt(locale: string): string {
  return [
    "## Platform automations (platformActions — existing product features)",
    "When the subscriber wants to USE the platform (not a custom form/dashboard), return platformActions.",
    "Examples: open CRM, scan document, create invoice/quote/task/contact, Meckano clock, open project board, notebook, settings.",
    automationCatalogForPrompt(locale),
    "",
    "## Open screens (also via platformActions intents like open_crm, open_dashboard, open_widget with params)",
    widgetCatalogForPrompt(locale),
    "",
    "## Custom UI (generateApp — new form/table/dashboard in preview)",
    "When they want a NEW custom tool, data capture, or analytics view on org data:",
    dataCatalogForPrompt(),
  ].join("\n");
}
