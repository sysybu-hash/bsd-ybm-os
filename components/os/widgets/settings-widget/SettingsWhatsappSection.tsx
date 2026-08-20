"use client";

import React, { useState } from "react";
import { MessageCircle, Copy, Check } from "lucide-react";
import { OsButton } from "@/components/os/ui";

type SettingsWhatsappSectionProps = {
  t: (key: string) => string;
};

const S = "workspaceWidgets.settings.whatsapp";

/**
 * כרטיס חיבור WhatsApp — מפיק קוד חד-פעמי (POST /api/whatsapp/link-code)
 * ומציג הוראות: המשתמש שולח את הקוד למספר העסקי כדי לקשר את הטלפון לארגון.
 * גישה: מנהל ארגון בלבד (נשלט מהרכיב העוטף).
 */
export function SettingsWhatsappSection({ t }: SettingsWhatsappSectionProps) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/link-code", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!res.ok || !data.code) {
        throw new Error(data.error ?? t(`${S}.error`));
      }
      setCode(data.code);
      setExpiresAt(data.expiresAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(`${S}.error`));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <section className="pt-6 border-t border-[color:var(--border-main)]/30">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={18} className="text-emerald-500" />
        <h3 className="text-sm font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {t(`${S}.title`)}
        </h3>
      </div>
      <p className="text-xs text-[color:var(--foreground-muted)] mb-4 leading-relaxed max-w-xl">
        {t(`${S}.intro`)}
      </p>

      {code ? (
        <div className="max-w-xl rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-mono text-3xl font-black tracking-[0.3em] text-[color:var(--foreground-main)]">
              {code}
            </span>
            <OsButton
              variant="secondary"
              size="sm"
              icon={copied ? <Check size={14} className="text-emerald-500" aria-hidden /> : <Copy size={14} aria-hidden />}
              onClick={() => void copyCode()}
            >
              {t(`${S}.copy`)}
            </OsButton>
          </div>
          <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed text-[color:var(--foreground-muted)]">
            <li>{t(`${S}.step1`)}</li>
            <li>{t(`${S}.step2`)}</li>
            <li>{t(`${S}.step3`)}</li>
          </ol>
          {expiryLabel ? (
            <p className="mt-3 text-[11px] text-[color:var(--foreground-muted)]">
              {t(`${S}.expiresAt`).replace("{time}", expiryLabel)}
            </p>
          ) : null}
          <OsButton
            variant="quiet"
            size="sm"
            className="mt-3 text-emerald-600 dark:text-emerald-400"
            loading={loading}
            onClick={() => void generate()}
          >
            {t(`${S}.regenerate`)}
          </OsButton>
        </div>
      ) : (
        <OsButton
          variant="primary"
          loading={loading}
          icon={<MessageCircle size={18} aria-hidden />}
          onClick={() => void generate()}
        >
          {t(`${S}.generate`)}
        </OsButton>
      )}

      {error ? <p className="mt-3 text-xs font-semibold text-rose-500">{error}</p> : null}
    </section>
  );
}
