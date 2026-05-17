import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import type { WidgetType } from "@/hooks/use-window-manager";
import { runAutomationPlan } from "@/lib/os-automations/registry";
import type { AutomationAction, AutomationRunnerDeps } from "@/lib/os-automations/types";

export type OsAssistantToolDeps = Pick<AutomationRunnerDeps, "openWidget"> &
  Partial<Omit<AutomationRunnerDeps, "openWidget">>;

const SERVER_TOOL_NAMES = new Set([
  "run_automation",
  "execute_user_command",
  "google_assistant_command",
]);

async function executeToolOnServer(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: string; clientActions?: AutomationAction[] }> {
  const res = await fetch("/api/os/assistant/execute-tool", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, args }),
  });
  const data = (await res.json()) as {
    result?: string;
    clientActions?: AutomationAction[];
    error?: string;
  };
  if (!res.ok) {
    return { result: data.error ?? data.result ?? "שגיאה בביצוע הכלי" };
  }
  return {
    result: data.result ?? "בוצע",
    clientActions: data.clientActions,
  };
}

export async function handleOsAssistantToolCall(
  name: string,
  args: Record<string, unknown>,
  deps: OsAssistantToolDeps,
): Promise<string> {
  if (SERVER_TOOL_NAMES.has(name)) {
    const { result, clientActions } = await executeToolOnServer(name, args);
    if (clientActions?.length) {
      const runnerDeps = deps as AutomationRunnerDeps;
      if (!runnerDeps.setSystemMessage) {
        return "לא ניתן לבצע פעולות — חסר הקשר מערכת (setSystemMessage)";
      }
      const fullDeps: AutomationRunnerDeps = {
        openWidget: deps.openWidget,
        closeWidget: runnerDeps.closeWidget ?? (() => undefined),
        focusWidget: runnerDeps.focusWidget ?? (() => undefined),
        toggleMaximize: runnerDeps.toggleMaximize ?? (() => undefined),
        clearLayout: runnerDeps.clearLayout ?? (() => undefined),
        widgets: runnerDeps.widgets ?? [],
        setSystemMessage: runnerDeps.setSystemMessage,
        reportMeckanoAttendance: runnerDeps.reportMeckanoAttendance,
        openWindowSwitcher: runnerDeps.openWindowSwitcher,
      };
      const results = await runAutomationPlan(clientActions, fullDeps);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        return failed[0]?.message ?? result;
      }
    }
    return result;
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
    return "בוצע";
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
      const top = results
        .slice(0, 5)
        .map((r: { name?: string; type?: string }) => `${r.type}: ${r.name}`)
        .join("; ");
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
      return typeof data.fulfillmentText === "string" ? data.fulfillmentText : "בוצע";
    } catch {
      return "שגיאה בביצוע פקודת Google Assistant";
    }
  }

  return `כלי לא מוכר: ${name}`;
}
