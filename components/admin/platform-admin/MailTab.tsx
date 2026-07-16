"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, RefreshCw, Save, Send } from "lucide-react";
import type { PlatformConfig, PlatformMailConfig } from "@/lib/platform-settings";

type MailStatus = {
  transportConfigured: boolean;
  transportLabel: string;
  envFrom: string;
  envReplyTo: string | null;
  effectiveFrom: string;
  effectiveReplyTo: string | null;
  crons: Record<string, string>;
  note: string;
};

type MailTabProps = {
  platformConfig: PlatformConfig;
  setPlatformConfig: (v: PlatformConfig) => void;
  savingSettings: boolean;
  onSave: () => void;
  testingEmail: boolean;
  onTestEmail: () => void;
};

function patchMail(
  cfg: PlatformConfig,
  patch: Partial<PlatformMailConfig>,
): PlatformConfig {
  return { ...cfg, mail: { ...cfg.mail, ...patch } };
}

export function MailTab({
  platformConfig,
  setPlatformConfig,
  savingSettings,
  onSave,
  testingEmail,
  onTestEmail,
}: MailTabProps) {
  const mail = platformConfig.mail;
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/admin/mail/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      });
      const data = (await res.json()) as MailStatus & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      setStatus(data);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "טעינת סטטוס נכשלה");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runAction = async (action: "flush_digest" | "run_lifecycle") => {
    setActionBusy(action);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/mail/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? "הפעולה נכשלה");
      setActionMsg(
        action === "flush_digest"
          ? `דיג׳סט נשלח: ${JSON.stringify(data.result)}`
          : `Lifecycle: ${JSON.stringify(data.result)}`,
      );
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setActionBusy(null);
    }
  };

  const channelToggles: Array<{
    key: keyof PlatformMailConfig;
    label: string;
    hint: string;
  }> = [
    {
      key: "masterEnabled",
      label: "שליחת מייל פעילה (מתג ראשי)",
      hint: "כיבוי עוצר את כל הערוצים מיד",
    },
    {
      key: "transactionalEnabled",
      label: "מיילים טרנזקציונליים",
      hint: "אימות, הזמנות, הקמת משתמש, מייל בדיקה",
    },
    {
      key: "digestEnabled",
      label: "דיג׳סט יומי",
      hint: "Cron 09:00 UTC — /api/cron/email-digest",
    },
    {
      key: "lifecycleEnabled",
      label: "מיילים מחזור חיים (שיווק)",
      hint: "סיום ניסיון + החזרת משתמשים לא פעילים — Cron 10:00 UTC",
    },
    {
      key: "notificationBridgeEnabled",
      label: "התראות אפליקציה → תור מייל",
      hint: "משימות באיחור, חשבוניות שנסרקו וכו׳",
    },
    {
      key: "collectionRemindersEnabled",
      label: "תזכורות גבייה במייל",
      hint: "שליחת PDF ללקוח + cron שבועי",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black">
            <Mail size={18} /> מייל — שליחה והגדרות
          </h2>
          <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
            שליטה בערוצי שליחה. מפתחות Resend/SMTP נשארים ב-Vercel (לא נשמרים כאן).
            אין קבלת מייל נכנסת (IMAP) — רק שליחה והסרה מרשימה.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold"
        >
          {statusLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          סטטוס תעבורה
        </button>
      </div>

      {status ? (
        <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3 text-xs space-y-1">
          <p>
            <strong>תעבורה:</strong>{" "}
            {status.transportConfigured ? status.transportLabel : "לא מוגדר — אין שליחה"}
          </p>
          <p>
            <strong>From אפקטיבי:</strong> {status.effectiveFrom}
          </p>
          <p>
            <strong>Reply-To:</strong> {status.effectiveReplyTo ?? "—"}
          </p>
          <p className="text-[color:var(--foreground-muted)]">{status.note}</p>
          <ul className="mt-2 list-inside list-disc text-[color:var(--foreground-muted)]">
            {Object.entries(status.crons).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3">
        {channelToggles.map((row) => (
          <label key={row.key} className="flex flex-col gap-0.5 text-sm">
            <span className="flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                checked={Boolean(mail[row.key])}
                disabled={row.key !== "masterEnabled" && !mail.masterEnabled}
                onChange={(e) =>
                  setPlatformConfig(
                    patchMail(platformConfig, { [row.key]: e.target.checked } as Partial<PlatformMailConfig>),
                  )
                }
              />
              {row.label}
            </span>
            <span className="pe-6 text-[11px] text-[color:var(--foreground-muted)]">{row.hint}</span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">
          From (דריסה — ריק = env)
          <input
            type="text"
            value={mail.fromOverride}
            onChange={(e) =>
              setPlatformConfig(patchMail(platformConfig, { fromOverride: e.target.value }))
            }
            placeholder="yb@bsd-ybm.co.il או BSD-YBM <yb@…>"
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-bold">
          Reply-To (דריסה — ריק = env)
          <input
            type="email"
            value={mail.replyToOverride}
            onChange={(e) =>
              setPlatformConfig(patchMail(platformConfig, { replyToOverride: e.target.value }))
            }
            placeholder="yb@bsd-ybm.co.il"
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-bold">
          ימים לפני סיום ניסיון (lifecycle)
          <input
            type="number"
            min={1}
            max={30}
            value={mail.lifecycleTrialDaysBefore}
            onChange={(e) =>
              setPlatformConfig(
                patchMail(platformConfig, {
                  lifecycleTrialDaysBefore: Number(e.target.value) || 3,
                }),
              )
            }
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm font-normal"
          />
        </label>
        <label className="text-xs font-bold">
          ימי חוסר פעילות להחזרה
          <input
            type="number"
            min={3}
            max={90}
            value={mail.lifecycleInactiveDays}
            onChange={(e) =>
              setPlatformConfig(
                patchMail(platformConfig, {
                  lifecycleInactiveDays: Number(e.target.value) || 7,
                }),
              )
            }
            className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm font-normal"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={savingSettings}
          onClick={onSave}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          שמור הגדרות מייל
        </button>
        <button
          type="button"
          disabled={testingEmail}
          onClick={onTestEmail}
          className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {testingEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          שלח מייל בדיקה
        </button>
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={() => void runAction("flush_digest")}
          className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {actionBusy === "flush_digest" ? "…" : "הפעל דיג׳סט עכשיו"}
        </button>
        <button
          type="button"
          disabled={!!actionBusy}
          onClick={() => void runAction("run_lifecycle")}
          className="rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {actionBusy === "run_lifecycle" ? "…" : "הפעל lifecycle עכשיו"}
        </button>
      </div>

      {actionMsg ? (
        <p className="rounded-lg border border-[color:var(--border-main)] p-2 text-xs font-mono">
          {actionMsg}
        </p>
      ) : null}
    </div>
  );
}
