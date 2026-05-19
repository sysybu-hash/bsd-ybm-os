"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { WidgetNavController, WidgetViewState } from "@/lib/workspace-navigation/types";

type NavHistory = {
  entries: WidgetViewState[];
  index: number;
};

type WidgetNavigationContextValue = {
  widgetId: string;
  widgetType: WidgetType;
  currentView: WidgetViewState | null;
  canGoBack: boolean;
  canGoForward: boolean;
  pushView: (state: WidgetViewState) => void;
  replaceView: (state: WidgetViewState) => void;
  back: () => void;
  forward: () => void;
  applyView: (state: WidgetViewState | null) => void;
};

const WidgetNavigationContext = createContext<WidgetNavigationContextValue | null>(null);

function stateKey(state: WidgetViewState): string {
  return JSON.stringify(state);
}

function emptyHistory(): NavHistory {
  return { entries: [], index: -1 };
}

type Props = {
  widgetId: string;
  widgetType: WidgetType;
  initialView?: WidgetViewState | null;
  onViewChange?: (state: WidgetViewState | null) => void;
  registerController?: (widgetId: string, controller: WidgetNavController | null) => void;
  children: React.ReactNode;
};

export function WidgetNavigationProvider({
  widgetId,
  widgetType,
  initialView = null,
  onViewChange,
  registerController,
  children,
}: Props) {
  const [history, setHistory] = useState<NavHistory>(() =>
    initialView ? { entries: [initialView], index: 0 } : emptyHistory(),
  );
  const bootstrapped = useRef(!!initialView);

  const currentView =
    history.index >= 0 ? (history.entries[history.index] ?? null) : null;
  const canGoBack = history.index > 0;
  const canGoForward =
    history.index >= 0 && history.index < history.entries.length - 1;

  const applyView = useCallback(
    (state: WidgetViewState | null) => {
      if (!state || Object.keys(state).length === 0) {
        setHistory(emptyHistory());
        onViewChange?.(null);
        return;
      }
      setHistory({ entries: [state], index: 0 });
      onViewChange?.(state);
    },
    [onViewChange],
  );

  useEffect(() => {
    if (initialView && !bootstrapped.current) {
      bootstrapped.current = true;
      applyView(initialView);
    }
  }, [initialView, applyView]);

  const pushView = useCallback(
    (state: WidgetViewState) => {
      setHistory((prev) => {
        const cur = prev.index >= 0 ? prev.entries[prev.index] : null;
        if (cur && stateKey(cur) === stateKey(state)) return prev;
        const truncated = prev.index >= 0 ? prev.entries.slice(0, prev.index + 1) : [];
        const entries = [...truncated, state];
        onViewChange?.(state);
        return { entries, index: entries.length - 1 };
      });
    },
    [onViewChange],
  );

  const replaceView = useCallback(
    (state: WidgetViewState) => {
      setHistory((prev) => {
        if (prev.index < 0) {
          onViewChange?.(state);
          return { entries: [state], index: 0 };
        }
        const entries = [...prev.entries];
        entries[prev.index] = state;
        onViewChange?.(state);
        return { ...prev, entries };
      });
    },
    [onViewChange],
  );

  const back = useCallback(() => {
    setHistory((prev) => {
      if (prev.index <= 0) return prev;
      const index = prev.index - 1;
      onViewChange?.(prev.entries[index] ?? null);
      return { ...prev, index };
    });
  }, [onViewChange]);

  const forward = useCallback(() => {
    setHistory((prev) => {
      if (prev.index >= prev.entries.length - 1) return prev;
      const index = prev.index + 1;
      onViewChange?.(prev.entries[index] ?? null);
      return { ...prev, index };
    });
  }, [onViewChange]);

  const controller = useMemo<WidgetNavController>(
    () => ({
      canGoBack,
      canGoForward,
      back,
      forward,
      getCurrentView: () => currentView,
    }),
    [canGoBack, canGoForward, back, forward, currentView],
  );

  useEffect(() => {
    registerController?.(widgetId, controller);
    return () => registerController?.(widgetId, null);
  }, [widgetId, registerController, controller]);

  const value = useMemo(
    () => ({
      widgetId,
      widgetType,
      currentView,
      canGoBack,
      canGoForward,
      pushView,
      replaceView,
      back,
      forward,
      applyView,
    }),
    [
      widgetId,
      widgetType,
      currentView,
      canGoBack,
      canGoForward,
      pushView,
      replaceView,
      back,
      forward,
      applyView,
    ],
  );

  return (
    <WidgetNavigationContext.Provider value={value}>{children}</WidgetNavigationContext.Provider>
  );
}

export function useWidgetNavigation(): WidgetNavigationContextValue {
  const ctx = useContext(WidgetNavigationContext);
  if (!ctx) {
    throw new Error("useWidgetNavigation must be used within WidgetNavigationProvider");
  }
  return ctx;
}

export function useWidgetNavigationOptional(): WidgetNavigationContextValue | null {
  return useContext(WidgetNavigationContext);
}
