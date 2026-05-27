"use client";

import React from "react";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { WidgetNavigationProvider } from "@/components/os/navigation/WidgetNavigationProvider";
import { useWorkspaceNavigation } from "@/components/os/navigation/WorkspaceNavigationProvider";
import ManagedWidgetShell from "@/components/os/navigation/ManagedWidgetShell";
import WidgetErrorBoundary from "@/components/os/WidgetErrorBoundary";

function readInitialView(widget: ActiveWidget): WidgetViewState | null {
  const data = widget.liveData;
  if (!data) return null;
  const nav = data.__navInitial;
  if (nav && typeof nav === "object" && !Array.isArray(nav)) {
    return nav as WidgetViewState;
  }
  return null;
}

type Props = {
  widget: ActiveWidget;
  title: string;
  isFocused: boolean;
  topZ: number;
  onClose: () => void;
  onFocus: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onResize: (size: { width: number; height: number }) => void;
  onMaximize: () => void;
  onMinimize: () => void;
  onZoomChange: (delta: number) => void;
  onRequestFocusWidget: (widgetId: string) => void;
  onViewChange?: (widgetId: string, widgetType: WidgetType, state: WidgetViewState | null) => void;
  workspaceBoundsRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
};

export default function WidgetInstance({
  widget,
  title,
  isFocused,
  topZ,
  onClose,
  onFocus,
  onPositionChange,
  onResize,
  onMaximize,
  onMinimize,
  onZoomChange,
  onRequestFocusWidget,
  onViewChange,
  workspaceBoundsRef,
  children,
}: Props) {
  const wsNav = useWorkspaceNavigation();
  const initialView = readInitialView(widget);

  return (
    <WidgetNavigationProvider
      widgetId={widget.id}
      widgetType={widget.type}
      initialView={initialView}
      registerController={wsNav.registerController}
      onViewChange={(state) => onViewChange?.(widget.id, widget.type, state)}
    >
      <ManagedWidgetShell
        widget={widget}
        title={title}
        isFocused={isFocused && widget.zIndex === topZ}
        onClose={onClose}
        onFocus={onFocus}
        onPositionChange={onPositionChange}
        onResize={onResize}
        onMaximize={onMaximize}
        onMinimize={onMinimize}
        onZoomChange={onZoomChange}
        workspaceBoundsRef={workspaceBoundsRef}
        onRequestFocusWidget={onRequestFocusWidget}
      >
        <WidgetErrorBoundary widgetId={widget.id} widgetTitle={title}>
          {children}
        </WidgetErrorBoundary>
      </ManagedWidgetShell>
    </WidgetNavigationProvider>
  );
}
