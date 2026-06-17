"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import {
  buildWorkspaceSearchParams,
  parseWorkspaceUrl,
  workspaceIntentFingerprint,
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

/** Survives Suspense/remount when router.replace updates searchParams. */
let dismissedWorkspaceIntentFp: string | null = null;
let fulfilledOpenIntentFp: string | null = null;

/** Synchronous dismiss — call before closeWidget so URL sync cannot reopen the window. */
export function dismissWorkspaceUrlIntent(
  intent: NonNullable<ReturnType<typeof parseWorkspaceUrl>>,
) {
  dismissedWorkspaceIntentFp = workspaceIntentFingerprint(intent, { ignoreInstanceId: true });
  fulfilledOpenIntentFp = null;
}

export function dismissWorkspaceUrlIntentForWidget(
  widget: ActiveWidget,
  intent: NonNullable<ReturnType<typeof parseWorkspaceUrl>>,
) {
  if (widget.type !== intent.widgetType) return false;
  const projectId =
    (intent.widgetType === "project" || intent.widgetType === "projectsHub") &&
    typeof intent.viewState?.projectId === "string"
      ? intent.viewState.projectId
      : null;
  if (projectId && widget.liveData?.projectId !== projectId) return false;
  dismissWorkspaceUrlIntent(intent);
  return true;
}

export function useWorkspaceUrlSync({
  hasHydrated,
  widgets,
  openWidget,
  focusWidget,
  findWidgetByType,
  getWidgetViewState,
}: Options) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skipNextWrite = useRef(false);
  const prevWidgetsRef = useRef<ActiveWidget[]>([]);
  /** מונע לולאת focusWidget → widgets → effect (Maximum update depth / error boundary). */
  const fulfilledFocusRef = useRef<string | null>(null);

  const intentFingerprint = useCallback(
    (intent: NonNullable<ReturnType<typeof parseWorkspaceUrl>>) =>
      workspaceIntentFingerprint(intent, { ignoreInstanceId: true }),
    [],
  );

  const widgetMatchesUrlIntent = useCallback(
    (widget: ActiveWidget, intent: NonNullable<ReturnType<typeof parseWorkspaceUrl>>) => {
      if (widget.type !== intent.widgetType) return false;
      const projectId =
        (intent.widgetType === "project" || intent.widgetType === "projectsHub") &&
        typeof intent.viewState?.projectId === "string"
          ? intent.viewState.projectId
          : null;
      if (projectId) return widget.liveData?.projectId === projectId;
      return true;
    },
    [],
  );

  const findWidgetForIntent = useCallback(
    (intent: NonNullable<ReturnType<typeof parseWorkspaceUrl>>) => {
      if (intent.widgetInstanceId) {
        const byId = widgets.find((w) => w.id === intent.widgetInstanceId);
        if (byId) return byId;
      }
      return widgets.find((w) => widgetMatchesUrlIntent(w, intent));
    },
    [widgets, widgetMatchesUrlIntent],
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
        // אל תנקה ?w= לפני שה-deep link הספיק לפתוח חלון (race עם widgets.length === 0)
        if (intent && dismissedWorkspaceIntentFp !== intentFingerprint(intent)) return;
        writeUrl({ widgetType: null, viewState: null });
        return;
      }
      const viewState = getWidgetViewState(focused.id);
      const mergedViewState =
        (focused.type === "project" || focused.type === "projectsHub") &&
        typeof focused.liveData?.projectId === "string"
          ? { ...(viewState ?? {}), projectId: focused.liveData.projectId }
          : viewState;
      writeUrl({
        widgetType: focused.type,
        widgetInstanceId: focused.id,
        viewState: mergedViewState,
      });
    },
    [writeUrl, getWidgetViewState, resolveIntent, intentFingerprint],
  );

  useEffect(() => {
    if (!hasHydrated) return;
    if (!resolveIntent()) {
      dismissedWorkspaceIntentFp = null;
      fulfilledOpenIntentFp = null;
    }
  }, [hasHydrated, searchParams, resolveIntent]);

  useEffect(() => {
    if (!hasHydrated) {
      prevWidgetsRef.current = widgets;
      return;
    }

    const prev = prevWidgetsRef.current;
    const removed = prev.filter((p) => !widgets.some((w) => w.id === p.id));
    if (removed.length > 0) {
      const intent = resolveIntent();
      if (intent) {
        const closedMatchingUrl = removed.some((widget) => widgetMatchesUrlIntent(widget, intent));
        if (closedMatchingUrl) {
          dismissedWorkspaceIntentFp = intentFingerprint(intent);
          fulfilledOpenIntentFp = null;
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
    widgetMatchesUrlIntent,
    writeUrl,
    intentFingerprint,
  ]);

  useEffect(() => {
    if (!hasHydrated) return;
    const intent = resolveIntent();
    if (!intent) return;

    const fp = intentFingerprint(intent);

    const projectId =
      (intent.widgetType === "project" || intent.widgetType === "projectsHub") &&
      typeof intent.viewState?.projectId === "string"
        ? intent.viewState.projectId
        : null;

    const matchingWidget = findWidgetForIntent(intent);

    if (matchingWidget) {
      const focusKey = `${fp}:${matchingWidget.id}`;
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

    if (dismissedWorkspaceIntentFp === fp) return;
    if (fulfilledOpenIntentFp === fp) return;
    fulfilledOpenIntentFp = fp;
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
  }, [hasHydrated, searchParams, widgets, openWidget, focusWidget, resolveIntent, intentFingerprint, findWidgetForIntent]);

  useEffect(() => {
    const onPopState = () => {
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        if (path === "/login" || path.startsWith("/login/")) return;
      }
      skipNextWrite.current = true;
      dismissedWorkspaceIntentFp = null;
      fulfilledOpenIntentFp = null;
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
