"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Save, Settings2, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ACCESSIBILITY_THEME_OPTIONS,
  applyAccessibilitySettings,
  type AccessibilityFontScale,
  type AccessibilitySettings,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  readStoredAccessibilitySettings,
  writeStoredAccessibilitySettings,
} from "@/lib/accessibility-settings";

export type OmnibarQuickSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** פותח את ווידג׳ט הגדרות המערכת (עסק, מיתוג, API) */
  onOpenFullOsSettings: () => void;
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 transition hover:bg-[color:var(--surface-card)]/80">
      <span className="min-w-0">
        <span className="block text-xs font-black text-[color:var(--foreground-main)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[10px] font-semibold text-[color:var(--foreground-muted)]">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded border-[color:var(--border-main)] text-indigo-600 focus:ring-indigo-500/40"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function OmnibarQuickSettingsSheet({ open, onClose, onOpenFullOsSettings }: OmnibarQuickSettingsSheetProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [a11y, setA11y] = useState<AccessibilitySettings>(DEFAULT_ACCESSIBILITY_SETTINGS);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setA11y(readStoredAccessibilitySettings());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSaveA11y = useCallback(() => {
    writeStoredAccessibilitySettings(a11y);
    applyAccessibilitySettings(a11y);
    toast.success("הגדרות נגישות וצבע מותג נשמרו");
  }, [a11y]);

  const handleOpenFull = () => {
    onOpenFullOsSettings();
    onClose();
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1250] bg-black/50 backdrop-blur-[2px]"
            aria-label="סגור הגדרות"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="omnibar-quick-settings-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[1260] max-h-[min(78dvh,640px)] overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(440px,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2"
            dir="rtl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-500/20 text-slate-300">
                  <Settings2 size={18} aria-hidden />
                </div>
                <h2 id="omnibar-quick-settings-title" className="truncate text-sm font-black text-[color:var(--foreground-main)]">
                  הגדרות מהירות
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-main)] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
                aria-label="סגור"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="custom-scrollbar max-h-[calc(min(78dvh,640px)-8.5rem)] overflow-y-auto p-4">
              <section className="mb-5">
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">מראה</h3>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "light" as const, label: "בהיר", Icon: Sun },
                      { id: "dark" as const, label: "כהה", Icon: Moon },
                      { id: "system" as const, label: "מערכת", Icon: Monitor },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black transition ${
                        theme === id
                          ? "border-indigo-500/50 bg-indigo-600 text-white shadow-md"
                          : "border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                      }`}
                    >
                      <Icon size={14} aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] font-semibold text-[color:var(--foreground-muted)]">
                  מצב פעיל: {resolvedTheme === "dark" ? "כהה" : "בהיר"} (next-themes)
                </p>
              </section>

              <section className="mb-5">
                <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">נגישות וסגנון מותג</h3>
                <div className="mb-3">
                  <p className="mb-2 text-[10px] font-bold text-[color:var(--foreground-muted)]">צבע מותג (משתנים גלובליים)</p>
                  <div className="flex flex-wrap gap-2">
                    {ACCESSIBILITY_THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        title={opt.label}
                        onClick={() => setA11y((s) => ({ ...s, themeColor: opt.id }))}
                        className={`h-9 w-9 rounded-full border-2 transition ${
                          a11y.themeColor === opt.id ? "border-[color:var(--foreground-main)] ring-2 ring-indigo-500/30" : "border-transparent opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: opt.color }}
                        aria-label={opt.label}
                        aria-pressed={a11y.themeColor === opt.id}
                      />
                    ))}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">גודל טקסט</label>
                  <select
                    value={a11y.fontScale}
                    onChange={(e) => setA11y((s) => ({ ...s, fontScale: e.target.value as AccessibilityFontScale }))}
                    className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
                  >
                    <option value="default">רגיל</option>
                    <option value="large">גדול</option>
                    <option value="xlarge">גדול מאוד</option>
                  </select>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleRow label="ניגודיות גבוהה" checked={a11y.highContrast} onChange={(v) => setA11y((s) => ({ ...s, highContrast: v }))} />
                  <ToggleRow label="סמן גדול" checked={a11y.bigCursor} onChange={(v) => setA11y((s) => ({ ...s, bigCursor: v }))} />
                  <ToggleRow label="גווני אפור" checked={a11y.grayscale} onChange={(v) => setA11y((s) => ({ ...s, grayscale: v }))} />
                  <ToggleRow label="צמצום תנועה" description="אנימציות מופחתות" checked={a11y.reducedMotion} onChange={(v) => setA11y((s) => ({ ...s, reducedMotion: v }))} />
                  <ToggleRow label="מסגרת מיקוד בולטת" checked={a11y.focusRing} onChange={(v) => setA11y((s) => ({ ...s, focusRing: v }))} />
                  <ToggleRow label="ריווח שורות מורחב" checked={a11y.lineSpacing} onChange={(v) => setA11y((s) => ({ ...s, lineSpacing: v }))} />
                </div>
              </section>

              <p className="rounded-xl border border-dashed border-[color:var(--border-main)] bg-[color:var(--surface-card)]/30 p-3 text-[10px] font-semibold leading-relaxed text-[color:var(--foreground-muted)]">
                שמירה שולחת ל-localStorage ומיישמת מיד על הדף. הגדרות עסק, לוגו ו-API — בחלון &quot;הגדרות מערכת&quot; המלא.
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/95 p-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={handleSaveA11y}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-900/20 transition hover:bg-indigo-500"
              >
                <Save size={16} aria-hidden />
                שמור נגישות וצבע מותג
              </button>
              <button
                type="button"
                onClick={handleOpenFull}
                className="inline-flex items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2.5 text-xs font-black text-[color:var(--foreground-main)] transition hover:bg-[color:var(--surface-soft)]"
              >
                הגדרות מערכת מלאות…
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
