"use client";

import React, { useEffect, useState } from "react";
import { Accessibility } from "lucide-react";
import {
  applyAccessibilitySettings,
  readStoredAccessibilitySettings,
  type AccessibilitySettings,
} from "@/lib/accessibility-settings";
import AccessibilityPanelContent from "@/components/os/widgets/AccessibilityPanelContent";
import { useI18n } from "@/components/os/system/I18nProvider";

export const OPEN_ACCESSIBILITY_PANEL_EVENT = "bsd-open-accessibility-panel";

export default function AccessibilityToolbar() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readStoredAccessibilitySettings());

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_ACCESSIBILITY_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ACCESSIBILITY_PANEL_EVENT, onOpen);
  }, []);

  useEffect(() => {
    applyAccessibilitySettings(settings);
  }, [settings]);

  const label =
    t("accessibility.toolbar") !== "accessibility.toolbar" ? t("accessibility.toolbar") : "נגישות";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 start-4 z-[99980] flex h-12 w-12 items-center justify-center rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 text-indigo-600 shadow-lg backdrop-blur-md transition hover:scale-105 dark:text-indigo-400 sm:bottom-6"
        aria-label={label}
        aria-expanded={open}
        title={label}
      >
        <Accessibility size={22} aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className="fixed bottom-36 start-4 z-[99981] flex h-[min(70vh,520px)] w-[min(calc(100vw-2rem),380px)] flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl sm:bottom-20"
        >
          <div className="border-b border-[color:var(--border-main)] px-4 py-3">
            <h2 className="text-sm font-black text-[color:var(--foreground-main)]">{label}</h2>
          </div>
          <AccessibilityPanelContent value={settings} onChange={setSettings} />
        </div>
      ) : null}
    </>
  );
}
