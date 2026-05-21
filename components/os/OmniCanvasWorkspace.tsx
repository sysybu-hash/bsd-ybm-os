"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { isMeckanoSubscriberEmail } from "@/lib/meckano-access";
import { useWindowManager, type WidgetType } from "@/hooks/use-window-manager";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";
import { useAutomationRunner } from "@/hooks/useAutomationRunner";
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
import NotificationCenter, { OSNotification, OSNotificationAction } from "@/components/os/NotificationCenter";
import FileDropzone from "@/components/os/FileDropzone";
import KnowledgeVaultWorkspaceBridge from "@/components/os/KnowledgeVaultWorkspaceBridge";
import PwaInstallBanner from "@/components/os/system/PwaInstallBanner";
import PasskeyOfferModal from "@/components/auth/PasskeyOfferModal";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import { interpretDoneFallback } from "@/lib/i18n/ai-locale";
import { parseWorkspaceUrl } from "@/lib/workspace-url";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

function mapFeedItemToNotification(raw: Record<string, unknown>): OSNotification {
  return {
    id: String(raw.id ?? `n-${Date.now()}`),
    title: String(raw.title ?? ""),
    message: String(raw.message ?? raw.body ?? ""),
    severity: (raw.severity as OSNotification["severity"]) ?? "info",
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    linkType: raw.linkType != null ? String(raw.linkType) : null,
    targetId: raw.targetId != null ? String(raw.targetId) : null,
  };
}

export default function OmniCanvasWorkspace() {
  const { data: session, status: sessionStatus } = useSession();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<OSNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const { t, dir, locale } = useI18n();
  const { profile: tradeProfile } = useTradeProfile();
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
    openWidgetFocused,
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
    applyProfessionalLayout,
  } = useWindowManager();

  const openWorkspaceWidget = useCallback(
    (
      type: WidgetType,
      data?: Record<string, unknown> | null,
      options?: { maximize?: boolean },
    ) => {
      if (options?.maximize) {
        return openWidgetFocused(type, data ?? null, { maximize: true });
      }
      return openWidget(type, data ?? null);
    },
    [openWidget, openWidgetFocused],
  );

  const hasMaximizedWidget = widgets.some((w) => w.isMaximized);
  const sidebarRailVisible = !hasMaximizedWidget || sidebarRailPeek;

  const handleApplyScreenLayout = useCallback(() => {
    if (widgets.length === 0) {
      toast.message(t("workspaceShell.topBar.screenLayout.toastNoWindows"));
      return;
    }
    if (typeof window !== "undefined" && isMobileViewport()) {
      toast.message(t("workspaceShell.topBar.screenLayout.toastMobile"));
      return;
    }
    applyProfessionalLayout();
    toast.success(t("workspaceShell.topBar.screenLayout.toastSuccess"));
  }, [applyProfessionalLayout, t, widgets.length]);

  const reportMeckanoAttendance = useCallback(
    async (action: "in" | "out") => {
      if (!isMeckanoSubscriberEmail(session?.user?.email)) {
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

  const widgetTitle = useCallback(
    (type: WidgetType) => {
      if (type === "aiScanner") {
        return `${t("workspaceWidgets.titles.aiScanner")} · ${tradeProfile.vocabulary.document}`;
      }
      if (type === "erpArchive") {
        return tradeProfile.documentsLabel;
      }
      if (type === "settings") {
        const spec =
          tradeProfile.businessLineLabel ??
          tradeProfile.constructionTradeLabel ??
          tradeProfile.industryLabel;
        return `${t("workspaceWidgets.titles.settings")} · ${spec}`;
      }
      return t(`workspaceWidgets.titles.${type}`);
    },
    [t, tradeProfile],
  );

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
      setNotifications([]);
      return;
    }

    const abort = new AbortController();
    let disposed = false;
    let inFlight = false;

    const fetchNotifications = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/notifications/feed", {
          credentials: "include",
          cache: "no-store",
          signal: abort.signal,
        });
        if (disposed) return;
        if (!res.ok) {
          setNotifications([]);
          return;
        }
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          setNotifications([]);
          return;
        }
        if (disposed) return;
        const items = Array.isArray(data) ? data : [];
        setNotifications(items.map((item) => mapFeedItemToNotification(item as Record<string, unknown>)));
      } catch (err) {
        if (disposed || abort.signal.aborted) return;
        const isNetworkFailure =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" || err.message.includes("NetworkError"));
        if (process.env.NODE_ENV === "development" && !isNetworkFailure) {
          console.warn("Notifications feed unavailable", err);
        }
        setNotifications([]);
      } finally {
        inFlight = false;
      }
    };

    const scheduleFetch = () => {
      void fetchNotifications();
    };

    scheduleFetch();

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval || disposed) return;
      pollInterval = setInterval(scheduleFetch, 10000);
    };

    try {
      es = new EventSource("/api/notifications/feed/stream");
      es.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown> | Record<string, unknown>[];
          if (Array.isArray(payload)) {
            setNotifications(payload.map((item) => mapFeedItemToNotification(item)));
            return;
          }
          const next = mapFeedItemToNotification(payload);
          setNotifications((prev) => {
            if (prev.some((n) => n.id === next.id)) return prev;
            return [next, ...prev];
          });
        } catch {
          scheduleFetch();
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      abort.abort();
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sessionStatus, session?.user?.id]);

  useEffect(() => {
    if (!hasHydrated || !session || widgets.length > 0 || !isFirstTime || hasOpenedDefaults || isCleanDashboard) {
      return;
    }
    if (typeof window !== "undefined") {
      const deepLink = parseWorkspaceUrl(new URLSearchParams(window.location.search));
      if (deepLink) return;
    }
    setHasOpenedDefaults(true);
    const timer = setTimeout(() => {
      openWidget("dashboard");
      setTimeout(() => openWidget("crmTable"), 300);
    }, 800);
    return () => clearTimeout(timer);
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
        const top = results[0]!;
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

  return (
    <LauncherConfigProvider>
    <AutomationRunnerProvider value={automationContextValue}>
    <KnowledgeVaultWorkspaceBridge assistantToolDeps={automationRunner.deps}>
    <main className="quiet-shell fixed inset-0 max-w-[100vw] overflow-hidden font-sans selection:bg-indigo-500/20 transition-colors duration-300" dir={dir}>
      <PwaInstallBanner />
      <PasskeyOfferModal />
      <LauncherEditBanner />
      <LauncherPickerSheet />
      <FirstDayWizard
        onOpenWidget={(type) => {
          openWidget(type);
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
