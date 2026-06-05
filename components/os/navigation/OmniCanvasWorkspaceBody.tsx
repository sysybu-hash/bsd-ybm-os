"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useWorkspaceNavigation } from "@/components/os/navigation/WorkspaceNavigationProvider";
import { useWorkspaceUrlSync } from "@/hooks/use-workspace-url-sync";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { isSubscriberWidgetVisible } from "@/lib/launcher/subscriber-widgets";
import { parseWidgetType } from "@/lib/workspace-url";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import OSWorkspace from "@/components/os/layout/OSWorkspace";

type Props = {
  widgets: ActiveWidget[];
  hasHydrated: boolean;
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => string;
  openWorkspaceWidget: OpenWorkspaceWidgetFn;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  updateWidgetPosition: (id: string, pos: { x: number; y: number }) => void;
  updateWidgetSize: (id: string, size: { width: number; height: number }) => void;
  toggleMaximize: (id: string) => void;
  toggleMinimize: (id: string) => void;
  updateZoom: (id: string, delta: number) => void;
};

export default function OmniCanvasWorkspaceBody({
  widgets,
  hasHydrated,
  openWidget,
  openWorkspaceWidget,
  closeWidget,
  focusWidget,
  updateWidgetPosition,
  updateWidgetSize,
  toggleMaximize,
  toggleMinimize,
  updateZoom,
}: Props) {
  const wsNav = useWorkspaceNavigation();
  const { data: session } = useSession();
  const router = useRouter();
  const userEmail = session?.user?.email ?? null;

  const guardedOpenWidget = useCallback(
    (type: WidgetType, data?: Record<string, unknown> | null) => {
      if (!isSubscriberWidgetVisible(type, userEmail)) {
        router.replace("/", { scroll: false });
        return "";
      }
      return openWidget(type, data ?? null);
    },
    [openWidget, userEmail, router],
  );

  useEffect(() => {
    if (!hasHydrated || session === undefined) return;
    const blocked = widgets.filter((w) => !isSubscriberWidgetVisible(w.type, userEmail));
    if (blocked.length === 0) return;
    for (const w of blocked) closeWidget(w.id);
    if (typeof window !== "undefined") {
      const raw = new URLSearchParams(window.location.search).get("w");
      const fromUrl = parseWidgetType(raw);
      if (fromUrl && !isSubscriberWidgetVisible(fromUrl, userEmail)) {
        router.replace("/", { scroll: false });
      }
    }
  }, [hasHydrated, session, userEmail, widgets, closeWidget, router]);

  const findWidgetByType = useCallback(
    (type: WidgetType) => widgets.find((w) => w.type === type),
    [widgets],
  );

  const getFocusedWidget = useCallback((): ActiveWidget | undefined => {
    if (widgets.length === 0) return undefined;
    const topZ = Math.max(...widgets.map((w) => w.zIndex));
    return widgets.find((w) => w.zIndex === topZ);
  }, [widgets]);

  const { syncUrlFromFocusedWidget } = useWorkspaceUrlSync({
    hasHydrated,
    widgets,
    openWidget: guardedOpenWidget,
    focusWidget,
    findWidgetByType,
    getWidgetViewState: wsNav.getWidgetViewState,
  });

  const onWidgetViewChange = useCallback(
    (_widgetId: string, _type: WidgetType, _state: WidgetViewState | null) => {
      const focused = getFocusedWidget();
      if (focused) syncUrlFromFocusedWidget(focused);
    },
    [getFocusedWidget, syncUrlFromFocusedWidget],
  );

  const focusSignature = useMemo(
    () => widgets.map((w) => `${w.id}:${w.zIndex}`).join("|"),
    [widgets],
  );

  useEffect(() => {
    if (!hasHydrated) return;
    if (widgets.length === 0) {
      syncUrlFromFocusedWidget(undefined);
      return;
    }
    const focused = getFocusedWidget();
    syncUrlFromFocusedWidget(focused);
  }, [focusSignature, hasHydrated, widgets.length, getFocusedWidget, syncUrlFromFocusedWidget]);

  return (
    <OSWorkspace
      widgets={widgets}
      hasHydrated={hasHydrated}
      openWidget={openWidget}
      openWorkspaceWidget={openWorkspaceWidget}
      closeWidget={closeWidget}
      focusWidget={focusWidget}
      updateWidgetPosition={updateWidgetPosition}
      updateWidgetSize={updateWidgetSize}
      toggleMaximize={toggleMaximize}
      toggleMinimize={toggleMinimize}
      updateZoom={updateZoom}
      onWidgetViewChange={onWidgetViewChange}
    />
  );
}
