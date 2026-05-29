/** מסתיר chrome צף (FAB + סרגל תחתון) כשמודאל שיווקי פתוח */
export function setMarketingMobileOverlayOpen(open: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("marketing-mobile-overlay-open", open);
}
