"use client";

import React, { Suspense } from "react";
import { AutomationRunnerProvider } from "@/components/os/AutomationRunnerContext";
import OSHeader from "@/components/os/layout/OSHeader";
import OSSidebar from "@/components/os/layout/OSSidebar";
import { WorkspaceNavigationProvider } from "@/components/os/navigation/WorkspaceNavigationProvider";
import OmniCanvasWorkspaceBody from "@/components/os/navigation/OmniCanvasWorkspaceBody";
import OSDock from "@/components/os/layout/OSDock";
import WindowSwitcher from "@/components/os/layout/WindowSwitcher";
import MobileBottomNav from "@/components/os/layout/MobileBottomNav";
import { LauncherConfigProvider } from "@/components/os/launcher/LauncherConfigProvider";
import LauncherEditBanner from "@/components/os/launcher/LauncherEditBanner";
import LauncherPickerSheet from "@/components/os/launcher/LauncherPickerSheet";
import FirstDayWizard from "@/components/os/onboarding/FirstDayWizard";
import MobileOmnibarSheet from "@/components/os/MobileOmnibarSheet";
import NotificationCenter from "@/components/os/NotificationCenter";
import FileDropzone from "@/components/os/FileDropzone";
import KnowledgeVaultWorkspaceBridge from "@/components/os/KnowledgeVaultWorkspaceBridge";
import PwaInstallBanner from "@/components/os/system/PwaInstallBanner";
import PasskeyOfferModal from "@/components/auth/PasskeyOfferModal";
import { useOmniCanvasState } from "./omni-canvas/useOmniCanvasState";

export default function OmniCanvasWorkspace() {
  const s = useOmniCanvasState();
  const {
    t, dir,
    mounted, sessionStatus,
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
    widgets, hasHydrated, openWidget, closeWidget, focusWidget,
    updateWidgetPosition, updateWidgetSize, toggleMaximize, updateZoom,
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

  if (!mounted || sessionStatus === "loading") {
    return (
      <div
        className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-[color:var(--background-main)] text-[color:var(--foreground-muted)]"
        dir={dir}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" aria-hidden />
        <p className="mt-4 text-sm font-semibold">{t("workspaceWidgets.page.loading")}</p>
      </div>
    );
  }

  return (
    <LauncherConfigProvider>
    <AutomationRunnerProvider value={automationContextValue}>
    <KnowledgeVaultWorkspaceBridge assistantToolDeps={automationRunner.deps}>
    <main className="quiet-shell fixed inset-0 max-w-[100vw] overflow-hidden font-sans selection:bg-indigo-500/20 transition-colors duration-300" dir={dir}>
      <PwaInstallBanner />
      <PasskeyOfferModal />
      <LauncherEditBanner />
      <LauncherPickerSheet />
      <FirstDayWizard onOpenWidget={(type) => { openWidget(type); }} />
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

      {hasMaximizedWidget && !sidebarRailPeek ? (
        <button
          type="button"
          className="os-sidebar-peek-rail fixed z-[1190] hidden md:block"
          onMouseEnter={() => setSidebarRailPeek(true)}
          onFocus={() => setSidebarRailPeek(true)}
          aria-label={t("workspaceWidgets.sidebar.aria")}
        />
      ) : null}

      <OSSidebar
        openWidget={(type) => {
          openWidget(type);
          setIsSidebarOpen(false);
          setSidebarRailPeek(false);
        }}
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
        hidden={!sidebarRailVisible}
        onMouseLeave={() => hasMaximizedWidget && setSidebarRailPeek(false)}
      />

      <div
        className={`absolute inset-0 z-[1] flex min-h-0 flex-col overflow-hidden pt-[var(--workspace-inset-top)] pb-[var(--mobile-chrome-bottom)] md:pb-[var(--desktop-dock-clearance)] ${sidebarRailVisible ? "md:ps-[calc(var(--os-sidebar-rail-width)+var(--os-sidebar-gap))]" : ""}`}
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
              updateZoom={updateZoom}
            />
          </Suspense>
        </WorkspaceNavigationProvider>
      </div>

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
      <FileDropzone onProcessed={(n) => setNotifications((prev) => [n, ...prev])} onLatency={setApiLatency} />
    </main>
    </KnowledgeVaultWorkspaceBridge>
    </AutomationRunnerProvider>
    </LauncherConfigProvider>
  );
}
