"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, Settings2, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  dispatchConsentUpdated,
  type CookieConsentState,
  parseStoredConsent,
} from "@/lib/cookie-consent";

function writeConsent(state: CookieConsentState) {
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(state));
  dispatchConsentUpdated(state);
}

export default function CookieConsentBanner() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = parseStoredConsent(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
    if (!stored) {
      setVisible(true);
      return;
    }
    setAnalytics(stored.analytics);
    setMarketing(stored.marketing);
  }, []);

  const persist = useCallback((analyticsOn: boolean, marketingOn: boolean) => {
    const state: CookieConsentState = {
      version: 1,
      necessary: true,
      analytics: analyticsOn,
      marketing: marketingOn,
      updatedAt: new Date().toISOString(),
    };
    writeConsent(state);
    setVisible(false);
    setCustomize(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      className="fixed inset-x-0 bottom-0 z-[99990] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 p-4 shadow-2xl backdrop-blur-xl sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cookie className="text-indigo-500" size={22} aria-hidden />
            <h2 id="cookie-banner-title" className="text-sm font-black text-[color:var(--foreground-main)] sm:text-base">
              {t("cookie.wallTitle")}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10"
            aria-label={t("cookie.ariaClose")}
            onClick={() => setVisible(false)}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-[color:var(--foreground-muted)] sm:text-sm">{t("cookie.wallBody")}</p>
        <div className="mb-4 flex flex-wrap gap-3 text-xs font-bold">
          <Link href="/privacy" className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
            {t("cookie.privacy")}
          </Link>
          <Link href="/legal" className="text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
            {t("cookie.cookiesPolicy")}
          </Link>
        </div>
        {customize ? (
          <div className="mb-4 space-y-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-3">
            <label className="flex items-center justify-between gap-3 text-xs">
              <span>
                <span className="font-black text-[color:var(--foreground-main)]">{t("cookie.necessary")}</span>
                <span className="mt-0.5 block text-[color:var(--foreground-muted)]">{t("cookie.necessaryNote")}</span>
              </span>
              <input type="checkbox" checked disabled className="h-4 w-4" />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-[color:var(--foreground-main)]">{t("cookie.analytics")}</span>
              <input type="checkbox" className="h-4 w-4" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-[color:var(--foreground-main)]">{t("cookie.marketing")}</span>
              <input type="checkbox" className="h-4 w-4" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            </label>
          </div>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => (customize ? setCustomize(false) : setCustomize(true))}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2.5 text-xs font-black text-[color:var(--foreground-main)]"
          >
            <Settings2 size={16} aria-hidden />
            {customize ? t("cookie.customizeClose") : t("cookie.customize")}
          </button>
          <button
            type="button"
            onClick={() => persist(false, false)}
            className="rounded-xl border border-[color:var(--border-main)] px-4 py-2.5 text-xs font-black text-[color:var(--foreground-main)]"
            aria-label={t("cookie.ariaReject")}
          >
            {t("cookie.essentialOnly")}
          </button>
          {customize ? (
            <button
              type="button"
              onClick={() => persist(analytics, marketing)}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white"
            >
              {t("cookie.savePrefs")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => persist(true, true)}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white"
            >
              {t("cookie.acceptAll")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
