"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PlatformMailConfig } from "@/lib/platform-settings";

type MailAdvancedPanelProps = {
  mail: PlatformMailConfig;
  patchMail: (patch: Partial<PlatformMailConfig>) => void;
  sendingOn: boolean;
  actionBusy: string | null;
  actionMsg: string | null;
  onRunAction: (action: "flush_digest" | "run_lifecycle") => void;
  /** Scoped translator receiving a key under `platformAdmin.mail`. */
  t: (suffix: string) => string;
};

const NUM_FIELD =
  "mt-1 w-full rounded-lg border border-[color:var(--border-main)] p-2 text-sm font-normal";

export function MailAdvancedPanel({
  mail,
  patchMail,
  sendingOn,
  actionBusy,
  actionMsg,
  onRunAction,
  t,
}: MailAdvancedPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[color:var(--border-main)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-3 text-sm font-bold"
      >
        {t("advanced")}
        <ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[color:var(--border-main)] p-3">
          <label className="block text-xs font-bold">
            {t("fromOverride")}
            <input
              type="text"
              value={mail.fromOverride}
              onChange={(e) => patchMail({ fromOverride: e.target.value })}
              placeholder={t("fromPlaceholder")}
              className={NUM_FIELD}
            />
          </label>
          <label className="block text-xs font-bold">
            {t("replyOverride")}
            <input
              type="email"
              value={mail.replyToOverride}
              onChange={(e) => patchMail({ replyToOverride: e.target.value })}
              placeholder="yb@bsd-ybm.co.il"
              className={NUM_FIELD}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold">
              {t("trialDays")}
              <input
                type="number"
                min={1}
                max={30}
                value={mail.lifecycleTrialDaysBefore}
                onChange={(e) =>
                  patchMail({ lifecycleTrialDaysBefore: Number(e.target.value) || 3 })
                }
                className={NUM_FIELD}
              />
            </label>
            <label className="text-xs font-bold">
              {t("inactiveDays")}
              <input
                type="number"
                min={3}
                max={90}
                value={mail.lifecycleInactiveDays}
                onChange={(e) => patchMail({ lifecycleInactiveDays: Number(e.target.value) || 7 })}
                className={NUM_FIELD}
              />
            </label>
          </div>

          <p className="text-[11px] text-[color:var(--foreground-muted)]">{t("advancedHint")}</p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!actionBusy || !sendingOn || !mail.digestEnabled}
              onClick={() => onRunAction("flush_digest")}
              className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              {actionBusy === "flush_digest" ? "…" : t("runDigestNow")}
            </button>
            <button
              type="button"
              disabled={!!actionBusy || !sendingOn || !mail.lifecycleEnabled}
              onClick={() => onRunAction("run_lifecycle")}
              className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              {actionBusy === "run_lifecycle" ? "…" : t("runLifecycleNow")}
            </button>
          </div>

          {actionMsg ? (
            <p className="rounded-lg bg-[color:var(--surface-soft)] p-2 text-xs">{actionMsg}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
