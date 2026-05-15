"use client";

import { useEffect } from "react";
import { applyAccessibilitySettings, readStoredAccessibilitySettings } from "@/lib/accessibility-settings";

/** מיישם העדפות נגישות/צבע מותג מ-localStorage בעת טעינת האפליקציה */
export function AccessibilitySettingsBootstrap() {
  useEffect(() => {
    applyAccessibilitySettings(readStoredAccessibilitySettings());
  }, []);
  return null;
}
