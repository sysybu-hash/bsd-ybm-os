"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { toast } from "sonner";
import { MECKANO_SUBSCRIBER_EMAIL } from "@/lib/meckano-access";
import { useWindowManager, type WidgetType } from "@/hooks/use-window-manager";
import { useAutomationRunner } from "@/hooks/useAutomationRunner";
import { AutomationRunnerProvider } from "@/components/os/AutomationRunnerContext";
import OSHeader from "@/components/os/layout/OSHeader";
import OSSidebar from "@/components/os/layout/OSSidebar";
import OSWorkspace from "@/components/os/layout/OSWorkspace";
import OSDock from "@/components/os/layout/OSDock";
import WindowSwitcher from "@/components/os/layout/WindowSwitcher";
import MobileBottomNav from "@/components/os/layout/MobileBottomNav";
import MobileOmnibarSheet from "@/components/os/MobileOmnibarSheet";
import LandingPage from "@/components/landing/LandingPage";
import NotificationCenter, { OSNotification, OSNotificationAction } from "@/components/os/NotificationCenter";
import FileDropzone from "@/components/os/FileDropzone";
import { useI18n } from "@/components/os/system/I18nProvider";
import { interpretDoneFallback } from "@/lib/i18n/ai-locale";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

export default function OmniCanvas() {
  const { data: session, status: sessionStatus } = useSession();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<OSNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const { t, dir, locale } = useI18n();
  const [systemMessage, setSystemMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasOpenedDefaults, setHasOpenedDefaults] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarRailPeek, setSidebarRailPeek] = useState(false);
  const [mobileOmnibarOpen, setMobileOmnibarOpen] = useState(false);
  const [windowSwitcherOpen, setWindowSwitcherOpen] = useState(false);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  const {
    widgets,
    hasHydrated,
    openWidget,
    closeWidget,
    focusWidget,
    updateWidgetPosition,
    updateWidgetSize,
    toggleMaximize,
    updateZoom,
    clearLayout,
    isFirstTime,
    isCleanDashboard,
    toggleWorkState,
  } = useWindowManager();

  const hasMaximizedWidget = widgets.some((w) => w.isMaximized);
  const sidebarRailVisible = !hasMaximizedWidget || sidebarRailPeek;

  const reportMeckanoAttendance = useCallback(
    async (action: "in" | "out") => {
      if (session?.user?.email?.toLowerCase() !== MECKANO_SUBSCRIBER_EMAIL.toLowerCase()) {
        toast.error(t("workspaceWidgets.page.commands.meckanoNoPermission"));
        return;
      }

      const label =
        action === "in"
          ? t("workspaceWidgets.page.commands.meckanoIn")
          : t("workspaceWidgets.page.commands.meckanoOut");
      setSystemMessage(t("workspaceWidgets.page.commands.meckanoReporting", { action: label }));

      try {
        const res = await fetch("/api/meckano/clock-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, timestamp: new Date().toISOString() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t("workspaceWidgets.page.commands.meckanoFailed"));
        setSystemMessage(data.message || t("workspaceWidgets.page.commands.meckanoReported", { action: label }));
        toast.success(t("workspaceWidgets.page.commands.meckanoSuccess", { action: label }));
      } catch (err) {
        const message = err instanceof Error ? err.message : t("workspaceWidgets.page.commands.meckanoFailed");
        setSystemMessage(t("workspaceWidgets.page.commands.meckanoError"));
        toast.error(message);
      }
    },
    [session?.user?.email, t],
  );

  const automationRunner = useAutomationRunner({
    openWidget,
    closeWidget,
    focusWidget,
    toggleMaximize,
    clearLayout,
    widgets: widgets.map((w) => ({ id: w.id, type: w.type })),
    setSystemMessage,
    reportMeckanoAttendance,
    openWindowSwitcher: () => setWindowSwitcherOpen(true),
  });

  const automationContextValue = useMemo(
    () => ({
      ...automationRunner,
      assistantToolDeps: automationRunner.deps,
    }),
    [automationRunner],
  );

  const widgetTitle = useCallback((type: WidgetType) => t(`workspaceWidgets.titles.${type}`), [t]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key === "Tab") {
        e.preventDefault();
        setWindowSwitcherOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setSystemMessage(t("workspaceWidgets.page.systemReady"));
  }, [t]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session?.user?.id) {
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications/feed", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch notifications", err);
      }
    };

    void fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [sessionStatus, session?.user?.id]);

  useEffect(() => {
    if (hasHydrated && session && widgets.length === 0 && isFirstTime && !hasOpenedDefaults && !isCleanDashboard) {
      setHasOpenedDefaults(true);
      const timer = setTimeout(() => {
        openWidget("dashboard");
        setTimeout(() => openWidget("crmTable"), 300);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [hasHydrated, session, widgets.length, openWidget, hasOpenedDefaults, isFirstTime, isCleanDashboard]);

  const handleSearchPreview = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&preview=true`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      }
    } catch (err) {
      console.error("Search preview failed", err);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setSearchResults([]);
    setMobileOmnibarOpen(false);
    if (result.type === "project") {
      openWidget("project", { name: result.name });
      setSystemMessage(t("workspaceWidgets.page.commands.openedProject", { name: result.name }));
      return;
    }

    openWidget("crmTable");
    setSystemMessage(t("workspaceWidgets.page.commands.openedClient", { name: result.name }));
  };

  const handleCommand = async (command: string) => {
    const cmd = command.trim();
    if (!cmd) return;

    setSearchResults([]);
    setIsBusy(true);
    setSystemMessage(t("workspaceWidgets.page.commands.processing"));

    try {
      if (cmd.startsWith("/")) {
        openWidget("aiChatFull", { provider: "gemini", prompt: cmd.slice(1).trim() });
        setSystemMessage(t("workspaceWidgets.page.commands.openedAiChat"));
        return;
      }

      const handled = await automationRunner.handleCommandWithAutomations(cmd);
      if (handled) return;

      const res = await fetch(`/api/search?q=${encodeURIComponent(cmd)}`, { credentials: "include" });
      const data = await res.json();
      const results: SearchResult[] = Array.isArray(data.results) ? data.results : [];

      if (results.length > 0) {
        const top = results[0];
        if (top.type === "project") {
          openWidget("project", { name: top.name });
          setSystemMessage(t("workspaceWidgets.page.commands.foundProject", { name: top.name }));
        } else {
          openWidget("crmTable");
          setSystemMessage(t("workspaceWidgets.page.commands.foundClient", { name: top.name }));
        }
      } else {
        openWidget("aiChatFull", { prompt: cmd });
        setSystemMessage(t("workspaceWidgets.page.commands.openingAiChat"));
      }
    } catch (err) {
      console.error("Command Error:", err);
      setSystemMessage(t("workspaceWidgets.page.commands.commandError"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleMobileCommand = async (command: string) => {
    await handleCommand(command);
    setMobileOmnibarOpen(false);
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await fetch("/api/user/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [id] }),
      });
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  };

  const handleClearAllNotifications = async () => {
    try {
      await fetch("/api/user/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      setNotifications([]);
    } catch (err) {
      console.error("Failed to clear notifications", err);
      toast.error(t("workspaceWidgets.page.notifications.clearFailed"));
    }
  };

  const handleNotificationNavigate = async (notification: OSNotification) => {
    const linkType = notification.linkType ?? "general";
    const targetId = notification.targetId;

    switch (linkType) {
      case "project":
      case "projectBoard":
        openWidget("projectBoard", targetId ? { projectId: targetId } : null);
        break;
      case "erp":
        openWidget("erp", targetId ? { documentId: targetId } : null);
        break;
      case "aiScanner":
      case "scan":
        openWidget("aiScanner", targetId ? { documentId: targetId } : null);
        break;
      case "expense":
        openWidget("aiScanner");
        break;
      default:
        break;
    }

    await markNotificationRead(notification.id);
    setIsNotificationsOpen(false);
  };

  const handleNotificationAction = async (action: OSNotificationAction) => {
    if (action.action === "dismiss") {
      const id = action.payload?.id;
      if (!id) return;
      await markNotificationRead(id);
    } else if (action.action === "viewProject") {
      openWidget("project", { name: action.payload?.query });
      setIsNotificationsOpen(false);
    } else if (action.action === "openErp") {
      openWidget("erp");
      setIsNotificationsOpen(false);
    } else if (action.action === "openScanner") {
      openWidget("aiScanner");
      setIsNotificationsOpen(false);
    } else if (action.action === "whatsapp") {
      const phone = action.payload?.phone;
      if (phone) {
        window.open(`https://wa.me/${phone.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
      }
    } else if (action.action === "confirmExpense") {
      /* handled inside NotificationCenter */
    }
  };

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

  if (sessionStatus === "unauthenticated" || !session) {
    return <LandingPage onLogin={() => void signIn("google", { callbackUrl: "/" })} />;
  }

  return (
    <AutomationRunnerProvider value={automationContextValue}>
    <main className="quiet-shell fixed inset-0 max-w-[100vw] overflow-hidden font-sans selection:bg-indigo-500/20 transition-colors duration-300" dir={dir}>
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
        className={`absolute inset-0 flex min-h-0 flex-col overflow-hidden pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[var(--mobile-chrome-bottom)] md:pb-[var(--desktop-dock-clearance)] ${sidebarRailVisible ? "md:pe-[calc(var(--os-sidebar-rail-width)+var(--os-sidebar-gap))]" : ""}`}
      >
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
        />
      </div>

      <OSDock
        systemMessage={systemMessage}
        onCommand={handleCommand}
        apiLatency={apiLatency}
        isBusy={isBusy}
        onSearchPreview={handleSearchPreview}
        searchResults={searchResults}
        onSelectResult={handleSelectResult}
        openWorkspaceWidget={openWidget}
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
          openWorkspaceWidget={openWidget}
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
    </AutomationRunnerProvider>
  );
}
