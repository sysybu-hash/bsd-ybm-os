"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { useWorkspaceNavigation } from "@/components/os/navigation/WorkspaceNavigationProvider";
import { useWorkspaceUrlSync } from "@/hooks/use-workspace-url-sync";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import OSWorkspace from "@/components/os/layout/OSWorkspace";

type Props = {
  widgets: ActiveWidget[];
  hasHydrated: boolean;
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  updateWidgetPosition: (id: string, pos: { x: number; y: number }) => void;
  updateWidgetSize: (id: string, size: { width: number; height: number }) => void;
  toggleMaximize: (id: string) => void;
  updateZoom: (id: string, delta: number) => void;
};

export default function OmniCanvasWorkspaceBody({
  widgets,
  hasHydrated,
  openWidget,
  closeWidget,
  focusWidget,
  updateWidgetPosition,
  updateWidgetSize,
  toggleMaximize,
  updateZoom,
}: Props) {
  const wsNav = useWorkspaceNavigation();

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
    openWidget,
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
    const focused = getFocusedWidget();
    syncUrlFromFocusedWidget(focused);
  }, [focusSignature, hasHydrated, getFocusedWidget, syncUrlFromFocusedWidget]);

  return (
    <OSWorkspace
      widgets={widgets}
      hasHydrated={hasHydrated}
      openWidget={openWidget}
      closeWidget={closeWidget}
      focusWidget={focusWidget}
      updateWidgetPosition={updateWidgetPosition}
      updateWidgetSize={updateWidgetSize}
      toggleMaximize={toggleMaximize}
      updateZoom={updateZoom}
      onWidgetViewChange={onWidgetViewChange}
    />
  );
}
