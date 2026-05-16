"use client";

import React, { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { toast } from "sonner";
import { MECKANO_SUBSCRIBER_EMAIL } from "@/lib/meckano-access";
import { useWindowManager } from "@/hooks/use-window-manager";
import OSHeader from "@/components/os/layout/OSHeader";
import OSSidebar from "@/components/os/layout/OSSidebar";
import OSWorkspace from "@/components/os/layout/OSWorkspace";
import OSDock from "@/components/os/layout/OSDock";
import MobileBottomNav from "@/components/os/layout/MobileBottomNav";
import MobileOmnibarSheet from "@/components/os/MobileOmnibarSheet";
import LandingPage from "@/components/landing/LandingPage";
import NotificationCenter, { OSNotification, OSNotificationAction } from "@/components/os/NotificationCenter";
import FileDropzone from "@/components/os/FileDropzone";
import { useI18n } from "@/components/os/system/I18nProvider";

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
  const { t, dir } = useI18n();
  const [systemMessage, setSystemMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasOpenedDefaults, setHasOpenedDefaults] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileOmnibarOpen, setMobileOmnibarOpen] = useState(false);
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

  useEffect(() => {
    setMounted(true);
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
        const res = await fetch("/api/data?type=notifications", {
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
      setSystemMessage(`נפתח פרויקט: ${result.name}`);
      return;
    }

    openWidget("crmTable");
    setSystemMessage(`נפתח לקוח: ${result.name}`);
  };

  const reportMeckanoAttendance = async (action: "in" | "out") => {
    if (session?.user?.email?.toLowerCase() !== MECKANO_SUBSCRIBER_EMAIL.toLowerCase()) {
      toast.error("אין לך הרשאה לדווח נוכחות במערכת זו");
      return;
    }

    const label = action === "in" ? "כניסה" : "יציאה";
    setSystemMessage(`מדווח ${label} ל-Meckano...`);

    try {
      const res = await fetch("/api/meckano/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, timestamp: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "הדיווח נכשל");
      setSystemMessage(data.message || `${label} דווחה`);
      toast.success(`דיווח ${label} בוצע בהצלחה`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "הדיווח למערכת Meckano נכשל";
      setSystemMessage("שגיאה בדיווח ל-Meckano");
      toast.error(message);
    }
  };

  const handleCommand = async (command: string) => {
    const cmd = command.trim();
    if (!cmd) return;

    setSearchResults([]);
    setIsBusy(true);
    setSystemMessage("מעבד פקודה...");

    try {
      if (cmd.match(/(דאשבורד|סטטוס|dashboard)/i)) {
        openWidget("dashboard");
        setSystemMessage("דאשבורד פיננסי נפתח");
      } else if (cmd.match(/(נקה|clear|reset|אפס|סידור)/i)) {
        clearLayout();
        setSystemMessage("סידור החלונות אופס");
      } else if (cmd.match(/(crm|לקוחות|ניהול לקוחות|פתח לקוחות)/i)) {
        openWidget("crmTable");
        setSystemMessage("ניהול לקוחות נפתח");
      } else if (cmd.match(/(erp|ארכיון|מסמכים|חשבוניות|סייר)/i)) {
        openWidget("erpArchive");
        setSystemMessage("ארכיון ERP נפתח");
      } else if (cmd.match(/(פרויקטים|לוח|board|tasks|משימות|ניהול פרויקטים)/i)) {
        openWidget("projectBoard");
        setSystemMessage("לוח פרויקטים נפתח");
      } else if (cmd.match(/(הפק|צור|חדש|מחולל|הצעה|חשבונית|quote|invoice)/i)) {
        openWidget("docCreator");
        setSystemMessage("מחולל מסמכים נפתח");
      } else if (cmd.match(/(סרוק|סריקה|scan|upload|העלה|פענח)/i)) {
        openWidget("aiScanner");
        setSystemMessage("סורק AI נפתח");
      } else if (cmd.match(/(כניסה|כניסת עובד|clock in|clock-in)/i)) {
        await reportMeckanoAttendance("in");
      } else if (cmd.match(/(יציאה|יציאת עובד|clock out|clock-out)/i)) {
        await reportMeckanoAttendance("out");
      } else if (cmd.match(/(דוחות מקאנו|שעות עובדים|meckano reports|attendance report)/i)) {
        openWidget("meckanoReports");
        setSystemMessage("מחולל דוחות Meckano נפתח");
      } else if (cmd.match(/(notebooklm|notebook|מחברת|נוטבוק)/i)) {
        openWidget("notebookLM");
        setSystemMessage("NotebookLM נפתח");
      } else if (cmd.startsWith("/")) {
        openWidget("aiChatFull", { provider: "gemini", prompt: cmd.slice(1).trim() });
        setSystemMessage("צ׳אט AI מלא נפתח");
      } else {
        const interpretRes = await fetch("/api/os/assistant/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: cmd }),
        });

        if (interpretRes.ok) {
          const data = (await interpretRes.json()) as {
            reply?: string;
            openWidgets?: string[];
            searchQuery?: string | null;
          };

          for (const w of data.openWidgets ?? []) {
            openWidget(w as Parameters<typeof openWidget>[0]);
          }

          const searchQ = data.searchQuery?.trim() || "";
          if (searchQ) {
            const res = await fetch(`/api/search?q=${encodeURIComponent(searchQ)}`);
            const searchData = await res.json();
            const results: SearchResult[] = Array.isArray(searchData.results) ? searchData.results : [];
            if (results.length > 0) {
              const top = results[0];
              if (top.type === "project") {
                openWidget("project", { name: top.name });
              } else {
                openWidget("crmTable");
              }
            }
          }

          setSystemMessage(data.reply?.trim() || "בוצע.");
          return;
        }

        const res = await fetch(`/api/search?q=${encodeURIComponent(cmd)}`);
        const data = await res.json();
        const results: SearchResult[] = Array.isArray(data.results) ? data.results : [];

        if (results.length > 0) {
          const top = results[0];
          if (top.type === "project") {
            openWidget("project", { name: top.name });
            setSystemMessage(`נמצא פרויקט: ${top.name}`);
          } else {
            openWidget("crmTable");
            setSystemMessage(`נמצא לקוח: ${top.name}`);
          }
        } else {
          openWidget("aiChatFull", { prompt: cmd });
          setSystemMessage("פותח צ'אט AI עם הבקשה שלך");
        }
      }
    } catch (err) {
      console.error("Command Error:", err);
      setSystemMessage("שגיאה בביצוע הפקודה");
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
      toast.error("לא ניתן לנקות את ההתראות");
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
    <main className="quiet-shell fixed inset-0 overflow-hidden font-sans selection:bg-indigo-500/20 transition-colors duration-300" dir={dir}>
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
      />
      <OSSidebar
        openWidget={(type) => {
          openWidget(type);
          setIsSidebarOpen(false);
        }}
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
      />

      <div className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden pt-16 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-[10.5rem]">
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
      />

      <div className="md:hidden">
        <MobileBottomNav openWidget={openWidget} onOpenOmnibar={() => setMobileOmnibarOpen(true)} />
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
  );
}
