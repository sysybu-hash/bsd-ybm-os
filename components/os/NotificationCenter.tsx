"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

export interface OSNotificationAction {
  label: string;
  action: "whatsapp" | "viewProject" | "confirmExpense" | "dismiss" | "openErp" | "openScanner";
  payload?: Record<string, string>;
}

export interface OSNotification {
  id: string;
  title: string;
  message?: string;
  text?: string;
  description?: string;
  severity?: "info" | "warning" | "critical" | "success";
  type?: "ai-detected" | "info" | "warning" | "critical" | "success";
  createdAt: string;
  linkType?: string | null;
  targetId?: string | null;
  actions?: OSNotificationAction[];
  details?: {
    amount?: number;
    projectName?: string;
    vendor?: string;
    [key: string]: unknown;
  };
}

interface NotificationCenterProps {
  notifications: OSNotification[];
  onAction: (action: OSNotificationAction) => void;
  onNotificationClick?: (notification: OSNotification) => void;
  onClearAll?: () => void | Promise<void>;
  confirmExpense?: (details: { amount: number; project: string }) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const severityStyles = {
  info: "border-blue-300/20 bg-blue-400/10 text-blue-700 dark:text-blue-100",
  warning: "border-amber-300/20 bg-amber-400/10 text-amber-700 dark:text-amber-100",
  critical: "border-rose-300/20 bg-rose-400/10 text-rose-700 dark:text-rose-100",
  success: "border-emerald-300/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100",
};

export default function NotificationCenter({
  notifications,
  onAction,
  onNotificationClick,
  onClearAll,
  confirmExpense,
  isOpen,
  onClose,
  anchorRef,
}: NotificationCenterProps) {
  const { t, dir } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 72, left: 16, width: 320 });

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setPosition({ top: rect.bottom + 8, left, width });
  }, [isOpen, anchorRef, notifications.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [isOpen, onClose, anchorRef]);

  const handleConfirmExpense = async (notification: OSNotification) => {
    if (!notification.details?.amount || !notification.details?.projectName) {
      showToast("חסרים פרטי הוצאה");
      return;
    }

    setPendingNotificationId(notification.id);
    try {
      if (confirmExpense) {
        await confirmExpense({
          amount: notification.details.amount,
          project: notification.details.projectName,
        });
      } else {
        const response = await fetch("/api/expenses/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: notification.details.amount,
            projectName: notification.details.projectName,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to confirm expense");
        }
      }

      showToast("ההוצאה אושרה");
      onAction({
        label: t("workspaceWidgets.notificationCenter.close"),
        action: "dismiss",
        payload: { id: notification.id },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("workspaceWidgets.notificationCenter.confirmFailed");
      showToast(msg);
    } finally {
      setPendingNotificationId(null);
    }
  };

  if (!isOpen) {
    return toast ? (
      <div className="fixed left-1/2 top-6 z-[10000] -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-100 shadow-2xl backdrop-blur-2xl">
        {toast}
      </div>
    ) : null;
  }

  return (
    <>
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t("workspaceWidgets.notificationCenter.panelAria")}
        className="fixed z-[1100] flex max-h-[min(70vh,28rem)] flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--glass-bg)] text-[color:var(--foreground-main)] shadow-2xl backdrop-blur-2xl"
        style={{ top: position.top, left: position.left, width: position.width }}
        dir={dir}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border-main)]/30 px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-[color:var(--foreground-main)]">
              {t("workspaceWidgets.notificationCenter.title")}
            </span>
            <span className="text-xs text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.notificationCenter.activeCount", { count: String(notifications.length) })}
            </span>
          </span>
          <div className="flex items-center gap-1">
            {notifications.length > 0 && onClearAll ? (
              <button
                type="button"
                onClick={() => void onClearAll()}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-rose-600"
                title={t("workspaceWidgets.notificationCenter.clearAllTitle")}
              >
                <Trash2 size={12} aria-hidden />
                {t("workspaceWidgets.notificationCenter.clearAll")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)]"
              aria-label={t("workspaceWidgets.notificationCenter.closeAria")}
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-3 overflow-auto p-3">
          {notifications.length === 0 && (
            <div className="rounded-xl border border-[color:var(--border-main)]/30 bg-[color:var(--background-main)]/30 p-4 text-sm text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.notificationCenter.empty")}
            </div>
          )}

          {notifications.map((notification) => {
            const messageText = notification.text || notification.message || notification.description || "";
            const isAiDetected = notification.type === "ai-detected";
            const severity = notification.severity || notification.type || "info";

            return (
              <article
                key={notification.id}
                role="button"
                tabIndex={0}
                onClick={() => onNotificationClick?.(notification)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNotificationClick?.(notification);
                  }
                }}
                className={`cursor-pointer rounded-2xl border p-4 shadow-lg backdrop-blur-xl transition hover:brightness-105 ${
                  isAiDetected
                    ? "border-purple-500/30 bg-purple-500/10 text-purple-100"
                    : severityStyles[severity as keyof typeof severityStyles] || severityStyles.info
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full shadow-[0_0_12px_currentColor] ${
                          isAiDetected ? "animate-pulse bg-purple-500" : "bg-blue-500"
                        }`}
                      />
                      <h3 className="text-sm font-semibold text-[color:var(--foreground-main)]">{notification.title}</h3>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[color:var(--foreground-muted)]">{messageText}</p>
                  </div>
                </div>

                {isAiDetected && notification.details ? (
                  <div
                    className="mt-3 flex justify-end gap-2 border-t border-[color:var(--border-main)]/20 pt-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onNotificationClick?.({
                          ...notification,
                          linkType: "aiScanner",
                        })
                      }
                      className="rounded-lg bg-[color:var(--foreground-muted)]/20 px-3 py-1.5 text-xs text-[color:var(--foreground-main)] transition-colors hover:bg-[color:var(--foreground-muted)]/30"
                    >
                      {t("workspaceWidgets.notificationCenter.details")}
                    </button>
                    <button
                      type="button"
                      disabled={pendingNotificationId === notification.id}
                      onClick={() => void handleConfirmExpense(notification)}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:cursor-wait disabled:opacity-60"
                    >
                      {pendingNotificationId === notification.id
                        ? t("workspaceWidgets.notificationCenter.confirming")
                        : t("workspaceWidgets.notificationCenter.approveExpense")}
                    </button>
                  </div>
                ) : null}

                {notification.actions && notification.actions.length > 0 && !isAiDetected ? (
                  <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {notification.actions.map((action) => {
                      const isPending =
                        pendingNotificationId === notification.id && action.action === "confirmExpense";

                      return (
                        <button
                          key={`${notification.id}-${action.label}`}
                          type="button"
                          disabled={isPending}
                          onClick={() => void onAction(action)}
                          className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--foreground-muted)]/10 px-3 py-1.5 text-xs font-medium text-[color:var(--foreground-main)] transition-colors hover:bg-[color:var(--foreground-muted)]/20 disabled:cursor-wait disabled:opacity-60"
                        >
                          {isPending ? t("workspaceWidgets.notificationCenter.saving") : action.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      {toast && (
        <div className="fixed left-1/2 top-6 z-[10000] -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-100 shadow-2xl backdrop-blur-2xl">
          {toast}
        </div>
      )}
    </>
  );
}
