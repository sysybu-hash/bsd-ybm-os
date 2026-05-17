"use client";

import React, { createContext, useContext } from "react";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";
import type { useAutomationRunner } from "@/hooks/useAutomationRunner";

export type AutomationRunnerContextValue = ReturnType<typeof useAutomationRunner> & {
  assistantToolDeps: OsAssistantToolDeps;
};

const AutomationRunnerContext = createContext<AutomationRunnerContextValue | null>(null);

export function AutomationRunnerProvider({
  value,
  children,
}: {
  value: AutomationRunnerContextValue;
  children: React.ReactNode;
}) {
  return <AutomationRunnerContext.Provider value={value}>{children}</AutomationRunnerContext.Provider>;
}

export function useAutomationRunnerContext() {
  return useContext(AutomationRunnerContext);
}
