"use client";

import React from "react";
import dynamic from "next/dynamic";
import { PanelRightOpen } from "lucide-react";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import type { WidgetType } from "@/hooks/use-window-manager";

const OSSidebar = dynamic(() => import("@/components/os/layout/OSSidebar"), { ssr: false });

/** מסתיר את רail הסרגל בעריכת quick grid על מסך הבית — מונע כפילות UI */
export function OmniCanvasSidebarRail({
  widgetsCount,
  sidebarRailVisible,
  hasMaximizedWidget,
  sidebarRailPeek,
  setSidebarRailPeek,
  isSidebarOpen,
  setIsSidebarOpen,
  openWidget,
  sidebarAria,
}: {
  widgetsCount: number;
  sidebarRailVisible: boolean;
  hasMaximizedWidget: boolean;
  sidebarRailPeek: boolean;
  setSidebarRailPeek: (v: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  openWidget: (type: WidgetType) => void;
  sidebarAria: string;
}) {
  const { editMode } = useLauncherConfig();
  const hideForHomeGridEdit = editMode && widgetsCount === 0;
  const railVisible = sidebarRailVisible && !hideForHomeGridEdit;

  // הסרגל תמיד גלוי כעת — לשונית ההצצה נדרשת רק אם הסרגל מוסתר.
  const showPeekTab = !railVisible && hasMaximizedWidget && !sidebarRailPeek && !hideForHomeGridEdit;

  return (
    <>
      {showPeekTab ? (
        <button
          type="button"
          className="os-sidebar-peek-rail fixed z-[1190] hidden desktop-vp:flex items-center justify-center"
          onMouseEnter={() => setSidebarRailPeek(true)}
          onClick={() => setSidebarRailPeek(true)}
          onFocus={() => setSidebarRailPeek(true)}
          aria-label={sidebarAria}
          title={sidebarAria}
        >
          <PanelRightOpen size={16} aria-hidden className="rtl:rotate-180" />
        </button>
      ) : null}

      <OSSidebar
        openWidget={(type) => {
          openWidget(type);
          setIsSidebarOpen(false);
          setSidebarRailPeek(false);
        }}
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
        hidden={!railVisible}
        onMouseLeave={() => hasMaximizedWidget && setSidebarRailPeek(false)}
      />
    </>
  );
}

export function OmniCanvasWorkspaceInset({
  widgetsCount,
  sidebarRailVisible,
  children,
}: {
  widgetsCount: number;
  sidebarRailVisible: boolean;
  children: React.ReactNode;
}) {
  const { editMode } = useLauncherConfig();
  // במסך הבית (ללא חלונות) לא שומרים מקום לסרגל — כדי שהאריחים יתמרכזו סימטרית.
  // כשיש חלונות פתוחים שומרים את רוחב הסרגל המכווץ; ההתרחבות ב-hover מרחפת מעל התוכן.
  const padSidebar = sidebarRailVisible && widgetsCount > 0 && !editMode;

  return (
    <div
      className={`absolute inset-0 z-[1] flex min-h-0 flex-col overflow-hidden pt-[var(--workspace-inset-top)] pb-[var(--mobile-chrome-bottom)] desktop-vp:pb-[var(--desktop-dock-clearance)] ${padSidebar ? "desktop-vp:ps-[calc(var(--os-sidebar-rail-width)_+_var(--os-sidebar-gap))]" : ""}`}
    >
      {children}
    </div>
  );
}
