"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useWindowManager, type WidgetType } from "@/hooks/use-window-manager";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";
import { useAutomationRunner } from "@/hooks/useAutomationRunner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import { resolveWidgetOpen } from "@/lib/os-assistant/resolve-widget-open";
import { isSubscriberWidgetVisible } from "@/lib/launcher/subscriber-widgets";
import { parseWorkspaceUrl } from "@/lib/workspace-url";
import { hasOpenedDefaultWidgetsOnce, markDefaultWidgetsOpened } from "@/lib/workspace/default-widgets-flag";
import type { SearchResult } from "./types";
import { useNotificationsFeed } from "./useNotificationsFeed";
import { useOmniCanvasHandlers } from "./useOmniCanvasHandlers";

export function useOmniCanvasState() {
  const { data: session, status: sessionStatus } = useSession();
  const [mounted, setMounted] = useState(false);
  // Track if session was ever authenticated — prevents spinner on silent background refetches
  const [everAuthenticated, setEverAuthenticated] = useState(false);
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

  const userId = session?.user?.id ?? null;
  const authReady = sessionStatus !== "loading";

  useEffect(() => {
    setHasOpenedDefaults(false);
  }, [userId]);

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
    toggleMinimize,
    restoreWidget,
    updateZoom,
    clearLayout,
    isFirstTime,
    isCleanDashboard,
    toggleWorkState,
    applyProfessionalLayout,
    updateWidgetLiveData,
  } = useWindowManager({ userId, authReady });

  const openWorkspaceWidget = useCallback(
    (
      type: WidgetType,
      data?: Record<string, unknown> | null,
      options?: { maximize?: boolean },
    ) => {
      const resolved = resolveWidgetOpen(type, data ?? null);
      if (!resolved) return "";
      const { type: openType, liveData } = resolved;
      if (!isSubscriberWidgetVisible(openType, session?.user?.email)) return "";
      if (openType === "fieldCopilot") {
        const existing = widgets.find((w) => w.type === "fieldCopilot");
        if (existing) {
          focusWidget(existing.id);
          return existing.id;
        }
      }
      if (options?.maximize) {
        return openWidgetFocused(openType, liveData, { maximize: true });
      }
      return openWidget(openType, liveData);
    },
    [widgets, focusWidget, openWidget, openWidgetFocused, session?.user?.email],
  );

  const hasMaximizedWidget = widgets.some((w) => w.isMaximized && !w.isMinimized);
  // הסרגל תמיד גלוי בדסקטופ; במצב חלון מלא הוא מתכווץ לאייקונים (collapsed) במקום להסתתר.
  const sidebarRailVisible = true;

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

  const { notifications, setNotifications } = useNotificationsFeed(
    sessionStatus,
    session?.user?.id,
  );

  const automationRunner = useAutomationRunner({
    openWidget,
    closeWidget,
    focusWidget,
    toggleMaximize,
    clearLayout,
    widgets: widgets.map((w) => ({ id: w.id, type: w.type })),
    setSystemMessage,
    reportMeckanoAttendance: async (action: "in" | "out") => {
      handlers.reportMeckanoAttendance(action);
    },
    openWindowSwitcher: () => setWindowSwitcherOpen(true),
  });

  const automationContextValue = useMemo(
    () => ({ ...automationRunner, assistantToolDeps: automationRunner.deps }),
    [automationRunner],
  );

  const handlers = useOmniCanvasHandlers({
    t,
    openWidget,
    setSystemMessage,
    setSearchResults,
    setMobileOmnibarOpen,
    setIsNotificationsOpen,
    setNotifications,
    setIsBusy,
    automationRunner,
    sessionEmail: session?.user?.email,
  });

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
    if (sessionStatus === "authenticated") setEverAuthenticated(true);
  }, [sessionStatus]);

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
    if (!hasHydrated || !session || widgets.length > 0 || !isFirstTime || hasOpenedDefaults || isCleanDashboard) return;
    // `isFirstTime` only means "no saved layout right now" — that's also true every
    // time a returning user closes all their windows. Without this permanent
    // per-user flag, clearing your workspace would re-trigger the welcome widgets
    // forever. Only run this once, ever, per browser+user.
    if (userId && hasOpenedDefaultWidgetsOnce(userId)) return;
    if (typeof window !== "undefined") {
      const deepLink = parseWorkspaceUrl(new URLSearchParams(window.location.search));
      if (deepLink) return;
    }
    setHasOpenedDefaults(true);
    if (userId) markDefaultWidgetsOpened(userId);
    openWorkspaceWidget("financeHub", { tab: "overview" });
    queueMicrotask(() => {
      if (typeof window !== "undefined") {
        const deepLinkNow = parseWorkspaceUrl(new URLSearchParams(window.location.search));
        if (deepLinkNow) return;
      }
      openWidget("crmTable");
    });
  }, [
    hasHydrated,
    session,
    widgets.length,
    openWidget,
    openWorkspaceWidget,
    hasOpenedDefaults,
    isFirstTime,
    isCleanDashboard,
    userId,
  ]);

  return {
    t, dir, locale,
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
    // window manager
    widgets, hasHydrated, openWidget, closeWidget, focusWidget,
    updateWidgetPosition, updateWidgetSize, toggleMaximize, toggleMinimize, restoreWidget,
    updateZoom, updateWidgetLiveData,
    isCleanDashboard, toggleWorkState,
    // computed
    hasMaximizedWidget, sidebarRailVisible,
    openWorkspaceWidget,
    // handlers
    handleApplyScreenLayout,
    widgetTitle,
    ...handlers,
    // automation
    automationRunner, automationContextValue,
  };
}
