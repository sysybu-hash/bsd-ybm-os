"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Mail, Save } from "lucide-react";
import { toast } from "sonner";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
import type { OrgMailPrefs } from "@/lib/mail/org-mail-prefs-shared";
import { DEFAULT_ORG_MAIL_PREFS } from "@/lib/mail/org-mail-prefs-shared";

type SettingsMailSectionProps = {
  t: (key: string, vars?: Record<string, string>) => string;
  canManage: boolean;
};

const CHANNELS: Array<{
  key: keyof Omit<OrgMailPrefs, "masterEnabled" | "respectJewishRestDays">;
  labelKey: string;
  hintKey: string;
}> = [
  { key: "digestEnabled", labelKey: "digest", hintKey: "digestHint" },
  { key: "lifecycleEnabled", labelKey: "lifecycle", hintKey: "lifecycleHint" },
  { key: "notificationBridgeEnabled", labelKey: "notifications", hintKey: "notificationsHint" },
  { key: "collectionRemindersEnabled", labelKey: "collection", hintKey: "collectionHint" },
];

export function SettingsMailSection({ t, canManage }: SettingsMailSectionProps) {
  const S = "workspaceWidgets.settings.mail";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<OrgMailPrefs>({ ...DEFAULT_ORG_MAIL_PREFS });

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/org/mail-prefs", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { prefs?: OrgMailPrefs };
      if (data.prefs) setPrefs({ ...DEFAULT_ORG_MAIL_PREFS, ...data.prefs });
    } catch {
      toast.error(t(`${S}.loadFailed`));
    } finally {
      setLoading(false);
    }
  }, [canManage, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/org/mail-prefs", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { prefs?: OrgMailPrefs };
      if (data.prefs) setPrefs({ ...DEFAULT_ORG_MAIL_PREFS, ...data.prefs });
      toast.success(t(`${S}.saved`));
    } catch {
      toast.error(t(`${S}.saveFailed`));
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;

  if (loading) {
    return (
      <section className="border-t border-[color:var(--border-main)]/30 pt-6">
        <WidgetState variant="loading" />
      </section>
    );
  }

  const masterOn = prefs.masterEnabled;

  return (
    <section className="border-t border-[color:var(--border-main)]/30 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Mail size={18} className="text-sky-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.sectionTitle`)}
        </h3>
      </div>

      <p className="mb-4 max-w-xl text-xs leading-relaxed text-[color:var(--foreground-muted)]">
        {t(`${S}.intro`)}
      </p>

      <label className="mb-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/40 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-[color:var(--foreground-main)]">{t(`${S}.master`)}</p>
          <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${S}.masterHint`)}</p>
        </div>
        <input
          type="checkbox"
          className="h-5 w-5 accent-sky-600"
          checked={masterOn}
          onChange={(e) => setPrefs((p) => ({ ...p, masterEnabled: e.target.checked }))}
        />
      </label>

      <label
        className={`mb-5 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-[color:var(--border-main)] px-4 py-3 ${
          masterOn ? "" : "pointer-events-none opacity-50"
        }`}
      >
        <div>
          <p className="text-sm font-bold text-[color:var(--foreground-main)]">
            {t(`${S}.respectRestDays`)}
          </p>
          <p className="text-xs text-[color:var(--foreground-muted)]">
            {t(`${S}.respectRestDaysHint`)}
          </p>
        </div>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-sky-600"
          checked={prefs.respectJewishRestDays !== false}
          disabled={!masterOn}
          onChange={(e) => setPrefs((p) => ({ ...p, respectJewishRestDays: e.target.checked }))}
        />
      </label>

      <div className={`space-y-3 ${masterOn ? "" : "pointer-events-none opacity-50"}`}>
        {CHANNELS.map((ch) => (
          <label
            key={ch.key}
            className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[color:var(--border-main)]/60 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-[color:var(--foreground-main)]">
                {t(`${S}.channels.${ch.labelKey}`)}
              </p>
              <p className="text-xs text-[color:var(--foreground-muted)]">
                {t(`${S}.channels.${ch.hintKey}`)}
              </p>
            </div>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-sky-600"
              checked={prefs[ch.key]}
              disabled={!masterOn}
              onChange={(e) => setPrefs((p) => ({ ...p, [ch.key]: e.target.checked }))}
            />
          </label>
        ))}
      </div>

      <OsButton
        variant="primary"
        className="mt-5"
        loading={saving}
        icon={<Save size={16} aria-hidden />}
        onClick={() => void handleSave()}
      >
        {t(`${S}.save`)}
      </OsButton>
    </section>
  );
}
