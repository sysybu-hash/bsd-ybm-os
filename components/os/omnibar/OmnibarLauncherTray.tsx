"use client";

import React, { useCallback, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ChevronUp, HardHat, Scan, MessageSquare, LayoutGrid } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { WidgetType } from "@/hooks/use-window-manager";

type TrayAction = {
  type: WidgetType;
  labelKey: string;
  icon: React.ReactNode;
};

const TRAY_ACTIONS: TrayAction[] = [
  { type: "aiHub", labelKey: "workspaceWidgets.quickActions.aiHub.title", icon: <MessageSquare size={18} aria-hidden /> },
  { type: "aiScanner", labelKey: "workspaceWidgets.quickActions.aiScanner.title", icon: <Scan size={18} aria-hidden /> },
  { type: "fieldCopilot", labelKey: "workspaceWidgets.sidebar.fieldCopilot", icon: <HardHat size={18} aria-hidden /> },
  { type: "documentsHub", labelKey: "workspaceWidgets.quickActions.documentsHub.title", icon: <LayoutGrid size={18} aria-hidden /> },
];

type OmnibarLauncherTrayProps = {
  openWorkspaceWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  onCloseSheet?: () => void;
};

export default function OmnibarLauncherTray({
  openWorkspaceWidget,
  onCloseSheet,
}: OmnibarLauncherTrayProps) {
  const { t, dir } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const dragY = useMotionValue(0);
  const trayOpacity = useTransform(dragY, [0, 80], [1, 0.85]);
  const startYRef = useRef(0);

  const toggle = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const delta = startYRef.current - e.clientY;
    if (delta > 36) setExpanded(true);
    else if (delta < -24) setExpanded(false);
    void animate(dragY, 0, { duration: 0.2 });
  };

  return (
    <motion.div
      style={{ opacity: trayOpacity }}
      className="mt-2 shrink-0"
      dir={dir}
    >
      <button
        type="button"
        onClick={toggle}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 rounded-t-2xl border border-b-0 border-[color:var(--border-main)] bg-[color:var(--surface-card)]/90 px-3 py-2 touch-manipulation"
        aria-expanded={expanded}
        aria-controls="omnibar-launcher-tray-panel"
      >
        <span className="h-1 w-10 rounded-full bg-[color:var(--foreground-muted)]/40" aria-hidden />
        <span className="flex items-center gap-1 text-[10px] font-bold text-[color:var(--foreground-muted)]">
          <ChevronUp
            size={14}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
          {expanded
            ? t("workspaceWidgets.omnibar.trayCollapse")
            : t("workspaceWidgets.omnibar.trayExpand")}
        </span>
      </button>

      <motion.div
        id="omnibar-launcher-tray-panel"
        initial={false}
        animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 320 }}
        className="overflow-hidden rounded-b-2xl border border-t-0 border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95"
      >
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          {TRAY_ACTIONS.map((action) => (
            <button
              key={action.type}
              type="button"
              onClick={() => {
                openWorkspaceWidget(action.type, null);
                onCloseSheet?.();
              }}
              className="flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/40 px-2 py-2.5 text-center text-[10px] font-bold text-[color:var(--foreground-main)] transition hover:border-indigo-500/40 hover:bg-indigo-500/5"
            >
              <span className="text-indigo-400">{action.icon}</span>
              <span className="line-clamp-2 leading-tight">{t(action.labelKey)}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
