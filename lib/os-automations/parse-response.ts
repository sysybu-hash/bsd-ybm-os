import { interpretDoneFallback } from "@/lib/i18n/ai-locale";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import type { AutomationAction, ParseActionResponse } from "@/lib/os-automations/types";
import type { WidgetType } from "@/hooks/use-window-manager";

export function parseActionsJson(raw: string, locale: string): ParseActionResponse | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const reply = typeof o.reply === "string" ? o.reply.trim() : interpretDoneFallback(locale);
    const actions: AutomationAction[] = [];
    if (Array.isArray(o.actions)) {
      for (const item of o.actions) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const intentRaw = typeof rec.intent === "string" ? rec.intent : "";
        const intent = normalizeAutomationIntent(intentRaw);
        if (!intent) continue;
        const params =
          rec.params && typeof rec.params === "object"
            ? (rec.params as Record<string, unknown>)
            : undefined;
        actions.push({ intent, params });
      }
    }
    return { reply, actions };
  } catch {
    return null;
  }
}

export function legacyOpenWidgetsToActions(openWidgets: string[]): AutomationAction[] {
  const actions: AutomationAction[] = [];
  for (const w of openWidgets) {
    const widget = normalizeWidgetAction(w);
    if (widget) actions.push({ intent: "open_widget", params: { widgetId: widget } });
  }
  return actions;
}

export function actionsToOpenWidgets(actions: AutomationAction[]): WidgetType[] {
  const out: WidgetType[] = [];
  for (const a of actions) {
    if (a.intent === "open_widget") {
      const id = (a.params as { widgetId?: string })?.widgetId;
      const w = normalizeWidgetAction(String(id ?? ""));
      if (w) out.push(w);
    }
  }
  return out;
}
