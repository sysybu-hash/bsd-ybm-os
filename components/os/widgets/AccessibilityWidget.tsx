"use client";

import React, { useState } from "react";
import {
  applyAccessibilitySettings,
  readStoredAccessibilitySettings,
  type AccessibilitySettings,
} from "@/lib/accessibility-settings";
import AccessibilityPanelContent from "@/components/os/widgets/AccessibilityPanelContent";

export default function AccessibilityWidget() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readStoredAccessibilitySettings());

  const handleChange = (next: AccessibilitySettings) => {
    setSettings(next);
    applyAccessibilitySettings(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-transparent text-[color:var(--foreground-main)]">
      <AccessibilityPanelContent value={settings} onChange={handleChange} />
    </div>
  );
}
