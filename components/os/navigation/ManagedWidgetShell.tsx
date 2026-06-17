"use client";

import React, { useCallback, useEffect } from "react";
import AdaptiveWidgetShell from "@/components/os/AdaptiveWidgetShell";
import type { ActiveWidget } from "@/hooks/use-window-manager";
import { useWorkspaceNavigation } from "@/components/os/navigation/WorkspaceNavigationProvider";

type Props = {
  widget: ActiveWidget;
  title: string;
  isFocused: boolean;
  onClose: () => void;
  onFocus: () => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onResize: (size: { width: number; height: number }) => void;
  onMaximize: () => void;
  onMinimize: () => void;
  onZoomChange: (delta: number) => void;
  workspaceBoundsRef: React.RefObject<HTMLElement | null>;
  onRequestFocusWidget: (widgetId: string) => void;
  children: React.ReactNode;
};

export default function ManagedWidgetShell({
  widget,
  title,
  isFocused,
  onClose,
  onFocus,
  onPositionChange,
  onResize,
  onMaximize,
  onMinimize,
  onZoomChange,
  workspaceBoundsRef,
  onRequestFocusWidget,
  children,
}: Props) {
  const wsNav = useWorkspaceNavigation();

  useEffect(() => {
    if (isFocused) wsNav.recordWidgetFocus(widget.id);
  }, [isFocused, widget.id, wsNav]);

  const canGoBack = wsNav.canChromeBack(widget.id);
  const canGoForward = wsNav.canChromeForward(widget.id);

  const handleBack = useCallback(() => {
    const result = wsNav.chromeBack(widget.id);
    if (result.focusWidgetId) {
      onRequestFocusWidget(result.focusWidgetId);
      return;
    }
    if (result.handled) return;
    onClose();
  }, [wsNav, widget.id, onRequestFocusWidget, onClose]);

  const handleForward = useCallback(() => {
    const result = wsNav.chromeForward(widget.id);
    if (result.focusWidgetId) onRequestFocusWidget(result.focusWidgetId);
  }, [wsNav, widget.id, onRequestFocusWidget]);

  return (
    <AdaptiveWidgetShell
      id={widget.id}
      title={title}
      onClose={onClose}
      initialOffset={widget.position}
      size={widget.size}
      zIndex={widget.zIndex}
      isFocused={isFocused}
      isMaximized={widget.isMaximized}
      zoom={widget.zoom}
      onFocus={onFocus}
      onPositionChange={onPositionChange}
      onResize={onResize}
      onMaximize={onMaximize}
      onMinimize={onMinimize}
      isMinimized={widget.isMinimized}
      onZoomChange={onZoomChange}
      workspaceBoundsRef={workspaceBoundsRef}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onBack={handleBack}
      onForward={handleForward}
      maximizeHiddenOnMobile={false}
    >
      {children}
    </AdaptiveWidgetShell>
  );
}
