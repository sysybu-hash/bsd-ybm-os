"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WidgetNavController } from "@/lib/workspace-navigation/types";

export type ChromeNavResult = {
  handled: boolean;
  focusWidgetId?: string;
};

type WidgetStackState = {
  ids: string[];
  index: number;
};

type WorkspaceNavigationContextValue = {
  registerController: (widgetId: string, controller: WidgetNavController | null) => void;
  recordWidgetFocus: (widgetId: string) => void;
  chromeBack: (focusedWidgetId: string) => ChromeNavResult;
  chromeForward: (focusedWidgetId: string) => ChromeNavResult;
  canChromeBack: (focusedWidgetId: string) => boolean;
  canChromeForward: (focusedWidgetId: string) => boolean;
  getWidgetViewState: (widgetId: string) => import("@/lib/workspace-navigation/types").WidgetViewState | null;
};

const WorkspaceNavigationContext = createContext<WorkspaceNavigationContextValue | null>(null);

const EMPTY_STACK: WidgetStackState = { ids: [], index: -1 };

export function WorkspaceNavigationProvider({ children }: { children: React.ReactNode }) {
  const controllersRef = useRef<Map<string, WidgetNavController>>(new Map());
  const [stack, setStack] = useState<WidgetStackState>(EMPTY_STACK);

  const registerController = useCallback((widgetId: string, controller: WidgetNavController | null) => {
    if (controller) controllersRef.current.set(widgetId, controller);
    else controllersRef.current.delete(widgetId);
  }, []);

  const recordWidgetFocus = useCallback((widgetId: string) => {
    setStack((prev) => {
      if (prev.index >= 0 && prev.ids[prev.index] === widgetId) return prev;
      const truncated = prev.index >= 0 ? prev.ids.slice(0, prev.index + 1) : [];
      if (truncated[truncated.length - 1] === widgetId) {
        return { ids: truncated, index: truncated.length - 1 };
      }
      const ids = [...truncated, widgetId];
      return { ids, index: ids.length - 1 };
    });
  }, []);

  const canChromeBack = useCallback(
    (focusedWidgetId: string) => {
      const ctrl = controllersRef.current.get(focusedWidgetId);
      if (ctrl?.canGoBack) return true;
      return stack.index > 0;
    },
    [stack.index],
  );

  const canChromeForward = useCallback(
    (focusedWidgetId: string) => {
      const ctrl = controllersRef.current.get(focusedWidgetId);
      if (ctrl?.canGoForward) return true;
      return stack.index >= 0 && stack.index < stack.ids.length - 1;
    },
    [stack.index, stack.ids.length],
  );

  const chromeBack = useCallback(
    (focusedWidgetId: string): ChromeNavResult => {
      const ctrl = controllersRef.current.get(focusedWidgetId);
      if (ctrl?.canGoBack) {
        ctrl.back();
        return { handled: true };
      }
      if (stack.index > 0) {
        const nextIndex = stack.index - 1;
        const focusWidgetId = stack.ids[nextIndex];
        setStack((s) => ({ ...s, index: nextIndex }));
        return { handled: true, focusWidgetId };
      }
      return { handled: false };
    },
    [stack],
  );

  const getWidgetViewState = useCallback((widgetId: string) => {
    return controllersRef.current.get(widgetId)?.getCurrentView() ?? null;
  }, []);

  const chromeForward = useCallback(
    (focusedWidgetId: string): ChromeNavResult => {
      const ctrl = controllersRef.current.get(focusedWidgetId);
      if (ctrl?.canGoForward) {
        ctrl.forward();
        return { handled: true };
      }
      if (stack.index >= 0 && stack.index < stack.ids.length - 1) {
        const nextIndex = stack.index + 1;
        const focusWidgetId = stack.ids[nextIndex];
        setStack((s) => ({ ...s, index: nextIndex }));
        return { handled: true, focusWidgetId };
      }
      return { handled: false };
    },
    [stack],
  );

  const value = useMemo(
    () => ({
      registerController,
      recordWidgetFocus,
      chromeBack,
      chromeForward,
      canChromeBack,
      canChromeForward,
      getWidgetViewState,
    }),
    [
      registerController,
      recordWidgetFocus,
      chromeBack,
      chromeForward,
      canChromeBack,
      canChromeForward,
      getWidgetViewState,
    ],
  );

  return (
    <WorkspaceNavigationContext.Provider value={value}>{children}</WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigation(): WorkspaceNavigationContextValue {
  const ctx = useContext(WorkspaceNavigationContext);
  if (!ctx) {
    throw new Error("useWorkspaceNavigation must be used within WorkspaceNavigationProvider");
  }
  return ctx;
}
