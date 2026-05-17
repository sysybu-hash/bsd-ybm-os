import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import type { WidgetType } from "@/hooks/use-window-manager";
import { normalizeAutomationIntent } from "@/lib/os-automations/catalog";
import { runAutomationAction } from "@/lib/os-automations/registry";
import type { AutomationAction, AutomationRunnerDeps } from "@/lib/os-automations/types";

export type OsAssistantToolDeps = Pick<AutomationRunnerDeps, "openWidget"> &
  Partial<Omit<AutomationRunnerDeps, "openWidget">>;

export async function handleOsAssistantToolCall(
  name: string,
  args: Record<string, unknown>,
  deps: OsAssistantToolDeps,
): Promise<string> {
  if (name === "run_automation") {
    const intent = normalizeAutomationIntent(typeof args.intent === "string" ? args.intent : "");
    if (!intent) return `לא נמצא intent: ${String(args.intent)}`;
    const params =
      args.params && typeof args.params === "object"
        ? (args.params as Record<string, unknown>)
        : undefined;
    const runnerDeps = deps as AutomationRunnerDeps;
    if (!runnerDeps.setSystemMessage) {
      deps.openWidget("dashboard");
      return "Success";
    }
    await runAutomationAction({ intent, params }, runnerDeps);
    return "Success";
  }

  if (name === "execute_os_command") {
    const raw = typeof args.action === "string" ? args.action : "";
    const widget = normalizeWidgetAction(raw);
    if (!widget) {
      return `לא נמצא ווידג'ט: ${raw}`;
    }
    const payload =
      args.payload && typeof args.payload === "object"
        ? (args.payload as Record<string, unknown>)
        : null;
    deps.openWidget(widget, payload);
    return "Success";
  }

  if (name === "search_site") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return "חסרה שאילתת חיפוש";
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (results.length === 0) return `לא נמצאו תוצאות עבור «${query}»`;
      const top = results.slice(0, 5).map((r: { name?: string; type?: string }) => `${r.type}: ${r.name}`).join("; ");
      const first = results[0] as { type?: string; name?: string };
      if (first?.type === "project" && first.name) {
        deps.openWidget("project", { name: first.name });
      } else if (first?.name) {
        deps.openWidget("crmTable");
      }
      return `נמצאו ${results.length} תוצאות. מובילות: ${top}`;
    } catch {
      return "שגיאה בחיפוש במערכת";
    }
  }

  if (name === "google_assistant_command") {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return "חסרה פקודה";
    try {
      const res = await fetch("/api/os/google-assistant/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        credentials: "include",
      });
      const data = await res.json();
      return typeof data.fulfillmentText === "string" ? data.fulfillmentText : "Success";
    } catch {
      return "שגיאה בביצוע פקודת Google Assistant";
    }
  }

  return `כלי לא מוכר: ${name}`;
}
