"use client";

import { useEffect } from "react";
import { useWidgetNavigationOptional } from "@/components/os/navigation/WidgetNavigationProvider";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

/** מיישם מצב מ-navigation context ומחזיר pushView לעדכונים */
export function useSyncedWidgetNavigation(
  applyView: (view: WidgetViewState) => void,
) {
  const nav = useWidgetNavigationOptional();

  useEffect(() => {
    if (!nav?.currentView || Object.keys(nav.currentView).length === 0) return;
    applyView(nav.currentView);
  }, [nav?.currentView, applyView]);

  const pushView = (state: WidgetViewState) => {
    nav?.pushView(state);
  };

  return { nav, pushView };
}
