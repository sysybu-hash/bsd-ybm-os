"use client";

import React, { useState } from "react";
import { MessageCircle, Loader2, Copy, Check } from "lucide-react";

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
            <button
              type="button"
              onClick={() => void copyCode()}
              className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-main)] hover:border-emerald-500/40"
            >
              {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {t(`${S}.copy`)}
            </button>
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
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="mt-3 text-xs font-bold text-emerald-600 hover:underline disabled:opacity-60 dark:text-emerald-400"
          >
            {t(`${S}.regenerate`)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-emerald-500 disabled:opacity-60"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
          {t(`${S}.generate`)}
        </button>
      )}

      {error ? <p className="mt-3 text-xs font-semibold text-rose-500">{error}</p> : null}
    </section>
  );
}
