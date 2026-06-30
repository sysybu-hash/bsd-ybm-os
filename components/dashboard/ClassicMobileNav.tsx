"use client";

import React, { useState } from "react";
import { Grid3x3 } from "lucide-react";
import {
  CLASSIC_MOBILE_PRIMARY,
  CLASSIC_MORE_SECTIONS,
  type ClassicSectionId,
} from "@/lib/classic/sections";

type Props = {
  activeTab: string;
  onSelect: (id: ClassicSectionId) => void;
  t: (key: string) => string;
};

/**
 * Mobile bottom-nav for the (single, responsive) classic dashboard shell.
 * Switches the shell's active tab — it does NOT navigate routes — so the classic
 * mode is one implementation on every device (sidebar on desktop, this on mobile).
 * Sections come from the shared registry; overflow lives behind a "more" sheet.
 */
export default function ClassicMobileNav({ activeTab, onSelect, t }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = CLASSIC_MORE_SECTIONS.some((s) => s.id === activeTab);

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-black/40 sm:hidden"
          onClick={() => setMoreOpen(false)}
          role="presentation"
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--border-main)]" />
            <div className="grid grid-cols-3 gap-3">
              {CLASSIC_MORE_SECTIONS.map(({ id, labelKey, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onSelect(id);
                    setMoreOpen(false);
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-[color:var(--border-main)] p-3 active:scale-95"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    <Icon size={20} aria-hidden />
                  </span>
                  <span className="text-center text-[11px] font-bold text-[color:var(--foreground-main)]">
                    {t(labelKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label={t("workspaceWidgets.mobileNav.aria")}
        className="fixed bottom-0 left-0 right-0 z-50 flex items-end justify-around border-t border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-1 pt-1 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {CLASSIC_MOBILE_PRIMARY.map(({ id, labelKey, icon: Icon, fab }) => {
          const active = activeTab === id;
          if (fab) {
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-label={t(labelKey)}
                className="flex flex-col items-center gap-1 pb-0.5"
              >
                <span
                  className={`-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[color:var(--background-main)] text-white shadow-lg transition active:scale-95 ${
                    active ? "bg-[color:var(--accent)]" : "bg-[color:var(--win-accent,#6366f1)]"
                  }`}
                >
                  <Icon size={24} strokeWidth={1.75} aria-hidden />
                </span>
                <span
                  className={`text-[9px] font-bold leading-tight ${
                    active ? "text-[color:var(--accent)]" : "text-[color:var(--foreground-muted)]"
                  }`}
                >
                  {t(labelKey)}
                </span>
              </button>
            );
          }
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition active:scale-95 ${
                active
                  ? "text-[color:var(--accent)]"
                  : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
              }`}
            >
              {active ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft)]">
                  <Icon size={18} strokeWidth={2} aria-hidden />
                </span>
              ) : (
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              )}
              <span className="text-[9px] font-bold leading-tight">{t(labelKey)}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition active:scale-95 ${
            moreActive
              ? "text-[color:var(--accent)]"
              : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
          }`}
        >
          {moreActive ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft)]">
              <Grid3x3 size={18} strokeWidth={2} aria-hidden />
            </span>
          ) : (
            <Grid3x3 size={22} strokeWidth={1.75} aria-hidden />
          )}
          <span className="text-[9px] font-bold leading-tight">{t("workspaceWidgets.mobileNav.moreApps")}</span>
        </button>
      </nav>
    </>
  );
}
