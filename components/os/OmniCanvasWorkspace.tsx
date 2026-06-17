"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { PanelRightOpen } from "lucide-react";
import { AutomationRunnerProvider } from "@/components/os/AutomationRunnerContext";
import OSHeader from "@/components/os/layout/OSHeader";
import { WorkspaceNavigationProvider } from "@/components/os/navigation/WorkspaceNavigationProvider";
import OmniCanvasWorkspaceBody from "@/components/os/navigation/OmniCanvasWorkspaceBody";
import OSDock from "@/components/os/layout/OSDock";
import MinimizedWidgetsBar from "@/components/os/layout/MinimizedWidgetsBar";
import MobileBottomNav from "@/components/os/layout/MobileBottomNav";
import { LauncherConfigProvider, useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import LauncherEditBanner from "@/components/os/launcher/LauncherEditBanner";
import WorkspaceUtilityRail from "@/components/os/utility-rail/WorkspaceUtilityRail";
import { useOmniCanvasState } from "./omni-canvas/useOmniCanvasState";
import type { WidgetType } from "@/hooks/use-window-manager";

/** Deferred chrome — not needed for LCP / first paint */
const OSSidebar = dynamic(() => import("@/components/os/layout/OSSidebar"), { ssr: false });
const PwaInstallBanner = dynamic(() => import("@/components/os/system/PwaInstallBanner"), { ssr: false });
const PasskeyOfferModal = dynamic(() => import("@/components/auth/PasskeyOfferModal"), { ssr: false });
const LauncherPickerSheet = dynamic(() => import("@/components/os/launcher/LauncherPickerSheet"), { ssr: false });
const FirstDayWizard = dynamic(() => import("@/components/os/onboarding/FirstDayWizard"), { ssr: false });
const NotificationCenter = dynamic(() => import("@/components/os/NotificationCenter"), { ssr: false });
const FileDropzone = dynamic(() => import("@/components/os/FileDropzone"), { ssr: false });
const WindowSwitcher = dynamic(() => import("@/components/os/layout/WindowSwitcher"), { ssr: false });
const MobileOmnibarSheet = dynamic(() => import("@/components/os/MobileOmnibarSheet"), { ssr: false });
const KnowledgeVaultWorkspaceBridge = dynamic(
  () => import("@/components/os/KnowledgeVaultWorkspaceBridge"),
  { ssr: false },
);

/** מסתיר את רail הסרגל בעריכת quick grid על מסך הבית — מונע כפילות UI */
function OmniCanvasSidebarRail({
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
          className="os-sidebar-peek-rail fixed z-[1190] hidden md:flex items-center justify-center"
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

function OmniCanvasWorkspaceInset({
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
      className={`absolute inset-0 z-[1] flex min-h-0 flex-col overflow-hidden pt-[var(--workspace-inset-top)] pb-[var(--mobile-chrome-bottom)] md:pb-[var(--desktop-dock-clearance)] ${padSidebar ? "md:ps-[calc(var(--os-sidebar-rail-width)+var(--os-sidebar-gap))]" : ""}`}
    >
      {children}
    </div>
  );
}

export default function OmniCanvasWorkspace() {
  const s = useOmniCanvasState();
  const {
    t, dir,
    mounted, sessionStatus, everAuthenticated,
    notifications, setNotifications, isNotificationsOpen, setIsNotificationsOpen,
    apiLatency, setApiLatency,
    systemMessage,
    isBusy,
    searchResults,
    isSidebarOpen, setIsSidebarOpen,
    sidebarRailPeek, setSidebarRailPeek,
    mobileOmnibarOpen, setMobileOmnibarOpen,
    windowSwitcherOpen, setWindowSwitcherOpen,
    bellButtonRef,
    widgets,
    hasHydrated,
    openWidget,
    closeWidget,
    focusWidget,
    updateWidgetPosition,
    updateWidgetSize,
    toggleMaximize,
    toggleMinimize,
    restoreWidget,
    updateZoom,
    isCleanDashboard, toggleWorkState,
    hasMaximizedWidget, sidebarRailVisible,
    openWorkspaceWidget,
    handleApplyScreenLayout,
    widgetTitle,
    handleSearchPreview, handleSelectResult,
    handleCommand, handleMobileCommand,
    handleClearAllNotifications, handleNotificationNavigate, handleNotificationAction,
    automationRunner, automationContextValue,
  } = s;

  React.useEffect(() => {
    if (!mounted || (!everAuthenticated && sessionStatus === "loading")) return;
    document.documentElement.dataset.workspaceActive = "true";
    return () => {
      delete document.documentElement.dataset.workspaceActive;
    };
  }, [mounted, everAuthenticated, sessionStatus]);

  // When a window is maximized (desktop), collapse the global top header to a
  // thin peek strip and let the workspace extend upward — reclaims ~72px of
  // vertical space for every window. CSS keyed off this attribute.
  React.useEffect(() => {
    if (hasMaximizedWidget) {
      document.documentElement.dataset.windowMaximized = "true";
    } else {
      delete document.documentElement.dataset.windowMaximized;
    }
    return () => {
      delete document.documentElement.dataset.windowMaximized;
    };
  }, [hasMaximizedWidget]);

  // Show spinner only on first load, NOT on silent background session refetches
  if (!mounted || (!everAuthenticated && sessionStatus === "loading")) {
    return (
      <div
        className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-[color:var(--background-main)] text-[color:var(--foreground-muted)]"
        dir={dir}
      >
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"
          role="progressbar"
          aria-label={t("workspaceWidgets.page.loading")}
        />
        <p className="mt-4 text-sm font-semibold">{t("workspaceWidgets.page.loading")}</p>
      </div>
    );
  }

  return (
    <LauncherConfigProvider>
    <AutomationRunnerProvider value={automationContextValue}>
    <KnowledgeVaultWorkspaceBridge assistantToolDeps={automationRunner.deps}>
    <main className="quiet-shell fixed inset-0 h-[100dvh] w-full overflow-hidden font-sans selection:bg-indigo-500/20 transition-colors duration-300" dir={dir}>
      <PwaInstallBanner suppress={widgets.some((w) => !w.isMinimized)} />
      <PasskeyOfferModal />
      <LauncherEditBanner />
      <LauncherPickerSheet />
      <FirstDayWizard
        onOpenWidget={(type, data) => {
          openWorkspaceWidget(type, data);
        }}
      />
      <div className="absolute inset-0 z-0 bg-[color:var(--background-main)]" />
      <div className="absolute inset-x-0 top-16 z-0 h-px bg-[color:var(--border-main)]" />

      <OSHeader
        openWidget={openWidget}
        notificationsCount={notifications.length}
        isNotificationsOpen={isNotificationsOpen}
        toggleNotifications={() => setIsNotificationsOpen((open) => !open)}
        bellButtonRef={bellButtonRef}
        isCleanDashboard={isCleanDashboard}
        onToggleWorkState={toggleWorkState}
        onOpenWindowSwitcher={() => setWindowSwitcherOpen(true)}
        onApplyScreenLayout={handleApplyScreenLayout}
      />

      <OmniCanvasSidebarRail
        widgetsCount={widgets.length}
        sidebarRailVisible={sidebarRailVisible}
        hasMaximizedWidget={hasMaximizedWidget}
        sidebarRailPeek={sidebarRailPeek}
        setSidebarRailPeek={setSidebarRailPeek}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        openWidget={openWidget}
        sidebarAria={t("workspaceWidgets.sidebar.aria")}
      />

      <WorkspaceUtilityRail
        openWidget={openWidget}
        suppressOnMobile={widgets.some((w) => !w.isMinimized)}
      />

      <OmniCanvasWorkspaceInset
        widgetsCount={widgets.length}
        sidebarRailVisible={sidebarRailVisible}
      >
        <WorkspaceNavigationProvider>
          <Suspense fallback={null}>
            <OmniCanvasWorkspaceBody
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
            />
          </Suspense>
        </WorkspaceNavigationProvider>
      </OmniCanvasWorkspaceInset>

      <OSDock
        systemMessage={systemMessage}
        onCommand={handleCommand}
        apiLatency={apiLatency}
        isBusy={isBusy}
        onSearchPreview={handleSearchPreview}
        searchResults={searchResults}
        onSelectResult={handleSelectResult}
        openWorkspaceWidget={openWorkspaceWidget}
        assistantToolDeps={automationRunner.deps}
      />

      <MinimizedWidgetsBar
        widgets={widgets}
        widgetTitle={widgetTitle}
        onRestore={restoreWidget}
        onClose={closeWidget}
      />

      <WindowSwitcher
        open={windowSwitcherOpen}
        onClose={() => setWindowSwitcherOpen(false)}
        widgets={widgets}
        widgetTitle={widgetTitle}
        onSelect={focusWidget}
        onCloseWidget={closeWidget}
      />

      <div className="md:hidden">
        <MobileBottomNav
          openWidget={openWidget}
          onOpenOmnibar={() => setMobileOmnibarOpen(true)}
          onOpenWindowSwitcher={() => setWindowSwitcherOpen(true)}
          omnibarOpen={mobileOmnibarOpen}
        />
        <MobileOmnibarSheet
          open={mobileOmnibarOpen}
          onClose={() => setMobileOmnibarOpen(false)}
          systemMessage={systemMessage}
          onCommand={handleMobileCommand}
          apiLatency={apiLatency}
          isBusy={isBusy}
          onSearchPreview={handleSearchPreview}
          searchResults={searchResults}
          onSelectResult={handleSelectResult}
          openWorkspaceWidget={openWorkspaceWidget}
          assistantToolDeps={automationRunner.deps}
        />
      </div>

      <NotificationCenter
        notifications={notifications}
        onAction={handleNotificationAction}
        onNotificationClick={handleNotificationNavigate}
        onClearAll={handleClearAllNotifications}
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        anchorRef={bellButtonRef}
        confirmExpense={async () => undefined}
      />
      <FileDropzone
        onProcessed={(n) => setNotifications((prev) => [n, ...prev])}
        onLatency={setApiLatency}
        onRouteToScanner={() =>
          openWorkspaceWidget("documentsHub", {
            tab: "scan",
            autoScan: true,
            source: "dropzone",
          })
        }
      />
    </main>
    </KnowledgeVaultWorkspaceBridge>
    </AutomationRunnerProvider>
    </LauncherConfigProvider>
  );
}
