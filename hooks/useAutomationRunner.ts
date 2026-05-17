"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { WidgetType } from "@/hooks/use-window-manager";
import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { runAutomationPlan } from "@/lib/os-automations/registry";
import type { AutomationAction, AutomationRunnerDeps, ParseActionResponse } from "@/lib/os-automations/types";

export type UseAutomationRunnerOptions = {
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  toggleMaximize: (id: string) => void;
  clearLayout: () => void;
  widgets: { id: string; type: WidgetType }[];
  setSystemMessage: (msg: string) => void;
  reportMeckanoAttendance?: (direction: "in" | "out") => Promise<void>;
  openWindowSwitcher?: () => void;
};

export function useAutomationRunner(options: UseAutomationRunnerOptions) {
  const deps: AutomationRunnerDeps = useMemo(
    () => ({
      openWidget: options.openWidget,
      closeWidget: options.closeWidget,
      focusWidget: options.focusWidget,
      toggleMaximize: options.toggleMaximize,
      clearLayout: options.clearLayout,
      widgets: options.widgets,
      setSystemMessage: options.setSystemMessage,
      reportMeckanoAttendance: options.reportMeckanoAttendance,
      openWindowSwitcher: options.openWindowSwitcher,
    }),
    [options],
  );

  const runActions = useCallback(
    async (actions: AutomationAction[]) => {
      const results = await runAutomationPlan(actions, deps);
      actions.forEach((action, i) => {
        captureProductEvent("automation_executed", {
          intent: action.intent,
          ok: results[i]?.ok ?? false,
        });
      });
      return results;
    },
    [deps],
  );

  const parseAndRun = useCallback(
    async (message: string): Promise<ParseActionResponse | null> => {
      const trimmed = message.trim();
      if (!trimmed) return null;

      try {
        const res = await fetch("/api/os/assistant/parse-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: trimmed }),
        });

        if (!res.ok) return null;

        const data = (await res.json()) as ParseActionResponse;
        if (data.actions?.length) {
          await runActions(data.actions);
        }
        if (data.reply?.trim()) {
          options.setSystemMessage(data.reply.trim());
        }
        return data;
      } catch {
        return null;
      }
    },
    [runActions, options],
  );

  const handleCommandWithAutomations = useCallback(
    async (command: string) => {
      const parsed = await parseAndRun(command);
      return Boolean(parsed?.actions?.length);
    },
    [parseAndRun],
  );

  return {
    deps,
    runActions,
    parseAndRun,
    handleCommandWithAutomations,
  };
}
