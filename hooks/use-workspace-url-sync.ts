"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import {
  buildWorkspaceSearchParams,
  parseWorkspaceUrl,
  workspaceUrlFromParams,
} from "@/lib/workspace-url";

type Options = {
  hasHydrated: boolean;
  widgets: ActiveWidget[];
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  focusWidget: (id: string) => void;
  findWidgetByType: (type: WidgetType) => ActiveWidget | undefined;
  getWidgetViewState: (widgetId: string) => WidgetViewState | null;
};

export function useWorkspaceUrlSync({
  hasHydrated,
  widgets,
  openWidget,
  focusWidget,
  findWidgetByType,
  getWidgetViewState,
}: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appliedUrlKey = useRef<string | null>(null);
  const skipNextWrite = useRef(false);

  const writeUrl = useCallback(
    (opts: {
      widgetType?: WidgetType | null;
      widgetInstanceId?: string | null;
      viewState?: WidgetViewState | null;
    }) => {
      if (skipNextWrite.current) {
        skipNextWrite.current = false;
        return;
      }
      const sp = buildWorkspaceSearchParams(opts);
      const next = workspaceUrlFromParams(sp);
      router.replace(next, { scroll: false });
    },
    [router],
  );

  const syncUrlFromFocusedWidget = useCallback(
    (focused: ActiveWidget | undefined) => {
      if (!focused) {
        // אל תנקה ?w= לפני שה-deep link הספיק לפתוח חלון (race עם widgets.length === 0)
        if (parseWorkspaceUrl(searchParams)) return;
        writeUrl({ widgetType: null, viewState: null });
        return;
      }
      const viewState = getWidgetViewState(focused.id);
      const mergedViewState =
        focused.type === "project" && typeof focused.liveData?.projectId === "string"
          ? { ...(viewState ?? {}), projectId: focused.liveData.projectId }
          : viewState;
      writeUrl({
        widgetType: focused.type,
        widgetInstanceId: focused.id,
        viewState: mergedViewState,
      });
    },
    [writeUrl, getWidgetViewState, searchParams],
  );

  useEffect(() => {
    if (!hasHydrated) return;
    const intent = parseWorkspaceUrl(searchParams);
    if (!intent) return;

    const urlKey = searchParams.toString();
    if (appliedUrlKey.current === urlKey) return;
    appliedUrlKey.current = urlKey;
    skipNextWrite.current = true;

    const existing = intent.widgetInstanceId
      ? widgets.find((w) => w.id === intent.widgetInstanceId)
      : findWidgetByType(intent.widgetType);

    if (existing) {
      focusWidget(existing.id);
    } else {
      const liveData = intent.viewState ? { ...intent.viewState, __navInitial: intent.viewState } : null;
      openWidget(intent.widgetType, liveData);
    }
  }, [hasHydrated, searchParams, widgets, openWidget, focusWidget, findWidgetByType]);

  useEffect(() => {
    const onPopState = () => {
      skipNextWrite.current = true;
      const intent = parseWorkspaceUrl(new URLSearchParams(window.location.search));
      if (!intent) return;
      const existing = findWidgetByType(intent.widgetType);
      if (existing) focusWidget(existing.id);
      else
        openWidget(
          intent.widgetType,
          intent.viewState ? { ...intent.viewState, __navInitial: intent.viewState } : null,
        );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [findWidgetByType, focusWidget, openWidget]);

  return { writeUrl, syncUrlFromFocusedWidget };
}
