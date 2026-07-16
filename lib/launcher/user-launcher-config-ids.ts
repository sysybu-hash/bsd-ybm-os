/** ווידג'טים שהוסרו מהמערכת — מסוננים מ-localStorage ומברירת מחדל */
const REMOVED_LAUNCHER_WIDGET_IDS = new Set([
  "googleassistant",
  "google-assistant",
  "google_assistant",
  "google assistant",
  "negotiate",
  "omnibar",
]);

export function isRemovedLauncherWidgetId(raw: string): boolean {
  const key = raw.trim().toLowerCase();
  return REMOVED_LAUNCHER_WIDGET_IDS.has(key);
}
