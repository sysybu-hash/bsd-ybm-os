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
  updateWidgetLiveData?: (id: string, liveData: Record<string, unknown> | null) => void;
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
  updateWidgetLiveData,
}: Options) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skipNextWrite = useRef(false);
  const prevWidgetsRef = useRef<ActiveWidget[]>([]);
  /** מונע לולאת focusWidget → widgets → effect (Maximum update depth / error boundary). */
  const fulfilledFocusRef = useRef<string | null>(null);
  /** On a fresh page load, a `?w=…&wid=…` URL is a self-written focus link from a previous
   *  session — not user intent. We strip it once so reloads restore ONLY the saved layout. */
  const initialUrlStripped = useRef(false);

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
    // The real, current URL is the only ground truth — a raw (non-router) history
    // mutation elsewhere can leave the useSearchParams() hook value stale, which
    // would otherwise make a URL we already stripped keep appearing to "have" a
    // deep link forever. Only fall back to the hook value for SSR.
    if (typeof window !== "undefined") {
      return parseWorkspaceUrl(new URLSearchParams(window.location.search));
    }
    return parseWorkspaceUrl(searchParams);
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

    // First processing after hydration: if the URL carries a window instance id (`wid`),
    // it's a stale self-written focus link from a previous session — strip it and don't
    // auto-open. The saved layout (use-window-manager) is the single source of truth for
    // what reopens, so a refresh restores exactly the windows the user left — nothing else.
    // Intentional deep links (launcher, emails) use `?w=X` WITHOUT a `wid` and still open.
    if (!initialUrlStripped.current) {
      initialUrlStripped.current = true;
      if (intent.widgetInstanceId && typeof window !== "undefined") {
        dismissedWorkspaceIntentFp = intentFingerprint(intent);
        // router.replace (not the raw History API) so Next's own useSearchParams()
        // state updates too — a raw history.replaceState call can leave it stale,
        // causing this same "stale wid" URL to keep being read as if still present.
        router.replace(window.location.pathname, { scroll: false });
        return;
      }
    }

    const fp = intentFingerprint(intent);

    const projectId =
      (intent.widgetType === "project" || intent.widgetType === "projectsHub") &&
      typeof intent.viewState?.projectId === "string"
        ? intent.viewState.projectId
        : null;

    const matchingWidget = findWidgetForIntent(intent);

    if (matchingWidget) {
      const viewState = intent.viewState;
      if (viewState && Object.keys(viewState).length > 0 && updateWidgetLiveData) {
        const merged: Record<string, unknown> = { ...(matchingWidget.liveData ?? {}), ...viewState };
        const prevKey = JSON.stringify(matchingWidget.liveData ?? {});
        const nextKey = JSON.stringify(merged);
        if (prevKey !== nextKey) {
          updateWidgetLiveData(matchingWidget.id, merged);
        }
      }
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

    // A `?w=X&wid=Y` URL carries a specific window instance id. Reaching this branch means
    // no open window matches that id — i.e. it's a stale self-written focus URL left over
    // from a previous session/refresh (the instance no longer exists). Don't resurrect the
    // window; strip the deep link so a refresh starts clean. (Intentional deep links — from
    // the launcher, emails, etc. — carry `?w=X` without a `wid` and still open below.)
    if (intent.widgetInstanceId && typeof window !== "undefined") {
      dismissedWorkspaceIntentFp = fp;
      router.replace(window.location.pathname, { scroll: false });
      return;
    }

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
  }, [hasHydrated, searchParams, widgets, openWidget, focusWidget, resolveIntent, intentFingerprint, findWidgetForIntent, updateWidgetLiveData, router]);

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
