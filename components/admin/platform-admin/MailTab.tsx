"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Mail, Save, Send } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { PlatformConfig, PlatformMailConfig } from "@/lib/platform-settings";

type MailStatus = {
  transportConfigured: boolean;
  transportLabel: string;
  effectiveFrom: string;
};

type MailTabProps = {
  platformConfig: PlatformConfig;
  setPlatformConfig: (v: PlatformConfig) => void;
  savingSettings: boolean;
  onSave: () => void;
  testingEmail: boolean;
  onTestEmail: () => void;
};

function patchMail(cfg: PlatformConfig, patch: Partial<PlatformMailConfig>): PlatformConfig {
  return { ...cfg, mail: { ...cfg.mail, ...patch } };
}

const CHANNELS: Array<{
  key: keyof Pick<
    PlatformMailConfig,
    | "transactionalEnabled"
    | "digestEnabled"
    | "lifecycleEnabled"
    | "notificationBridgeEnabled"
    | "collectionRemindersEnabled"
  >;
  labelKey: string;
  hintKey: string;
}> = [
  {
    key: "transactionalEnabled",
    labelKey: "platformAdmin.mail.channels.transactional",
    hintKey: "platformAdmin.mail.channels.transactionalHint",
  },
  {
    key: "digestEnabled",
    labelKey: "platformAdmin.mail.channels.digest",
    hintKey: "platformAdmin.mail.channels.digestHint",
  },
  {
    key: "lifecycleEnabled",
    labelKey: "platformAdmin.mail.channels.lifecycle",
    hintKey: "platformAdmin.mail.channels.lifecycleHint",
  },
  {
    key: "notificationBridgeEnabled",
    labelKey: "platformAdmin.mail.channels.notifications",
    hintKey: "platformAdmin.mail.channels.notificationsHint",
  },
  {
    key: "collectionRemindersEnabled",
    labelKey: "platformAdmin.mail.channels.collection",
    hintKey: "platformAdmin.mail.channels.collectionHint",
  },
];

export function MailTab({
  platformConfig,
  setPlatformConfig,
  savingSettings,
  onSave,
  testingEmail,
  onTestEmail,
}: MailTabProps) {
  const { t } = useI18n();
  const mail = platformConfig.mail;
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mail/actions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      });
      const data = (await res.json()) as MailStatus & { error?: string };
      if (res.ok) setStatus(data);
    } catch {
      /* non-blocking */
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
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? t("platformAdmin.mail.actionFailed"));
      setActionMsg(
        action === "flush_digest"
          ? t("platformAdmin.mail.digestRan")
          : t("platformAdmin.mail.lifecycleRan"),
      );
      void loadStatus();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : t("platformAdmin.mail.actionFailed"));
    } finally {
      setActionBusy(null);
    }
  };

  const sendingOn = mail.masterEnabled;
  const transportOk = status?.transportConfigured ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-5" dir="auto">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Mail size={20} aria-hidden />
          {t("platformAdmin.mail.title")}
        </h2>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
          {t("platformAdmin.mail.subtitle")}
        </p>
      </div>

      {/* Master switch */}
      <div
        className={`rounded-2xl border p-4 ${
          sendingOn
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-rose-500/40 bg-rose-500/10"
        }`}
      >
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <div>
            <p className="text-base font-black">
              {sendingOn ? t("platformAdmin.mail.masterOn") : t("platformAdmin.mail.masterOff")}
            </p>
            <p className="mt-0.5 text-xs text-[color:var(--foreground-muted)]">
              {sendingOn ? t("platformAdmin.mail.masterOnHint") : t("platformAdmin.mail.masterOffHint")}
            </p>
          </div>
          <input
            type="checkbox"
            className="h-6 w-6 accent-emerald-600"
            checked={sendingOn}
            onChange={(e) =>
              setPlatformConfig(patchMail(platformConfig, { masterEnabled: e.target.checked }))
            }
          />
        </label>
        {transportOk === false ? (
          <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">
            {t("platformAdmin.mail.transportMissing")}
          </p>
        ) : transportOk ? (
          <p className="mt-3 text-xs text-[color:var(--foreground-muted)]">
            {t("platformAdmin.mail.transportOk", {
              transport: status?.transportLabel ?? "",
              from: status?.effectiveFrom ?? "",
            })}
          </p>
        ) : null}
      </div>

      {/* Jewish rest days */}
      <label
        className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl border border-[color:var(--border-main)] px-4 py-3 ${
          sendingOn ? "" : "pointer-events-none opacity-45"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-bold">{t("platformAdmin.mail.respectRestDays")}</p>
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {t("platformAdmin.mail.respectRestDaysHint")}
          </p>
        </div>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
          checked={mail.respectJewishRestDays !== false}
          disabled={!sendingOn}
          onChange={(e) =>
            setPlatformConfig(patchMail(platformConfig, { respectJewishRestDays: e.target.checked }))
          }
        />
      </label>

      {/* Simple channels */}
      <div className={`space-y-3 ${sendingOn ? "" : "pointer-events-none opacity-45"}`}>
        <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--foreground-muted)]">
          {t("platformAdmin.mail.whatToSend")}
        </p>
        {CHANNELS.map((row) => (
          <label
            key={row.key}
            className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[color:var(--border-main)] px-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold">{t(row.labelKey)}</p>
              <p className="text-xs text-[color:var(--foreground-muted)]">{t(row.hintKey)}</p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
              checked={Boolean(mail[row.key])}
              disabled={!sendingOn}
              onChange={(e) =>
                setPlatformConfig(
                  patchMail(platformConfig, {
                    [row.key]: e.target.checked,
                  } as Partial<PlatformMailConfig>),
                )
              }
            />
          </label>
        ))}
      </div>

      {/* Primary actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={savingSettings}
          onClick={onSave}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:flex-none"
        >
          {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {t("platformAdmin.mail.save")}
        </button>
        <button
          type="button"
          disabled={testingEmail || !sendingOn}
          onClick={onTestEmail}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-3 text-sm font-bold disabled:opacity-50 sm:flex-none"
        >
          {testingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {t("platformAdmin.mail.sendTest")}
        </button>
      </div>

      {/* Advanced — collapsed */}
      <div className="rounded-xl border border-[color:var(--border-main)]">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-3 text-sm font-bold"
        >
          {t("platformAdmin.mail.advanced")}
          <ChevronDown
            size={16}
            className={`transition ${showAdvanced ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {showAdvanced ? (
          <div className="space-y-3 border-t border-[color:var(--border-main)] p-3">
            <label className="block text-xs font-bold">
              {t("platformAdmin.mail.fromOverride")}
              <input
                type="text"
                value={mail.fromOverride}
                onChange={(e) =>
                  setPlatformConfig(patchMail(platformConfig, { fromOverride: e.target.value }))
                }
                placeholder={t("platformAdmin.mail.fromPlaceholder")}
                className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm font-normal"
              />
            </label>
            <label className="block text-xs font-bold">
              {t("platformAdmin.mail.replyOverride")}
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
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold">
                {t("platformAdmin.mail.trialDays")}
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
                {t("platformAdmin.mail.inactiveDays")}
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
            <p className="text-[11px] text-[color:var(--foreground-muted)]">
              {t("platformAdmin.mail.advancedHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!actionBusy || !sendingOn || !mail.digestEnabled}
                onClick={() => void runAction("flush_digest")}
                className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                {actionBusy === "flush_digest" ? "…" : t("platformAdmin.mail.runDigestNow")}
              </button>
              <button
                type="button"
                disabled={!!actionBusy || !sendingOn || !mail.lifecycleEnabled}
                onClick={() => void runAction("run_lifecycle")}
                className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold disabled:opacity-50"
              >
                {actionBusy === "run_lifecycle" ? "…" : t("platformAdmin.mail.runLifecycleNow")}
              </button>
            </div>
            {actionMsg ? (
              <p className="rounded-lg bg-[color:var(--surface-soft)] p-2 text-xs">{actionMsg}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
