"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { CLASSIC_SECTIONS, type ClassicSectionId } from "@/lib/classic/sections";

type ClassicMobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  activeTab: ClassicSectionId;
  onSelect: (id: ClassicSectionId) => void;
  t: (key: string) => string;
};

/**
 * תפריט צד נשלף למובייל במצב הקלאסי — נפתח מכפתור המבורגר בכותרת ונשלף מצד ימין (RTL).
 * מחליף את הסרגל התחתון הקודם; אותם מדורים מ-CLASSIC_SECTIONS.
 */
export function ClassicMobileDrawer({
  open,
  onClose,
  activeTab,
  onSelect,
  t,
}: ClassicMobileDrawerProps) {
  // נעילת גלילת הרקע כשה-drawer פתוח + סגירה ב-Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] sm:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("workspaceWidgets.classicDashboard.sidebar.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      {/* Panel — slides from the inline-end (right in RTL) */}
      <div className="absolute inset-y-0 end-0 flex w-[78%] max-w-xs flex-col border-s border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--border-main)] px-4 py-3">
          <span className="text-base font-black text-[color:var(--foreground-main)]">
            {t("workspaceWidgets.classicDashboard.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("workspaceWidgets.classicDashboard.sidebar.close")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
          {CLASSIC_SECTIONS.map(({ id, labelKey, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelect(id);
                  onClose();
                }}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${
                  active
                    ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
                }`}
              >
                <Icon size={20} className="shrink-0" aria-hidden />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
