"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";
import type { ChromeNavResult } from "@/components/os/navigation/WorkspaceNavigationProvider";

const WORKSPACE_HISTORY_KEY = "bsd_workspace_back";

type Options = {
  enabled: boolean;
  getFocusedWidgetId: () => string | undefined;
  chromeBack: (widgetId: string) => ChromeNavResult;
  focusWidget: (id: string) => void;
  closeWidget: (id: string) => void;
};

function pushWorkspaceHistoryAnchor(): void {
  window.history.pushState({ [WORKSPACE_HISTORY_KEY]: true }, "", window.location.href);
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export function useWorkspaceHardwareBack({
  enabled,
  getFocusedWidgetId,
  chromeBack,
  focusWidget,
  closeWidget,
}: Options) {
  const router = useRouter();
  const { status } = useSession();
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !isMobileViewport()) {
      seededRef.current = false;
      return;
    }

    if (!seededRef.current) {
      pushWorkspaceHistoryAnchor();
      seededRef.current = true;
    }

    const onPopState = () => {
      if (isLoginPath(window.location.pathname)) {
        if (status === "authenticated") {
          router.replace("/");
        }
        pushWorkspaceHistoryAnchor();
        return;
      }

      const focusedId = getFocusedWidgetId();
      if (focusedId) {
        const result = chromeBack(focusedId);
        if (result.handled) {
          if (result.focusWidgetId) focusWidget(result.focusWidgetId);
          pushWorkspaceHistoryAnchor();
          return;
        }
        closeWidget(focusedId);
        pushWorkspaceHistoryAnchor();
        return;
      }

      pushWorkspaceHistoryAnchor();
    };

    window.addEventListener("popstate", onPopState, { capture: true });
    return () => window.removeEventListener("popstate", onPopState, { capture: true });
  }, [
    enabled,
    status,
    router,
    getFocusedWidgetId,
    chromeBack,
    focusWidget,
    closeWidget,
  ]);
}
