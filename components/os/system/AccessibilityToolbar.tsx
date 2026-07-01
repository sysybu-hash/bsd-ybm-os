"use client";

import React, { useEffect, useRef, useState } from "react";
import { Accessibility, X } from "lucide-react";
import {
  applyAccessibilitySettings,
  readStoredAccessibilitySettings,
  type AccessibilitySettings,
} from "@/lib/accessibility-settings";
import AccessibilityPanelContent from "@/components/os/widgets/AccessibilityPanelContent";
import { useI18n } from "@/components/os/system/I18nProvider";

import { OPEN_ACCESSIBILITY_PANEL_EVENT } from "@/lib/mobile-chrome-events";

export { OPEN_ACCESSIBILITY_PANEL_EVENT };

type Props = { hideFab?: boolean };

export default function AccessibilityToolbar({ hideFab = false }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readStoredAccessibilitySettings());
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_ACCESSIBILITY_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ACCESSIBILITY_PANEL_EVENT, onOpen);
  }, []);

  useEffect(() => {
    applyAccessibilitySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const label =
    t("accessibility.toolbar") !== "accessibility.toolbar" ? t("accessibility.toolbar") : "נגישות";

  return (
    <>
      {/* כפתור FAB — מוסתר במובייל (הלשונית בסרגל התחתון מחליפה אותו) */}
      {!hideFab ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="accessibility-toolbar-fab fixed end-4 z-[2401] hidden md:flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 text-[color:var(--win-accent,#6366f1)] shadow-sm backdrop-blur-md transition hover:bg-[color:var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
          aria-label={label}
          aria-expanded={open}
          aria-controls="accessibility-panel-dialog"
          title={label}
        >
          <Accessibility size={18} aria-hidden />
        </button>
      ) : null}
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[99980] bg-black/40"
            aria-label={t("accessibility.toolbar")}
            onClick={() => setOpen(false)}
          />
          <div
            id="accessibility-panel-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="accessibility-toolbar-panel fixed end-4 z-[99981] flex h-[min(70vh,520px)] w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl max-md:bottom-[calc(var(--mobile-chrome-bottom)+0.25rem)] max-md:end-1"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-4 py-3">
              <h2 className="text-sm font-black text-[color:var(--foreground-main)]">{label}</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                aria-label={t("siteFeedback.close")}
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <AccessibilityPanelContent value={settings} onChange={setSettings} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
