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
  const skipNextWrite = useRef(false);
  const openIntentKeyRef = useRef<string | null>(null);
  /** כשהמשתמש סגר חלון שמופיע ב-URL — לא לפתוח אותו מחדש. */
  const dismissedIntentKeyRef = useRef<string | null>(null);
  const prevWidgetsRef = useRef<ActiveWidget[]>([]);
  /** מונע לולאת focusWidget → widgets → effect (Maximum update depth / error boundary). */
  const fulfilledFocusRef = useRef<string | null>(null);

  const currentUrlKey = useCallback((): string => {
    return (
      searchParams.toString() ||
      (typeof window !== "undefined" ? window.location.search.slice(1) : "")
    );
  }, [searchParams]);

  const widgetMatchesUrlIntent = useCallback(
    (widget: ActiveWidget, intent: NonNullable<ReturnType<typeof parseWorkspaceUrl>>) => {
      if (intent.widgetInstanceId) return intent.widgetInstanceId === widget.id;
      if (widget.type !== intent.widgetType) return false;
      const projectId =
        intent.widgetType === "project" && typeof intent.viewState?.projectId === "string"
          ? intent.viewState.projectId
          : null;
      if (projectId) return widget.liveData?.projectId === projectId;
      return true;
    },
    [],
  );

  const resolveIntent = useCallback((): ReturnType<typeof parseWorkspaceUrl> => {
    const fromHook = parseWorkspaceUrl(searchParams);
    if (fromHook) return fromHook;
    if (typeof window === "undefined") return null;
    return parseWorkspaceUrl(new URLSearchParams(window.location.search));
  }, [searchParams]);

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
        const intent = resolveIntent();
        const urlKey = currentUrlKey();
        // אל תנקה ?w= לפני שה-deep link הספיק לפתוח חלון (race עם widgets.length === 0)
        if (intent && dismissedIntentKeyRef.current !== urlKey) return;
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
    [writeUrl, getWidgetViewState, resolveIntent, currentUrlKey],
  );

  useEffect(() => {
    if (!hasHydrated) {
      prevWidgetsRef.current = widgets;
      return;
    }

    const prev = prevWidgetsRef.current;
    const removed = prev.filter((p) => !widgets.some((w) => w.id === p.id));
    if (removed.length > 0) {
      const intent = resolveIntent();
      const urlKey = currentUrlKey();
      if (intent && urlKey) {
        const closedMatchingUrl = removed.some((widget) => widgetMatchesUrlIntent(widget, intent));
        if (closedMatchingUrl) {
          dismissedIntentKeyRef.current = urlKey;
          skipNextWrite.current = true;
          writeUrl({ widgetType: null, viewState: null });
          fulfilledFocusRef.current = null;
        }
      }
    }

    prevWidgetsRef.current = widgets;
  }, [
    widgets,
    hasHydrated,
    resolveIntent,
    currentUrlKey,
    widgetMatchesUrlIntent,
    writeUrl,
  ]);

  useEffect(() => {
    if (!hasHydrated) return;
    const intent = resolveIntent();
    if (!intent) return;

    const urlKey = currentUrlKey();
    if (!urlKey) return;

    const projectId =
      intent.widgetType === "project" && typeof intent.viewState?.projectId === "string"
        ? intent.viewState.projectId
        : null;

    const matchingWidget = intent.widgetInstanceId
      ? widgets.find((w) => w.id === intent.widgetInstanceId)
      : widgets.find((w) => {
          if (w.type !== intent.widgetType) return false;
          if (projectId) return w.liveData?.projectId === projectId;
          return true;
        });

    if (matchingWidget) {
      const focusKey = `${urlKey}:${matchingWidget.id}`;
      if (fulfilledFocusRef.current !== focusKey) {
        fulfilledFocusRef.current = focusKey;
        const topZ = Math.max(...widgets.map((w) => w.zIndex));
        if (matchingWidget.zIndex < topZ) {
          skipNextWrite.current = true;
          focusWidget(matchingWidget.id);
        }
      }
      return;
    }

    fulfilledFocusRef.current = null;

    if (dismissedIntentKeyRef.current === urlKey) return;
    if (openIntentKeyRef.current === urlKey) return;
    openIntentKeyRef.current = urlKey;
    skipNextWrite.current = true;

    const viewState = intent.viewState;
    const liveData = viewState
      ? {
          ...viewState,
          ...(projectId ? { projectId } : {}),
          __navInitial: viewState,
        }
      : null;
    openWidget(intent.widgetType, liveData);
  }, [hasHydrated, searchParams, widgets, openWidget, focusWidget, resolveIntent, currentUrlKey]);

  useEffect(() => {
    const onPopState = () => {
      skipNextWrite.current = true;
      dismissedIntentKeyRef.current = null;
      openIntentKeyRef.current = null;
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
