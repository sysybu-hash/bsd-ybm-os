"use client";

import React, { useState } from "react";
import {
  applyAccessibilitySettings,
  readStoredAccessibilitySettings,
  type AccessibilitySettings,
} from "@/lib/accessibility-settings";
import AccessibilityPanelContent from "@/components/os/widgets/AccessibilityPanelContent";
import WindowBody from "@/components/os/layout/WindowBody";

export default function AccessibilityWidget() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readStoredAccessibilitySettings());

  const handleChange = (next: AccessibilitySettings) => {
    setSettings(next);
    applyAccessibilitySettings(next);
  };

  return (
    <WindowBody className="text-[color:var(--foreground-main)]">
      <AccessibilityPanelContent value={settings} onChange={handleChange} />
    </WindowBody>
  );
}
