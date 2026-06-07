"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot } from "lucide-react";
import SortableLauncherZone from "@/components/os/launcher/SortableLauncherZone";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import { useSession } from "next-auth/react";
import WidgetInstance from "@/components/os/navigation/WidgetInstance";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { registerWorkspaceBoundsRef } from "@/lib/workspace/workspace-bounds-registry";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { WidgetContent } from "./WidgetContent";

interface OSWorkspaceProps {
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
  onWidgetViewChange?: (widgetId: string, widgetType: WidgetType, state: WidgetViewState | null) => void;
}

export default function OSWorkspace({
  widgets, hasHydrated, openWidget, openWorkspaceWidget,
  closeWidget, focusWidget, updateWidgetPosition, updateWidgetSize,
  toggleMaximize, toggleMinimize, updateZoom, onWidgetViewChange,
}: OSWorkspaceProps) {
  const { t, dir } = useI18n();
  const { editMode: launcherEditMode } = useLauncherConfig();
  const { data: session } = useSession();
  const workspaceBoundsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    registerWorkspaceBoundsRef(workspaceBoundsRef);
    return () => registerWorkspaceBoundsRef(null);
  }, []);

  const [greetingKey, setGreetingKey] = React.useState("workspaceWidgets.empty.greetingMorning");
  const userName = session?.user?.name?.split(" ")[0] || t("workspaceWidgets.empty.guestUser");
  const widgetTitle = (type: WidgetType) => t(`workspaceWidgets.titles.${type}`);

  const visibleWidgets = React.useMemo(() => widgets.filter((w) => !w.isMinimized), [widgets]);
  const topZ = visibleWidgets.length > 0 ? Math.max(...visibleWidgets.map((w) => w.zIndex)) : 0;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || visibleWidgets.length === 0) return;
      const topWidget = [...visibleWidgets].sort((a, b) => {
        if (a.isMaximized && !b.isMaximized) return -1;
        if (!a.isMaximized && b.isMaximized) return 1;
        return b.zIndex - a.zIndex;
      })[0];
      if (topWidget?.isMaximized) { toggleMaximize(topWidget.id); return; }
      if (topWidget) closeWidget(topWidget.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleWidgets, closeWidget, toggleMaximize]);

  React.useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 5) setGreetingKey("workspaceWidgets.empty.greetingNight");
    else if (hour < 12) setGreetingKey("workspaceWidgets.empty.greetingMorning");
    else if (hour < 18) setGreetingKey("workspaceWidgets.empty.greetingNoon");
    else setGreetingKey("workspaceWidgets.empty.greetingEvening");
  }, []);

  return (
    <div ref={workspaceBoundsRef} className="relative flex h-full min-h-0 flex-1 overflow-hidden" dir={dir}>
      <AnimatePresence mode="wait">
        {hasHydrated && visibleWidgets.length === 0 && (
          <motion.section key="empty-state"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
            className={`absolute inset-0 z-10 flex min-h-0 flex-col items-center overflow-x-hidden overflow-y-auto overscroll-contain p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:justify-start md:gap-6 md:px-6 md:pb-8 ${
              launcherEditMode ? "pt-[calc(6.5rem+env(safe-area-inset-top))] md:pt-24" : "pt-5 md:pt-5"
            }`}
          >
            <header className={`flex w-full max-w-4xl shrink-0 flex-col items-center pb-2 text-center transition-opacity md:pb-0 ${launcherEditMode ? "pointer-events-none max-h-0 overflow-hidden opacity-0" : ""}`}>
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm md:mb-4 md:h-16 md:w-16">
                <Bot size={28} className="text-indigo-400" aria-hidden />
              </div>
              <h1 className="mb-1.5 px-4 text-2xl font-black tracking-normal text-[color:var(--foreground-main)] sm:text-3xl md:mb-2 md:text-4xl lg:text-5xl">
                {t(greetingKey)},{" "}
                <span className="bg-gradient-to-l from-emerald-400 to-indigo-400 bg-clip-text text-transparent">{userName}</span>
              </h1>
              <p className="mx-auto max-w-xl px-4 text-sm font-semibold leading-6 text-[color:var(--foreground-muted)] text-pretty md:text-lg md:leading-7">
                {t("workspaceWidgets.empty.subtitle", { omnibar: t("workspaceWidgets.empty.omnibarName") })}
              </p>
            </header>
            <div className="flex w-full min-w-0 max-w-[min(100%,17.75rem)] shrink-0 flex-col items-center justify-center px-2 pt-2 md:max-w-[min(100%,38.5rem)] md:px-4 md:pt-0">
              <SortableLauncherZone zone="quickGrid" variant="quick" onOpen={openWidget} className="w-full min-w-0 max-w-full shrink-0" />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div
        className={`pointer-events-none absolute inset-0 ${visibleWidgets.length > 0 ? "z-[1190]" : "z-20"}`}
      >
        {widgets.map((widget) => (
          <WidgetInstance
            key={widget.id} widget={widget} title={widgetTitle(widget.type)}
            topZ={topZ} isFocused={widget.zIndex === topZ}
            onClose={() => closeWidget(widget.id)} onFocus={() => focusWidget(widget.id)}
            onPositionChange={(pos) => updateWidgetPosition(widget.id, pos)}
            onResize={(s) => updateWidgetSize(widget.id, s)}
            onMaximize={() => toggleMaximize(widget.id)} onMinimize={() => toggleMinimize(widget.id)}
            onZoomChange={(delta) => updateZoom(widget.id, delta)}
            onRequestFocusWidget={focusWidget} onViewChange={onWidgetViewChange}
            workspaceBoundsRef={workspaceBoundsRef}
          >
            <WidgetContent widget={widget} openWorkspaceWidget={openWorkspaceWidget} />
          </WidgetInstance>
        ))}
      </div>
    </div>
  );
}
