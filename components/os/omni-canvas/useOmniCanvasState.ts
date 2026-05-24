"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useWindowManager, type WidgetType } from "@/hooks/use-window-manager";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";
import { useAutomationRunner } from "@/hooks/useAutomationRunner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import { parseWorkspaceUrl } from "@/lib/workspace-url";
import type { SearchResult } from "./types";
import { useNotificationsFeed } from "./useNotificationsFeed";
import { useOmniCanvasHandlers } from "./useOmniCanvasHandlers";

export function useOmniCanvasState() {
  const { data: session, status: sessionStatus } = useSession();
  const [mounted, setMounted] = useState(false);
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
    ...handlers,
    // automation
    automationRunner, automationContextValue,
  };
}
