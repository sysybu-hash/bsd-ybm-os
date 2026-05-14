import React, { useState } from 'react';

export interface OSNotificationAction {
  label: string;
  action: 'whatsapp' | 'viewProject' | 'confirmExpense' | 'dismiss';
  payload?: Record<string, string>;
}

export interface OSNotification {
  id: string;
  title: string;
  message?: string;
  text?: string;
  description?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
  type?: 'ai-detected' | 'info' | 'warning' | 'critical' | 'success';
  createdAt: string;
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
  confirmExpense?: (details: { amount: number; project: string }) => Promise<void>;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
}

const severityStyles = {
  info: 'border-blue-300/20 bg-blue-400/10 text-blue-700 dark:text-blue-100',
  warning: 'border-amber-300/20 bg-amber-400/10 text-amber-700 dark:text-amber-100',
  critical: 'border-rose-300/20 bg-rose-400/10 text-rose-700 dark:text-rose-100',
  success: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100',
};

export default function NotificationCenter({ 
  notifications, 
  onAction, 
  confirmExpense,
  isCollapsed,
  setIsCollapsed
}: NotificationCenterProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const handleConfirmExpense = async (notification: OSNotification) => {
    if (!notification.details?.amount || !notification.details?.projectName) {
      showToast('Missing expense details');
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
        const response = await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'confirm-expense',
            amount: notification.details.amount,
            projectName: notification.details.projectName,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to confirm expense');
        }
      }

      showToast('Expense confirmed successfully');
      onAction({
        label: 'Dismiss',
        action: 'dismiss',
        payload: { id: notification.id },
      });
    } catch (err: any) {
      showToast(err?.message || 'Could not confirm expense');
    } finally {
      setPendingNotificationId(null);
    }
  };

  return (
    <>
      <aside
        className={`absolute right-4 md:right-6 top-20 md:top-24 z-40 flex max-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--glass-bg)] text-[color:var(--foreground-main)] shadow-2xl backdrop-blur-2xl transition-all duration-300 ${
          isCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-[calc(100vw-2rem)] md:w-80 opacity-100'
        }`}
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border-main)]/30 px-4 py-3 text-right">
          <span>
            <span className="block text-sm font-semibold text-[color:var(--foreground-main)]">Command Center</span>
            <span className="text-xs text-[color:var(--foreground-muted)]">{notifications.length} התראות פעילות</span>
          </span>
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg transition-colors"
          >
            <span className="text-lg text-[color:var(--foreground-muted)]">›</span>
          </button>
        </div>

        <div className="space-y-3 overflow-auto p-3">
            {notifications.length === 0 && (
              <div className="rounded-xl border border-[color:var(--border-main)]/30 bg-[color:var(--background-main)]/30 p-4 text-sm text-[color:var(--foreground-muted)]">
                אין אירועים קריטיים כרגע.
              </div>
            )}

            {notifications.map((notification) => {
              const messageText = notification.text || notification.message || notification.description || '';
              const isAiDetected = notification.type === 'ai-detected';
              const severity = notification.severity || notification.type || 'info';

              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-xl backdrop-blur-xl ${
                    isAiDetected
                      ? 'border-purple-500/30 bg-purple-500/10 text-purple-100'
                      : severityStyles[severity as keyof typeof severityStyles] || severityStyles.info
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full shadow-[0_0_12px_currentColor] ${
                            isAiDetected ? 'animate-pulse bg-purple-500' : 'bg-blue-500'
                          }`}
                        />
                        <h3 className="text-sm font-semibold text-[color:var(--foreground-main)]">{notification.title}</h3>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--foreground-muted)]">{messageText}</p>
                    </div>
                  </div>

                  {isAiDetected && notification.details ? (
                    <div className="mt-3 flex justify-end gap-2 border-t border-[color:var(--border-main)]/20 pt-3">
                      <button
                        type="button"
                        className="rounded-lg bg-[color:var(--foreground-muted)]/20 px-3 py-1.5 text-xs text-[color:var(--foreground-main)] transition-colors hover:bg-[color:var(--foreground-muted)]/30"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        disabled={pendingNotificationId === notification.id}
                        onClick={() => void handleConfirmExpense(notification)}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:cursor-wait disabled:opacity-60"
                      >
                        {pendingNotificationId === notification.id ? 'Confirming...' : 'Confirm Expense'}
                      </button>
                    </div>
                  ) : null}

                  {notification.actions && notification.actions.length > 0 && !isAiDetected && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {notification.actions.map((action) => {
                        const isPending = pendingNotificationId === notification.id && action.action === 'confirmExpense';

                        return (
                          <button
                            key={`${notification.id}-${action.label}`}
                            type="button"
                            disabled={isPending}
                            onClick={() => void onAction(action)}
                            className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--foreground-muted)]/10 px-3 py-1.5 text-xs font-medium text-[color:var(--foreground-main)] transition-colors hover:bg-[color:var(--foreground-muted)]/20 disabled:cursor-wait disabled:opacity-60"
                          >
                            {isPending ? 'Saving...' : action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
      </aside>

      {toast && (
        <div className="fixed left-1/2 top-6 z-[10000] -translate-x-1/2 rounded-2xl border border-emerald-300/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-100 shadow-2xl backdrop-blur-2xl">
          {toast}
        </div>
      )}
    </>
  );
}
