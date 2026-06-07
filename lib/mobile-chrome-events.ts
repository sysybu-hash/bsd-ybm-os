/** אירועים גלובליים לפתיחת פאנלי משוב ונגישות מהסרגל התחתון במובייל */
export const OPEN_FEEDBACK_FAB_EVENT = "bsd-open-feedback-fab";
export const OPEN_ACCESSIBILITY_PANEL_EVENT = "bsd-open-accessibility-panel";

export function openFeedbackFab() {
  window.dispatchEvent(new Event(OPEN_FEEDBACK_FAB_EVENT));
}

export function openAccessibilityPanel() {
  window.dispatchEvent(new Event(OPEN_ACCESSIBILITY_PANEL_EVENT));
}
