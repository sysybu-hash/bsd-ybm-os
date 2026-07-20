"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import {
  CLASSIC_NAV_GROUPS,
  classicSectionById,
  type ClassicSectionId,
} from "@/lib/classic/sections";

type ClassicMobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  activeTab: ClassicSectionId;
  onSelect: (id: ClassicSectionId) => void;
  t: (key: string) => string;
};

/**
 * תפריט צד נשלף למובייל במצב הקלאסי — אותן קבוצות כמו בסרגל הדסקטופ.
 */
export function ClassicMobileDrawer({
  open,
  onClose,
  activeTab,
  onSelect,
  t,
}: ClassicMobileDrawerProps) {
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
      <button
        type="button"
        aria-label={t("workspaceWidgets.classicDashboard.sidebar.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="absolute inset-y-0 end-0 flex w-[78%] max-w-xs flex-col border-s border-[color:var(--classic-rule)] bg-[color:var(--surface-card)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--classic-rule)] px-4 py-3">
          <span className="text-base font-bold text-[color:var(--classic-ink)]">
            {t("workspaceWidgets.classicDashboard.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("workspaceWidgets.classicDashboard.sidebar.close")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--classic-muted)] hover:bg-[color:var(--surface-soft)]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {CLASSIC_NAV_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-0.5">
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-[color:var(--classic-muted)]">
                {t(group.labelKey)}
              </p>
              {group.sectionIds.map((id) => {
                const section = classicSectionById(id);
                if (!section) return null;
                const { labelKey, icon: Icon } = section;
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
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
                      active
                        ? "font-bold text-[color:var(--classic-ink)]"
                        : "font-medium text-[color:var(--classic-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--classic-ink)]"
                    }`}
                  >
                    {active ? (
                      <span
                        className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-[color:var(--classic-accent)]"
                        aria-hidden
                      />
                    ) : null}
                    <Icon size={20} className="shrink-0" aria-hidden />
                    <span className="truncate">{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
