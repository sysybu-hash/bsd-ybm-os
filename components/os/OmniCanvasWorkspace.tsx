"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { AutomationRunnerProvider } from "@/components/os/AutomationRunnerContext";
import OSHeader from "@/components/os/layout/OSHeader";
import { WorkspaceNavigationProvider } from "@/components/os/navigation/WorkspaceNavigationProvider";
import OmniCanvasWorkspaceBody from "@/components/os/navigation/OmniCanvasWorkspaceBody";
import OSDock from "@/components/os/layout/OSDock";
import MinimizedWidgetsBar from "@/components/os/layout/MinimizedWidgetsBar";
import MobileBottomNav from "@/components/os/layout/MobileBottomNav";
import { LauncherConfigProvider } from "@/components/os/launcher/LauncherConfigProvider";
import { OmniCanvasSidebarRail, OmniCanvasWorkspaceInset } from "@/components/os/layout/OmniCanvasChrome";
import LauncherEditBanner from "@/components/os/launcher/LauncherEditBanner";
import WorkspaceUtilityRail from "@/components/os/utility-rail/WorkspaceUtilityRail";
import { useOmniCanvasState } from "./omni-canvas/useOmniCanvasState";
import { useMobileViewportSync } from "@/hooks/use-mobile-viewport-sync";
import { useLockPortraitOrientation } from "@/hooks/use-lock-portrait-orientation";
import OsBootSplash from "@/components/os/boot/OsBootSplash";
import { useOsBootGate } from "@/components/os/boot/useOsBootGate";

/** Deferred chrome — not needed for LCP / first paint */
const OSSidebar = dynamic(() => import("@/components/os/layout/OSSidebar"), { ssr: false });
const PwaInstallBanner = dynamic(() => import("@/components/os/system/PwaInstallBanner"), { ssr: false });
const PasskeyOfferModal = dynamic(() => import("@/components/auth/PasskeyOfferModal"), { ssr: false });
const LauncherPickerSheet = dynamic(() => import("@/components/os/launcher/LauncherPickerSheet"), { ssr: false });
const FirstDayWizard = dynamic(() => import("@/components/os/onboarding/FirstDayWizard"), { ssr: false });
const LauncherV2MigrationBanner = dynamic(
  () => import("@/components/os/onboarding/LauncherV2MigrationBanner"),
  { ssr: false },
);
const NotificationCenter = dynamic(() => import("@/components/os/NotificationCenter"), { ssr: false });
const FileDropzone = dynamic(() => import("@/components/os/FileDropzone"), { ssr: false });
const WindowSwitcher = dynamic(() => import("@/components/os/layout/WindowSwitcher"), { ssr: false });
const MobileOmnibarSheet = dynamic(() => import("@/components/os/MobileOmnibarSheet"), { ssr: false });
const KnowledgeVaultWorkspaceBridge = dynamic(
  () => import("@/components/os/KnowledgeVaultWorkspaceBridge"),
  { ssr: false },
);

export default function OmniCanvasWorkspace() {
  useMobileViewportSync();
  useLockPortraitOrientation();

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
    updateWidgetLiveData,
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

  const sessionBlocking = !everAuthenticated && sessionStatus === "loading";
  const { showSplash, fading: bootFading, phase: bootPhase } = useOsBootGate({
    mounted,
    sessionBlocking,
    hasHydrated,
  });

  // Session still resolving — boot only (no empty chrome)
  if (!mounted || sessionBlocking) {
    return <OsBootSplash phase="session" />;
  }

  return (
    <LauncherConfigProvider>
    <AutomationRunnerProvider value={automationContextValue}>
    <KnowledgeVaultWorkspaceBridge assistantToolDeps={automationRunner.deps}>
    {showSplash ? <OsBootSplash phase={bootPhase} fading={bootFading} /> : null}
    <main
      className={`quiet-shell fixed inset-0 h-[100dvh] w-full overflow-hidden font-sans selection:bg-indigo-500/20 transition-colors duration-300 ${
        showSplash ? "pointer-events-none" : ""
      }`}
      dir={dir}
      aria-hidden={showSplash}
    >
      <PwaInstallBanner suppress={widgets.some((w) => !w.isMinimized)} />
      <PasskeyOfferModal />
      <LauncherEditBanner />
      <LauncherV2MigrationBanner />
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
              updateWidgetLiveData={updateWidgetLiveData}
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

      <div className="hidden mobile-vp:contents">
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
