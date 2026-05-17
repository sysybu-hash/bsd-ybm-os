"use client";

import React from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import {
  applyAccessibilitySettings,
  type AccessibilityFontScale,
  type AccessibilitySettings,
  writeStoredAccessibilitySettings,
} from "@/lib/accessibility-settings";
import { useI18n } from "@/components/os/system/I18nProvider";

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
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3">
      <span className="min-w-0">
        <span className="block text-xs font-black text-[color:var(--foreground-main)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[10px] font-semibold text-[color:var(--foreground-muted)]">{description}</span>
        ) : null}
      </span>
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export type AccessibilityPanelContentProps = {
  value: AccessibilitySettings;
  onChange: (next: AccessibilitySettings) => void;
  showSaveButton?: boolean;
};

export default function AccessibilityPanelContent({
  value,
  onChange,
  showSaveButton = true,
}: AccessibilityPanelContentProps) {
  const { t } = useI18n();

  const save = () => {
    writeStoredAccessibilitySettings(value);
    applyAccessibilitySettings(value);
    toast.success(t("accessibility.saved") !== "accessibility.saved" ? t("accessibility.saved") : "נשמר");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        <section className="mb-4">
          <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
            {t("accessibility.fontScale") !== "accessibility.fontScale" ? t("accessibility.fontScale") : "גודל טקסט"}
          </label>
          <select
            value={value.fontScale}
            onChange={(e) => onChange({ ...value, fontScale: e.target.value as AccessibilityFontScale })}
            className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs font-bold"
          >
            <option value="default">{t("accessibility.fontDefault") !== "accessibility.fontDefault" ? t("accessibility.fontDefault") : "רגיל"}</option>
            <option value="large">{t("accessibility.fontLarge") !== "accessibility.fontLarge" ? t("accessibility.fontLarge") : "גדול"}</option>
            <option value="xlarge">{t("accessibility.fontXlarge") !== "accessibility.fontXlarge" ? t("accessibility.fontXlarge") : "גדול מאוד"}</option>
          </select>
        </section>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow
            label={t("accessibility.highContrast") !== "accessibility.highContrast" ? t("accessibility.highContrast") : "ניגודיות גבוהה"}
            checked={value.highContrast}
            onChange={(v) => onChange({ ...value, highContrast: v })}
          />
          <ToggleRow
            label={t("accessibility.bigCursor") !== "accessibility.bigCursor" ? t("accessibility.bigCursor") : "סמן גדול"}
            checked={value.bigCursor}
            onChange={(v) => onChange({ ...value, bigCursor: v })}
          />
          <ToggleRow
            label={t("accessibility.grayscale") !== "accessibility.grayscale" ? t("accessibility.grayscale") : "גווני אפור"}
            checked={value.grayscale}
            onChange={(v) => onChange({ ...value, grayscale: v })}
          />
          <ToggleRow
            label={t("accessibility.reducedMotion") !== "accessibility.reducedMotion" ? t("accessibility.reducedMotion") : "צמצום תנועה"}
            checked={value.reducedMotion}
            onChange={(v) => onChange({ ...value, reducedMotion: v })}
          />
          <ToggleRow
            label={t("accessibility.focusRing") !== "accessibility.focusRing" ? t("accessibility.focusRing") : "מסגרת מיקוד"}
            checked={value.focusRing}
            onChange={(v) => onChange({ ...value, focusRing: v })}
          />
          <ToggleRow
            label={t("accessibility.lineSpacing") !== "accessibility.lineSpacing" ? t("accessibility.lineSpacing") : "ריווח שורות"}
            checked={value.lineSpacing}
            onChange={(v) => onChange({ ...value, lineSpacing: v })}
          />
        </div>
      </div>
      {showSaveButton ? (
        <div className="border-t border-[color:var(--border-main)] p-3">
          <button
            type="button"
            onClick={save}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white"
          >
            <Save size={16} aria-hidden />
            {t("accessibility.save") !== "accessibility.save" ? t("accessibility.save") : "שמור"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
