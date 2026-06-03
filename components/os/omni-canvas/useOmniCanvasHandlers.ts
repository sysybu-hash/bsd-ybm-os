"use client";

import { toast } from "sonner";
import { isMeckanoSubscriberEmail } from "@/lib/meckano-access";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { OSNotification, OSNotificationAction } from "@/components/os/NotificationCenter";
import type { SearchResult } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger("omni-canvas-handlers");

type AutomationRunner = {
  handleCommandWithAutomations: (cmd: string) => Promise<boolean>;
};

type HandlerDeps = {
  t: (key: string, vars?: Record<string, string>) => string;
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  setSystemMessage: (msg: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setMobileOmnibarOpen: (open: boolean) => void;
  setIsNotificationsOpen: (open: boolean) => void;
  setNotifications: React.Dispatch<React.SetStateAction<OSNotification[]>>;
  setIsBusy: (busy: boolean) => void;
  automationRunner: AutomationRunner;
  sessionEmail: string | null | undefined;
};

export function useOmniCanvasHandlers({
  t, openWidget,
  setSystemMessage, setSearchResults, setMobileOmnibarOpen,
  setIsNotificationsOpen, setNotifications, setIsBusy,
  automationRunner, sessionEmail,
}: HandlerDeps) {

  const reportMeckanoAttendance = async (action: "in" | "out") => {
    if (!isMeckanoSubscriberEmail(sessionEmail)) {
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
  };

  const handleSearchPreview = async (query: string) => {
    if (query.trim().length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&preview=true`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      }
    } catch (err) {
      log.error("search preview failed", { error: err instanceof Error ? err.message : String(err) });
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
      log.error("command failed", { error: err instanceof Error ? err.message : String(err) });
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
      log.error("mark notification read failed", { error: err instanceof Error ? err.message : String(err) });
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
      log.error("clear notifications failed", { error: err instanceof Error ? err.message : String(err) });
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
      case "docCreator":
        openWidget("docCreator", targetId ? { issuedDocumentId: targetId } : null);
        break;
      case "fieldCopilot":
        openWidget("fieldCopilot", targetId ? { sessionId: targetId } : null);
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
    reportMeckanoAttendance,
    handleSearchPreview, handleSelectResult,
    handleCommand, handleMobileCommand,
    markNotificationRead, handleClearAllNotifications,
    handleNotificationNavigate, handleNotificationAction,
  };
}
