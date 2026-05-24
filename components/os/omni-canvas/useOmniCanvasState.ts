"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { isMeckanoSubscriberEmail } from "@/lib/meckano-access";
import { useWindowManager, type WidgetType } from "@/hooks/use-window-manager";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";
import { useAutomationRunner } from "@/hooks/useAutomationRunner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import { parseWorkspaceUrl } from "@/lib/workspace-url";
import type { OSNotification, OSNotificationAction } from "@/components/os/NotificationCenter";
import { mapFeedItemToNotification, type SearchResult } from "./types";

export function useOmniCanvasState() {
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
    () => ({ ...automationRunner, assistantToolDeps: automationRunner.deps }),
    [automationRunner],
  );

  const widgetTitle = useCallback(
    (type: WidgetType) => {
      if (type === "aiScanner") {
        return `${t("workspaceWidgets.titles.aiScanner")} · ${tradeProfile.vocabulary.document}`;
      }
      if (type === "erpArchive") return tradeProfile.documentsLabel;
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

  // ── effects ───────────────────────────────────────────────────────────────
  useEffect(() => { setMounted(true); }, []);

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

  useEffect(() => { setSystemMessage(t("workspaceWidgets.page.systemReady")); }, [t]);

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
        if (!res.ok) { setNotifications([]); return; }
        let data: unknown;
        try { data = await res.json(); } catch { setNotifications([]); return; }
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

    const scheduleFetch = () => { void fetchNotifications(); };
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
        } catch { scheduleFetch(); }
      };
      es.onerror = () => { es?.close(); es = null; startPolling(); };
    } catch { startPolling(); }

    return () => {
      disposed = true;
      abort.abort();
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sessionStatus, session?.user?.id]);

  useEffect(() => {
    if (!hasHydrated || !session || widgets.length > 0 || !isFirstTime || hasOpenedDefaults || isCleanDashboard) return;
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

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSearchPreview = async (query: string) => {
    if (query.trim().length < 2) { setSearchResults([]); return; }
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

  return {
    t, dir, locale,
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
    // window manager
    widgets, hasHydrated, openWidget, closeWidget, focusWidget,
    updateWidgetPosition, updateWidgetSize, toggleMaximize, updateZoom,
    isCleanDashboard, toggleWorkState,
    // computed
    hasMaximizedWidget, sidebarRailVisible,
    openWorkspaceWidget,
    // handlers
    handleApplyScreenLayout,
    widgetTitle,
    handleSearchPreview, handleSelectResult,
    handleCommand, handleMobileCommand,
    handleClearAllNotifications, handleNotificationNavigate, handleNotificationAction,
    // automation
    automationRunner, automationContextValue,
  };
}
