"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { SELECTABLE_LOCALES, type AppLocale } from "@/lib/i18n/config";

const LOCALE_LABELS: Record<AppLocale, string> = {
  he: "עב",
  en: "EN",
  ru: "RU",
};

const LOCALE_NAMES: Record<AppLocale, { he: string; en: string; ru: string }> = {
  he: { he: "עברית", en: "Hebrew", ru: "Иврит" },
  en: { he: "אנגלית", en: "English", ru: "Английский" },
  ru: { he: "רוסית", en: "Russian", ru: "Русский" },
};

type LocaleSwitcherProps = {
  compact?: boolean;
  /** ללא מסגרת נפרדת — בתוך סרגל כלים מאוחד (OSHeader) */
  embedded?: boolean;
  className?: string;
};

export default function LocaleSwitcher({ compact = false, embedded = false, className = "" }: LocaleSwitcherProps) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = (SELECTABLE_LOCALES.includes(locale as AppLocale) ? locale : "he") as AppLocale;
  const aria =
    t("workspaceShell.header.localeAria") !== "workspaceShell.header.localeAria"
      ? t("workspaceShell.header.localeAria")
      : "שפת ממשק";

  const pickName = (loc: AppLocale) => {
    const names = LOCALE_NAMES[loc];
    if (current === "he") return names.he;
    if (current === "ru") return names.ru;
    return names.en;
  };

  const changeLocale = async (next: AppLocale) => {
    if (next === current || pending) return;
    setOpen(false);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
        credentials: "include",
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className={`flex items-center justify-center gap-1 font-bold transition disabled:opacity-60 ${
          embedded
            ? "h-9 min-w-9 rounded-lg px-2 text-[10px] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
            : `rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)] ${
                compact ? "min-h-9 min-w-9 px-2 text-[10px]" : "min-h-11 min-w-11 px-2.5 text-xs"
              }`
        }`}
        aria-label={aria}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Languages size={compact ? 14 : 16} aria-hidden />
        <span>{LOCALE_LABELS[current]}</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[1200] cursor-default bg-transparent"
            aria-label="סגור"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            aria-label={aria}
            onKeyDown={(e) => {
              const idx = SELECTABLE_LOCALES.indexOf(current);
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const next =
                  e.key === "ArrowDown"
                    ? SELECTABLE_LOCALES[(idx + 1) % SELECTABLE_LOCALES.length]
                    : SELECTABLE_LOCALES[(idx - 1 + SELECTABLE_LOCALES.length) % SELECTABLE_LOCALES.length];
                void changeLocale(next);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            className="absolute end-0 top-[calc(100%+6px)] z-[1210] min-w-[140px] overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] py-1 shadow-xl"
          >
            {SELECTABLE_LOCALES.map((loc) => (
              <li key={loc} role="option" aria-selected={loc === current}>
                <button
                  type="button"
                  onClick={() => void changeLocale(loc)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm font-bold transition hover:bg-[color:var(--surface-soft)] ${
                    loc === current ? "text-indigo-500" : "text-[color:var(--foreground-main)]"
                  }`}
                >
                  <span>{pickName(loc)}</span>
                  <span className="text-[10px] text-[color:var(--foreground-muted)]">{LOCALE_LABELS[loc]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
